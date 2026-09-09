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
    const initialPayload = { id: recordId, schemaVersion: 2, assignedTechnicianId: technician.user.id, job: { siteName: `Live API ${fixture.runId}` }, updatedAt: new Date().toISOString() };

    await t.test('members see only their organisation', async () => {
      const membership = await technician.client.from('organisation_members').select('organisation_id,role').eq('user_id', technician.user.id).single();
      assert.equal(membership.error, null);
      assert.deepEqual(membership.data, { organisation_id: primaryOrganisationId, role: 'technician' });

      const created = await administrator.client.rpc('save_commissioning_record', {
        record_id: recordId, target_organisation_id: primaryOrganisationId, record_payload: initialPayload, expected_revision: 0
      });
      assert.equal(created.error, null);
      assert.equal(firstRow(created.data).revision, 1);

      const outsiderRead = await outsider.client.from('commissioning_records')
        .select('id')
        .eq('organisation_id', primaryOrganisationId)
        .eq('id', recordId);
      assert.equal(outsiderRead.error, null);
      assert.deepEqual(outsiderRead.data, []);
      const outsiderWrite = await outsider.client.rpc('save_commissioning_record', {
        record_id: randomUUID(), target_organisation_id: primaryOrganisationId, record_payload: initialPayload, expected_revision: 0
      });
      assert.equal(outsiderWrite.error?.code, '42501');
    });

    let currentRevision;
    await t.test('members create and update records while stale revisions conflict', async () => {
      const technicianRecordId = randomUUID();
      const technicianCreated = await technician.client.rpc('save_commissioning_record', {
        record_id: technicianRecordId,
        target_organisation_id: primaryOrganisationId,
        record_payload: { ...initialPayload, id: technicianRecordId },
        expected_revision: 0
      });
      assert.equal(technicianCreated.error, null);
      assert.equal(firstRow(technicianCreated.data).revision, 1);

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
      const markers = await technician.client.rpc('list_commissioning_deletions', { target_organisation_id: primaryOrganisationId });
      assert.equal(markers.error, null);
      assert.equal(markers.data.find((row) => row.id === recordId)?.revision, deletedRevision);
      assert.ok(markers.data.every((row) => !('payload' in row)));
      const isolatedMarkers = await outsider.client.rpc('list_commissioning_deletions', { target_organisation_id: primaryOrganisationId });
      assert.equal(isolatedMarkers.error?.code, '42501');

      const restored = await administrator.client.rpc('restore_commissioning_record', {
        record_id: recordId, target_organisation_id: primaryOrganisationId, expected_revision: deletedRevision
      });
      assert.equal(restored.error, null);
      assert.equal(firstRow(restored.data).revision, deletedRevision + 1);
      assert.equal(firstRow(restored.data).deleted_at, null);
    });

    await t.test('one technician per plant is enforced for reads, writes and reassignment', async () => {
      const peer = await signInFixtureUser(fixture, 'peer');
      const plantId = randomUUID();
      const payload = { id: plantId, schemaVersion: 2, job: { siteName: 'Assignment permission fixture' } };
      const write = (client, body, revision) => client.rpc('save_commissioning_record', { record_id: plantId, target_organisation_id: primaryOrganisationId, record_payload: body, expected_revision: revision });
      const created = await write(technician.client, payload, 0);
      assert.equal(created.error, null);
      assert.equal(firstRow(created.data).assigned_technician_id, technician.user.id);
      assert.equal(firstRow(created.data).payload.assignedTechnicianId, technician.user.id);
      const peerRead = await peer.client.from('commissioning_records').select('id').eq('id', plantId);
      assert.deepEqual(peerRead.data, []);
      assert.equal((await write(peer.client, payload, 1)).error?.code, '42501');
      assert.equal((await write(technician.client, { ...payload, assignedTechnicianId: peer.user.id }, 1)).error?.code, '42501');
      const forged = await technician.client.rpc('save_commissioning_record', { record_id: randomUUID(), target_organisation_id: primaryOrganisationId, record_payload: { ...payload, assignedTechnicianId: peer.user.id }, expected_revision: 0 });
      assert.equal(forged.error?.code, '42501');
      const direct = await technician.client.from('commissioning_records').update({ assigned_technician_id: peer.user.id }).eq('id', plantId);
      assert.ok(direct.error);
      const badOrg = await write(administrator.client, { ...payload, assignedTechnicianId: outsider.user.id }, 1);
      assert.equal(badOrg.error?.code, '22023');
      const reassigned = await write(administrator.client, { ...payload, assignedTechnicianId: peer.user.id }, 1);
      assert.equal(reassigned.error, null);
      assert.equal(firstRow(reassigned.data).revision, 2);
      assert.equal((await write(technician.client, payload, 1)).error?.code, '42501');
      const withdrawn = await technician.client.rpc('sync_assigned_commissioning_records', { target_organisation_id: primaryOrganisationId, known_record_ids: [plantId] });
      assert.equal(withdrawn.error, null);
      assert.ok(withdrawn.data.withdrawn.includes(plantId));
      assert.ok(!withdrawn.data.records.some((row) => row.id === plantId));
      const peerVisible = await peer.client.from('commissioning_records').select('id').eq('id', plantId);
      assert.equal(peerVisible.data.length, 1);
      const completedEdit = await write(peer.client, { ...payload, status: 'Completed' }, 2);
      assert.equal(completedEdit.error, null);
      assert.equal((await write(peer.client, { ...payload, status: 'Completed', results: { notes: 'Edited after completion' } }, 3)).error, null);
      assert.equal((await write(administrator.client, { ...payload, assignedTechnicianId: null }, 4)).error, null);
      assert.deepEqual((await peer.client.from('commissioning_records').select('id').eq('id', plantId)).data, []);
      const roster = await administrator.client.rpc('list_assignable_technicians', { target_organisation_id: primaryOrganisationId });
      assert.equal(roster.error, null);
      assert.deepEqual(new Set(roster.data.map((person) => person.user_id)), new Set([technician.user.id, peer.user.id]));
      assert.equal((await technician.client.rpc('list_assignable_technicians', { target_organisation_id: primaryOrganisationId })).error?.code, '42501');
    });

    await t.test('revoked membership removes access from an existing session', async () => {
      const revoked = await fixture.admin.from('organisation_members')
        .delete()
        .eq('organisation_id', primaryOrganisationId)
        .eq('user_id', technician.user.id);
      assert.equal(revoked.error, null);

      const membershipAfterRevocation = await technician.client.from('organisation_members')
        .select('organisation_id,role')
        .eq('user_id', technician.user.id);
      assert.equal(membershipAfterRevocation.error, null);
      assert.deepEqual(membershipAfterRevocation.data, []);

      const recordsAfterRevocation = await technician.client.from('commissioning_records')
        .select('id')
        .eq('organisation_id', primaryOrganisationId);
      assert.equal(recordsAfterRevocation.error, null);
      assert.deepEqual(recordsAfterRevocation.data, []);
      const markersAfterRevocation = await technician.client.rpc('list_commissioning_deletions', { target_organisation_id: primaryOrganisationId });
      assert.equal(markersAfterRevocation.error?.code, '42501');

      const writeAfterRevocation = await technician.client.rpc('save_commissioning_record', {
        record_id: randomUUID(),
        target_organisation_id: primaryOrganisationId,
        record_payload: initialPayload,
        expected_revision: 0
      });
      assert.equal(writeAfterRevocation.error?.code, '42501');
    });
  } finally {
    await cleanupLiveTestFixture(fixture);
  }
});
