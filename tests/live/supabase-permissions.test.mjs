import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  cleanupLiveTestFixture,
  createLiveTestFixture,
  createTestClient,
  signInFixtureUser
} from './live-test-fixture.mjs';

function firstRow(data) { return Array.isArray(data) ? data[0] : data; }

test('live Supabase roles, isolation, revisions and lifecycle', { timeout: 120_000 }, async (t) => {
  let fixture;
  try {
    fixture = await createLiveTestFixture();
    const anonymous = createTestClient(fixture.config.supabaseUrl, fixture.config.publishableKey);
    const anonymousRead = await anonymous.from('commissioning_records').select('id').limit(1);
    assert.ok(anonymousRead.error, 'Anonymous table reads must be denied.');

    const administrator = await signInFixtureUser(fixture, 'administrator');
    const technician = await signInFixtureUser(fixture, 'technician');
    const outsider = await signInFixtureUser(fixture, 'outsider');
    const primaryOrganisationId = fixture.organisationIds[0];
    const recordId = randomUUID();
    const initialPayload = { id: recordId, schemaVersion: 2, job: { siteName: `Live API ${fixture.runId}` }, updatedAt: new Date().toISOString() };

    await t.test('members see only their organisation', async () => {
      const membership = await technician.client.from('organisation_members').select('organisation_id,role').eq('user_id', technician.user.id).single();
      assert.equal(membership.error, null);
      assert.deepEqual(membership.data, { organisation_id: primaryOrganisationId, role: 'technician' });
      const outsiderRead = await outsider.client.from('commissioning_records').select('id').eq('organisation_id', primaryOrganisationId);
      assert.equal(outsiderRead.error, null);
      assert.deepEqual(outsiderRead.data, []);
      const outsiderWrite = await outsider.client.rpc('save_commissioning_record', {
        record_id: randomUUID(), target_organisation_id: primaryOrganisationId, record_payload: initialPayload, expected_revision: 0
      });
      assert.equal(outsiderWrite.error?.code, '42501');
    });

    let currentRevision;
    await t.test('members save records and stale revisions conflict', async () => {
      const created = await administrator.client.rpc('save_commissioning_record', {
        record_id: recordId, target_organisation_id: primaryOrganisationId, record_payload: initialPayload, expected_revision: 0
      });
      assert.equal(created.error, null);
      assert.equal(firstRow(created.data).revision, 1);

      const technicianPayload = { ...initialPayload, job: { siteName: `Technician update ${fixture.runId}` }, updatedAt: new Date().toISOString() };
      const updated = await technician.client.rpc('save_commissioning_record', {
        record_id: recordId, target_organisation_id: primaryOrganisationId, record_payload: technicianPayload, expected_revision: 1
      });
      assert.equal(updated.error, null);
      currentRevision = firstRow(updated.data).revision;
      assert.equal(currentRevision, 2);

      const stale = await administrator.client.rpc('save_commissioning_record', {
        record_id: recordId, target_organisation_id: primaryOrganisationId, record_payload: initialPayload, expected_revision: 1
      });
      assert.equal(stale.error?.code, 'PT409');
    });

    await t.test('only administrators delete and restore', async () => {
      const technicianDelete = await technician.client.rpc('soft_delete_commissioning_record', {
        record_id: recordId, target_organisation_id: primaryOrganisationId, expected_revision: currentRevision
      });
      assert.equal(technicianDelete.error?.code, '42501');

      const deleted = await administrator.client.rpc('soft_delete_commissioning_record', {
        record_id: recordId, target_organisation_id: primaryOrganisationId, expected_revision: currentRevision
      });
      assert.equal(deleted.error, null);
      const deletedRevision = firstRow(deleted.data).revision;
      assert.ok(firstRow(deleted.data).deleted_at);

      const technicianRows = await technician.client.from('commissioning_records').select('id').eq('id', recordId);
      assert.equal(technicianRows.error, null);
      assert.deepEqual(technicianRows.data, []);

      const restored = await administrator.client.rpc('restore_commissioning_record', {
        record_id: recordId, target_organisation_id: primaryOrganisationId, expected_revision: deletedRevision
      });
      assert.equal(restored.error, null);
      assert.equal(firstRow(restored.data).revision, deletedRevision + 1);
      assert.equal(firstRow(restored.data).deleted_at, null);
    });
  } finally {
    await cleanupLiveTestFixture(fixture);
  }
});
