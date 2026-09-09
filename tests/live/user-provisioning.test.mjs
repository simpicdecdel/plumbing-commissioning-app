import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdapter, provisionUsers } from '../../scripts/provision-users.mjs';
import { createLiveTestFixture, cleanupLiveTestFixture, createTestClient, TEST_PURPOSE } from './live-test-fixture.mjs';

test('user tool creates a usable technician, safely repeats and rejects a role change', async () => {
  const fixture = await createLiveTestFixture(); // Includes the fail-closed production guard.
  const adapter = createAdapter(fixture.admin);
  const create = adapter.createUser;
  adapter.createUser = async (attributes) => {
    const user = await create({ ...attributes, user_metadata: {
      ...attributes.user_metadata, test_purpose: TEST_PURPOSE, test_run_id: fixture.runId
    } });
    fixture.users.provisioned = user;
    return user;
  };
  const users = [{ firstName: 'Test', surname: 'Technician',
    email: `plumbing-live-${fixture.runId}-provisioned@example.invalid`, role: 'technician' }];
  const options = { users, adapter, organisationId: fixture.organisationIds[0],
    password: fixture.users.technician.password, apply: true };
  let client;
  try {
    assert.equal((await provisionUsers(options))[0].status, 'ready');
    assert.equal((await provisionUsers({ ...options, password: 'another-password' }))[0].status, 'already exists');
    await assert.rejects(provisionUsers({ ...options, users: [{ ...users[0], role: 'administrator' }] }), /existing role differs/);
    client = createTestClient(fixture.config.supabaseUrl, fixture.config.publishableKey);
    const login = await client.auth.signInWithPassword({ email: users[0].email, password: options.password });
    assert.equal(login.error, null);
    const memberships = await client.from('organisation_members').select('role').eq('user_id', login.data.user.id);
    assert.equal(memberships.error, null);
    assert.deepEqual(memberships.data, [{ role: 'technician' }]);
    const records = await client.rpc('sync_assigned_commissioning_records', { target_organisation_id: fixture.organisationIds[0], known_record_ids: [] });
    assert.equal(records.error, null);
    assert.deepEqual(records.data.records, []);
  } finally {
    if (client) await client.auth.signOut();
    await cleanupLiveTestFixture(fixture);
  }
});
