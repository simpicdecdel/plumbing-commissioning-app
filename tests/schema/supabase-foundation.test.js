import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateRemoteConfig } from '../../remote-config.js';

const migrationUrl = new URL('../../supabase/migrations/20260820000000_initial_multi_user_schema.sql', import.meta.url);
const migration = await readFile(migrationUrl, 'utf8');

test('all exposed tables enable row-level security', () => {
  for (const table of ['organisations', 'organisation_members', 'commissioning_records']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security;`, 'i'));
  }
});

test('anonymous and direct authenticated writes are revoked', () => {
  assert.match(migration, /revoke all on table public\.commissioning_records from anon, authenticated;/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete|all)[^;]*commissioning_records[^;]*authenticated/i);
});

test('write functions use fixed search paths and explicit grants', () => {
  for (const functionName of [
    'save_commissioning_record',
    'soft_delete_commissioning_record',
    'restore_commissioning_record'
  ]) {
    const definition = new RegExp(
      `function public\\.${functionName}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`,
      'i'
    );
    assert.match(migration, definition);
    assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}`, 'i'));
  }
});

test('revision checks and administrator-only lifecycle operations are defined', () => {
  assert.match(migration, /and revision = expected_revision/i);
  assert.match(migration, /errcode = '40001'/i);
  assert.match(migration, /private\.is_organisation_administrator\(target_organisation_id\)/i);
  assert.match(migration, /deleted_at = now\(\)/i);
  assert.match(migration, /deleted_at = null/i);
});

test('missing public configuration leaves remote access disabled', () => {
  assert.deepEqual(validateRemoteConfig(), { enabled: false, reason: 'not-configured' });
});

test('only an HTTPS Supabase URL and publishable key enable remote access', () => {
  assert.deepEqual(validateRemoteConfig({
    supabaseUrl: 'https://example-project.supabase.co',
    supabasePublishableKey: 'sb_publishable_example_123'
  }), {
    enabled: true,
    supabaseUrl: 'https://example-project.supabase.co',
    supabasePublishableKey: 'sb_publishable_example_123'
  });

  assert.throws(() => validateRemoteConfig({
    supabaseUrl: 'http://example-project.supabase.co',
    supabasePublishableKey: 'sb_publishable_example_123'
  }), /Supabase URL/);

  assert.throws(() => validateRemoteConfig({
    supabaseUrl: 'https://example-project.supabase.co',
    supabasePublishableKey: 'sb_secret_do_not_use'
  }), /publishable key/);
});
