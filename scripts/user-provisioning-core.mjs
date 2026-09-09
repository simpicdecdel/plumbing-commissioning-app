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
