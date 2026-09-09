import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { PROJECT_REF, ORGANISATION_ID, ProvisionError, validateUsers, provisionUsers, createAdapter } from './user-provisioning-core.mjs';
export * from './user-provisioning-core.mjs';

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
