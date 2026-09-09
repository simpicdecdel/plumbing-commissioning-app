import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

export const PROJECT_REF = 'gdtnotmfvaqqpgxtxvjy';
export const ORGANISATION_ID = '6c1401be-4270-4626-90ae-110fb2a761d9';
const PROVISIONER = 'plumbing-user-tool-v1';
export class ProvisionError extends Error {}

export function validateUsers(input) {
  if (!Array.isArray(input) || !input.length || input.length > 100) {
    throw new ProvisionError('Supply between 1 and 100 users.');
  }
  const emails = new Set();
  return input.map((row, index) => {
    const fields = ['firstName', 'surname', 'email', 'role'];
    if (!row || fields.some((key) => typeof row[key] !== 'string')) {
      throw new ProvisionError(`Row ${index + 1}: firstName, surname, email and role are required.`);
    }
    const user = Object.fromEntries(fields.map((key) => [key, row[key].trim()]));
    if ([user.firstName, user.surname].some((name) => !name || name.length > 100 || /[\x00-\x1f\x7f]/.test(name))) {
      throw new ProvisionError(`Row ${index + 1}: supply valid first name and surname.`);
    }
    user.email = user.email.toLowerCase();
    user.role = user.role.toLowerCase();
    if (user.email.length > 254 || !/^[^\s@\x00-\x1f\x7f]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
      throw new ProvisionError(`Row ${index + 1}: invalid email address.`);
    }
    if (!['administrator', 'technician'].includes(user.role)) {
      throw new ProvisionError(`Row ${index + 1}: role must be administrator or technician.`);
    }
    if (emails.has(user.email)) throw new ProvisionError(`Row ${index + 1}: duplicate email address.`);
    emails.add(user.email);
    return user;
  });
}

function checkExisting(spec, user, memberships, organisationId) {
  if (!user) return 'create';
  const membership = memberships.find((item) => item.user_id === user.id && item.organisation_id === organisationId);
  if (membership) {
    if (membership.role !== spec.role) throw new ProvisionError(`${spec.email}: existing role differs. No role changes are allowed by this tool.`);
    return 'already exists';
  }
  // Only resume an incomplete creation that this tool started. Never grant an
  // unrelated existing Auth account access merely because its email matches.
  if (user.app_metadata?.provisioner !== PROVISIONER || user.app_metadata?.provisioning_organisation !== organisationId
    || user.app_metadata?.provisioning_role !== spec.role) {
    throw new ProvisionError(`${spec.email}: existing account has no matching membership. Manual review required.`);
  }
  return 'resume membership';
}

export async function provisionUsers({ users: input, adapter, apply = false, password = 'password', organisationId = ORGANISATION_ID }) {
  const users = validateUsers(input);
  if (typeof password !== 'string' || password.length < 8) throw new ProvisionError('Initial password must have at least eight characters.');
  await adapter.checkOrganisation(organisationId);
  const existing = await adapter.listUsers();
  const memberships = await adapter.listMemberships(organisationId);
  // Preflight the whole batch before creating anything.
  const plan = users.map((spec) => {
    const user = existing.find((item) => item.email?.toLowerCase() === spec.email);
    return { spec, user, action: checkExisting(spec, user, memberships, organisationId) };
  });
  const results = [];
  for (const entry of plan) {
    const { spec, action } = entry;
    let user = entry.user;
    if (apply && action !== 'already exists') {
      if (!user) {
        user = await adapter.createUser({
          email: spec.email, password, email_confirm: true,
          user_metadata: { first_name: spec.firstName, last_name: spec.surname, full_name: `${spec.firstName} ${spec.surname}` },
          app_metadata: { provisioner: PROVISIONER, provisioning_organisation: organisationId, provisioning_role: spec.role }
        });
      }
      // Auth and membership writes are not atomic. On failure, leave the tagged
      // account in place without access; a repeat run can safely finish it.
      await adapter.addMembership({ organisation_id: organisationId, user_id: user.id, role: spec.role });
      const verified = await adapter.listMemberships(organisationId);
      if (!verified.some((item) => item.user_id === user.id && item.role === spec.role)) {
        throw new ProvisionError(`${spec.email}: membership verification failed. Re-run the same input to inspect/resume.`);
      }
    }
    results.push({ email: spec.email, role: spec.role, userId: user?.id ?? null,
      status: !apply ? `preview: ${action}` : action === 'already exists' ? action : 'ready' });
  }
  return results;
}

export function createAdapter(client) {
  async function request(operation, fn) {
    try {
      const { data, error } = await fn();
      if (error) throw error;
      return data;
    } catch {
      // Never emit raw SDK errors, request bodies, passwords or API keys.
      throw new ProvisionError(`${operation} failed. The batch may be partially complete; re-run the same input to inspect/resume. Credentials were not printed.`);
    }
  }
  return {
    async checkOrganisation(id) {
      await request('Organisation lookup', () => client.from('organisations').select('id').eq('id', id).single());
    },
    async listUsers() {
      const users = [];
      for (let page = 1; ; page++) {
        const data = await request('Account lookup', () => client.auth.admin.listUsers({ page, perPage: 1000 }));
        users.push(...data.users);
        if (data.users.length < 1000) return users;
      }
    },
    async listMemberships(id) {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const data = await request('Membership lookup', () => client.from('organisation_members')
          .select('organisation_id,user_id,role').eq('organisation_id', id).order('user_id').range(offset, offset + 999));
        rows.push(...data);
        if (data.length < 1000) return rows;
      }
    },
    async createUser(attributes) {
      const data = await request('Account creation', () => client.auth.admin.createUser(attributes));
      if (!data?.user?.id) throw new ProvisionError('Account creation returned no ID. Re-run the same input to inspect/resume.');
      return data.user;
    },
    async addMembership(row) {
      await request('Membership creation', () => client.from('organisation_members').insert(row));
    }
  };
}

async function run() {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 200_000) throw new ProvisionError('Input is too large.');
  }
  let input;
  try { input = JSON.parse(raw.replace(/^\uFEFF/, '')); }
  catch { throw new ProvisionError('Supply a JSON object containing users and optional apply via standard input.'); }
  const users = validateUsers(input.users);
  if (input.validateOnly === true) {
    console.log(JSON.stringify({ valid: true, users }, null, 2));
    return;
  }
  if (input.apply !== undefined && typeof input.apply !== 'boolean') throw new ProvisionError('apply must be a boolean.');
  const token = input.managementToken || process.env.PLUMBING_SUPABASE_MANAGEMENT_TOKEN;
  if (!token) throw new ProvisionError('No management credential configured. Use the Windows launcher or PLUMBING_SUPABASE_MANAGEMENT_TOKEN.');
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new ProvisionError(`Project key lookup failed (HTTP ${response.status}). Check the management credential permissions and expiry.`);
  const keys = await response.json();
  const key = keys.find((item) => item.type === 'secret' && item.api_key?.startsWith('sb_secret_'))?.api_key
    || keys.find((item) => item.name === 'service_role')?.api_key;
  if (!key) throw new ProvisionError('No server-side project key available. No users changed.');
  const client = createClient(`https://${PROJECT_REF}.supabase.co`, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options) => fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30_000) }) }
  });
  const results = await provisionUsers({ users, adapter: createAdapter(client), apply: input.apply === true,
    password: process.env.PLUMBING_INITIAL_PASSWORD ?? 'password' });
  console.log(JSON.stringify({ project: PROJECT_REF, organisationId: ORGANISATION_ID, applied: input.apply === true, results }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(error instanceof ProvisionError ? error.message : 'User provisioning failed. Check connectivity and configuration; re-run the same input to inspect/resume. Credentials were not printed.');
    process.exitCode = 1;
  });
}
