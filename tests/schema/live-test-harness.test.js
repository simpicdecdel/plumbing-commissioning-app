import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixture = await readFile(new URL('../live/live-test-fixture.mjs', import.meta.url), 'utf8');
const permissions = await readFile(new URL('../live/supabase-permissions.test.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../../.github/workflows/live-supabase.yml', import.meta.url), 'utf8');
const gitignore = await readFile(new URL('../../.gitignore', import.meta.url), 'utf8');

test('live test users are tagged and deleted with their isolated data', () => {
  assert.match(fixture, /test_purpose: TEST_PURPOSE/);
  assert.match(fixture, /commissioning_records'\)\.delete\(\)/);
  assert.match(fixture, /organisation_members'\)\.delete\(\)/);
  assert.match(fixture, /organisations'\)\.delete\(\)/);
  assert.match(fixture, /auth\.admin\.deleteUser/);
  assert.match(fixture, /\.like\('name', `\$\{TEST_ORGANISATION_PREFIX\}%`\)/);
  assert.match(fixture, /finally|catch/);
});

test('live tests require explicit enablement and environment-only secrets', () => {
  assert.match(fixture, /PLUMBING_LIVE_TESTS !== '1'/);
  assert.match(fixture, /PLUMBING_TEST_SUPABASE_SECRET_KEY/);
  assert.match(fixture, /supabaseUrl\.toLowerCase\(\) === productionSupabaseUrl\.toLowerCase\(\)/);
  assert.match(fixture, /Live tests cannot use the production Supabase project/);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /secrets\.PLUMBING_TEST_SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(fixture, /sb_secret_[A-Za-z0-9_-]{8,}/);
});

test('live permission matrix includes active roles, isolation and immediate membership revocation', () => {
  assert.match(permissions, /members see only their organisation/);
  assert.match(permissions, /members create and update records while stale revisions conflict/);
  assert.match(permissions, /only administrators delete and restore/);
  assert.match(permissions, /revoked membership removes access from an existing session/);
  assert.match(permissions, /organisation_members'\)\s*\.delete\(\)/);
  assert.match(permissions, /writeAfterRevocation\.error\?\.code, '42501'/);
});
