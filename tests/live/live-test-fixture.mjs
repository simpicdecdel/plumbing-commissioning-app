import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';

try { loadEnvFile('.env.live-tests'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

export const TEST_PURPOSE = 'plumbing-commissioning-live-test';
const TEST_EMAIL_PREFIX = 'plumbing-live-';
const TEST_ORGANISATION_PREFIX = 'Automated live test ';
const LIVE_REQUEST_TIMEOUT_MS = 15_000;
const productionConfig = readFileSync(new URL('../../config.js', import.meta.url), 'utf8');
const productionSupabaseUrl = productionConfig.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i)?.[0];

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Copy .env.live-tests.example and supply the test-project value through the process environment.`);
  return value;
}

export function getLiveTestConfig() {
  if (process.env.PLUMBING_LIVE_TESTS !== '1') {
    throw new Error('Live tests are disabled. Set PLUMBING_LIVE_TESTS=1 only for an approved test project.');
  }
  const supabaseUrl = requiredEnvironment('PLUMBING_TEST_SUPABASE_URL');
  const publishableKey = requiredEnvironment('PLUMBING_TEST_SUPABASE_PUBLISHABLE_KEY');
  const secretKey = requiredEnvironment('PLUMBING_TEST_SUPABASE_SECRET_KEY');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) throw new Error('PLUMBING_TEST_SUPABASE_URL must be an HTTPS Supabase project URL.');
  if (!productionSupabaseUrl) throw new Error('Could not determine the production Supabase URL from config.js. Live tests stopped without connecting.');
  if (supabaseUrl.toLowerCase() === productionSupabaseUrl.toLowerCase()) throw new Error('Live tests cannot use the production Supabase project configured in config.js. Configure a separate disposable test project.');
  if (!publishableKey.startsWith('sb_publishable_') && publishableKey.split('.').length !== 3) throw new Error('The live-test publishable key format is invalid.');
  if (!secretKey.startsWith('sb_secret_') && secretKey.split('.').length !== 3) throw new Error('The live-test secret key format is invalid.');
  return { supabaseUrl, publishableKey, secretKey };
}

export function createTestClient(supabaseUrl, key) {
  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: {
      fetch: (input, init = {}) => fetch(input, {
        ...init,
        signal: AbortSignal.timeout(LIVE_REQUEST_TIMEOUT_MS)
      })
    }
  });
}

function requireResult(result, operation) {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  return result.data;
}

async function deleteFixtureData(admin, organisationIds, userIds) {
  if (organisationIds.length) {
    requireResult(await admin.from('commissioning_records').delete().in('organisation_id', organisationIds), 'Delete test records');
    requireResult(await admin.from('organisation_members').delete().in('organisation_id', organisationIds), 'Delete test memberships');
    requireResult(await admin.from('organisations').delete().in('id', organisationIds), 'Delete test organisations');
  }
  for (const userId of userIds) requireResult(await admin.auth.admin.deleteUser(userId), `Delete test user ${userId}`);
}

export async function createLiveTestFixture() {
  const config = getLiveTestConfig();
  const admin = createTestClient(config.supabaseUrl, config.secretKey);
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = randomBytes(24).toString('base64url');
  const organisationIds = [randomUUID(), randomUUID()];
  const userSpecs = [
    { key: 'administrator', role: 'administrator', organisationId: organisationIds[0] },
    { key: 'technician', role: 'technician', organisationId: organisationIds[0] },
    { key: 'outsider', role: 'administrator', organisationId: organisationIds[1] }
  ];
  const users = {};

  try {
    requireResult(await admin.from('organisations').insert([
      { id: organisationIds[0], name: `${TEST_ORGANISATION_PREFIX}${runId} primary` },
      { id: organisationIds[1], name: `${TEST_ORGANISATION_PREFIX}${runId} isolated` }
    ]), 'Create test organisations');

    for (const spec of userSpecs) {
      const email = `${TEST_EMAIL_PREFIX}${runId}-${spec.key}@example.invalid`;
      const data = requireResult(await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { test_purpose: TEST_PURPOSE, test_run_id: runId, test_role: spec.key }
      }), `Create ${spec.key} test user`);
      users[spec.key] = { id: data.user.id, email, password, role: spec.role, organisationId: spec.organisationId };
    }

    requireResult(await admin.from('organisation_members').insert(userSpecs.map((spec) => ({
      organisation_id: spec.organisationId,
      user_id: users[spec.key].id,
      role: spec.role
    }))), 'Create test memberships');

    return { admin, config, organisationIds, runId, users };
  } catch (error) {
    await deleteFixtureData(admin, organisationIds, Object.values(users).map((user) => user.id)).catch((cleanupError) => {
      error.message += ` Cleanup also failed: ${cleanupError.message}`;
    });
    throw error;
  }
}

export async function signInFixtureUser(fixture, userKey) {
  const credentials = fixture.users[userKey];
  const client = createTestClient(fixture.config.supabaseUrl, fixture.config.publishableKey);
  const data = requireResult(await client.auth.signInWithPassword({ email: credentials.email, password: credentials.password }), `Sign in ${userKey}`);
  return { client, session: data.session, user: data.user };
}

export async function cleanupLiveTestFixture(fixture) {
  if (!fixture) return;
  await deleteFixtureData(fixture.admin, fixture.organisationIds, Object.values(fixture.users).map((user) => user.id));
}

export async function cleanupStaleLiveTestData() {
  const config = getLiveTestConfig();
  const admin = createTestClient(config.supabaseUrl, config.secretKey);
  const allUsers = [];
  for (let page = 1; ; page += 1) {
    const data = requireResult(await admin.auth.admin.listUsers({ page, perPage: 1000 }), `List test users page ${page}`);
    allUsers.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const testUsers = allUsers.filter((user) => user.email?.startsWith(TEST_EMAIL_PREFIX)
    && user.user_metadata?.test_purpose === TEST_PURPOSE);
  const userIds = testUsers.map((user) => user.id);
  const memberships = userIds.length
    ? requireResult(await admin.from('organisation_members').select('organisation_id,user_id').in('user_id', userIds), 'Find test memberships')
    : [];
  const testOrganisations = requireResult(await admin.from('organisations')
    .select('id,name')
    .like('name', `${TEST_ORGANISATION_PREFIX}%`), 'Find test organisations');
  const testOrganisationIds = testOrganisations.map((organisation) => organisation.id);
  const unsafeMembership = memberships.find((membership) => !testOrganisationIds.includes(membership.organisation_id));
  if (unsafeMembership) throw new Error('A tagged test user belongs to a non-test organisation. Cleanup stopped without deleting users.');

  await deleteFixtureData(admin, testOrganisationIds, userIds);
  return { organisations: testOrganisationIds.length, users: userIds.length };
}
