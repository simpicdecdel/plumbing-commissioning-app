(function initialiseCommissioningStore(global) {
  'use strict';

  const DATABASE_NAME = 'plumbing-commissioning';
  const LEGACY_RECORDS_KEY = 'plumbing-commissioning-records-v1';
  const LEGACY_DRAFT_KEY = 'plumbing-commissioning-autosave-v1';
  const DRAFT_KEY = 'current';

  if (!global.Dexie) throw new Error('Dexie failed to load.');

  const database = new global.Dexie(DATABASE_NAME);
  database.version(1).stores({
    records: '&id, status, updatedAt',
    drafts: '&key, updatedAt',
    metadata: '&key'
  });
  database.version(2).stores({
    records: '&id, status, updatedAt',
    drafts: '&key, updatedAt',
    metadata: '&key',
    sync: '&recordId, remoteId, organisationId, state, [organisationId+remoteId]'
  });

  function makeId(prefix = 'record') {
    return global.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function makeUuid() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    global.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function copy(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function readLegacyValue(key) {
    try {
      const value = global.localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function legacyRecordToPlantRecord(record = {}) {
    const unitStatus = record.outcome === 'Failed' ? 'Fault / exception' : 'Operational';
    return {
      id: record.id || makeId(),
      schemaVersion: 2,
      status: record.status || 'Draft',
      job: {
        siteName: record.customer || '',
        reference: record.jobReference || '',
        address: record.address || '',
        commissioningDate: record.commissioningDate || '',
        technician: record.technician || ''
      },
      plant: {
        name: record.applianceLocation || record.applianceType || 'Migrated plant',
        location: record.applianceLocation || '',
        type: record.applianceType || 'Other'
      },
      units: [{
        id: makeId('unit'),
        label: record.applianceLocation || record.serialNumber || 'Unit 1',
        manufacturer: record.manufacturer || '',
        model: record.model || '',
        serialNumber: record.serialNumber || '',
        status: unitStatus,
        exception: unitStatus === 'Fault / exception' ? (record.notes || 'Migrated from a failed appliance record.') : ''
      }],
      installationChecks: {
        secure: Boolean(record.secure),
        connections: Boolean(record.connections),
        leakFree: Boolean(record.leakFree),
        isolation: Boolean(record.isolation),
        drainage: Boolean(record.drainage),
        manufacturerInstructions: Boolean(record.manufacturerInstructions)
      },
      results: {
        staticPressure: record.staticPressure || '',
        flowPressure: record.flowPressure || '',
        flowRate: record.flowRate || '',
        outletTemperature: record.outletTemperature || '',
        outcome: record.outcome || '',
        notes: record.notes || ''
      },
      handover: {
        operationDemonstrated: Boolean(record.operationDemonstrated),
        documentsProvided: Boolean(record.documentsProvided),
        siteLeftClean: Boolean(record.siteLeftClean),
        customerRepresentative: record.customerRepresentative || '',
        handoverDate: record.handoverDate || ''
      },
      migratedFrom: 'localStorage-v1',
      updatedAt: record.updatedAt || new Date().toISOString()
    };
  }

  async function migrateLegacyLocalStorage() {
    const migration = await database.metadata.get('localStorage-v1');
    if (migration?.completedAt) return migration;

    const legacyRecords = readLegacyValue(LEGACY_RECORDS_KEY);
    const legacyDraft = readLegacyValue(LEGACY_DRAFT_KEY);
    const records = Array.isArray(legacyRecords) ? legacyRecords.map(legacyRecordToPlantRecord) : [];

    await database.transaction('rw', database.records, database.drafts, database.metadata, async () => {
      if (records.length) await database.records.bulkPut(records);
      if (legacyDraft && typeof legacyDraft === 'object') {
        await database.drafts.put({ key: DRAFT_KEY, record: legacyRecordToPlantRecord(legacyDraft), updatedAt: new Date().toISOString() });
      }
      await database.metadata.put({
        key: 'localStorage-v1',
        completedAt: new Date().toISOString(),
        migratedRecordCount: records.length,
        migratedDraft: Boolean(legacyDraft)
      });
    });

    // Remove legacy values only after the IndexedDB transaction succeeds.
    global.localStorage.removeItem(LEGACY_RECORDS_KEY);
    global.localStorage.removeItem(LEGACY_DRAFT_KEY);
    return database.metadata.get('localStorage-v1');
  }

  const ready = migrateLegacyLocalStorage();

  global.commissioningStore = Object.freeze({
    async initialise() {
      return ready;
    },
    async listRecords() {
      await ready;
      return database.records.orderBy('updatedAt').reverse().toArray();
    },
    async getRecord(id) {
      await ready;
      return database.records.get(id);
    },
    async saveRecord(record) {
      await ready;
      await database.records.put(record);
      return record;
    },
    async restoreRecords(records) {
      await ready;
      return database.transaction('rw', database.records, async () => {
        const existingIds = new Set(await database.records.bulkGet(records.map((record) => record.id))
          .then((items) => items.filter(Boolean).map((record) => record.id)));
        await database.records.bulkPut(records);
        return {
          restored: records.length,
          added: records.length - existingIds.size,
          replaced: existingIds.size
        };
      });
    },
    async deleteRecord(id) {
      await ready;
      return database.records.delete(id);
    },
    async getDraft() {
      await ready;
      return (await database.drafts.get(DRAFT_KEY))?.record || null;
    },
    async saveDraft(record) {
      await ready;
      return database.drafts.put({ key: DRAFT_KEY, record, updatedAt: new Date().toISOString() });
    },
    async clearDraft() {
      await ready;
      return database.drafts.delete(DRAFT_KEY);
    },
    async getMigrationSummary() {
      await ready;
      return database.metadata.get('localStorage-v1');
    },
    async getSyncEntry(recordId) {
      await ready;
      return database.sync.get(recordId);
    },
    async listSyncEntries(organisationId) {
      await ready;
      return database.sync.where('organisationId').equals(organisationId).toArray();
    },
    async queueSyncSave(record, organisationId) {
      await ready;
      const existing = await database.sync.get(record.id);
      const entry = {
        recordId: record.id,
        remoteId: existing?.remoteId || makeUuid(),
        organisationId,
        revision: existing?.revision || 0,
        state: 'pending-save',
        pendingRecord: copy(record),
        serverRecord: existing?.serverRecord || null,
        error: null,
        updatedAt: new Date().toISOString()
      };
      await database.sync.put(entry);
      return entry;
    },
    async queueSyncDelete(recordId, organisationId) {
      await ready;
      const existing = await database.sync.get(recordId);
      if (!existing || existing.organisationId !== organisationId) return { queued: false, entry: existing || null };
      if (!existing.revision) {
        await database.sync.delete(recordId);
        return { queued: false, entry: null };
      }
      const entry = {
        ...existing,
        state: 'pending-delete',
        pendingRecord: null,
        error: null,
        updatedAt: new Date().toISOString()
      };
      await database.sync.put(entry);
      return { queued: true, entry };
    },
    async listPendingSync(organisationId) {
      await ready;
      return database.sync.where('organisationId').equals(organisationId)
        .filter((entry) => entry.state === 'pending-save' || entry.state === 'pending-delete')
        .sortBy('updatedAt');
    },
    async markSyncSaved(recordId, remoteRecord) {
      await ready;
      const existing = await database.sync.get(recordId);
      if (!existing) return;
      await database.sync.put({
        ...existing,
        revision: remoteRecord.revision,
        state: 'synced',
        pendingRecord: null,
        serverRecord: null,
        error: null,
        lastSyncedAt: new Date().toISOString(),
        updatedAt: remoteRecord.updated_at || new Date().toISOString()
      });
    },
    async markSyncDeleted(recordId, remoteRecord) {
      await ready;
      const existing = await database.sync.get(recordId);
      if (!existing) return;
      await database.sync.put({
        ...existing,
        revision: remoteRecord.revision,
        state: 'deleted',
        pendingRecord: null,
        serverRecord: null,
        error: null,
        lastSyncedAt: new Date().toISOString(),
        updatedAt: remoteRecord.updated_at || new Date().toISOString()
      });
    },
    async markSyncConflict(recordId, remoteRecord, message) {
      await ready;
      const existing = await database.sync.get(recordId);
      if (!existing) return;
      await database.sync.put({
        ...existing,
        state: 'conflict',
        serverRecord: copy(remoteRecord),
        error: message || 'Record revision conflict',
        updatedAt: new Date().toISOString()
      });
    },
    async markSyncError(recordId, message) {
      await ready;
      const existing = await database.sync.get(recordId);
      if (!existing) return;
      await database.sync.put({ ...existing, error: message, updatedAt: new Date().toISOString() });
    },
    async applyRemoteRecords(organisationId, remoteRecords) {
      await ready;
      return database.transaction('rw', database.records, database.sync, async () => {
        const entries = await database.sync.where('organisationId').equals(organisationId).toArray();
        const byRemoteId = new Map(entries.map((entry) => [entry.remoteId, entry]));
        let downloaded = 0;
        let removed = 0;

        for (const remoteRecord of remoteRecords) {
          const existing = byRemoteId.get(remoteRecord.id);
          if (existing && ['pending-save', 'pending-delete', 'conflict'].includes(existing.state)) continue;

          const recordId = existing?.recordId || remoteRecord.payload?.id || remoteRecord.id;
          if (remoteRecord.deleted_at) {
            if (await database.records.get(recordId)) {
              await database.records.delete(recordId);
              removed += 1;
            }
            await database.sync.put({
              ...(existing || { recordId, remoteId: remoteRecord.id, organisationId }),
              revision: remoteRecord.revision,
              state: 'deleted',
              pendingRecord: null,
              serverRecord: null,
              error: null,
              lastSyncedAt: new Date().toISOString(),
              updatedAt: remoteRecord.updated_at
            });
            continue;
          }

          if (!remoteRecord.payload || typeof remoteRecord.payload !== 'object' || Array.isArray(remoteRecord.payload)) continue;
          await database.records.put({ ...copy(remoteRecord.payload), id: recordId });
          await database.sync.put({
            ...(existing || { recordId, remoteId: remoteRecord.id, organisationId }),
            revision: remoteRecord.revision,
            state: 'synced',
            pendingRecord: null,
            serverRecord: null,
            error: null,
            lastSyncedAt: new Date().toISOString(),
            updatedAt: remoteRecord.updated_at
          });
          downloaded += 1;
        }

        return { downloaded, removed };
      });
    },
    async getSyncSummary(organisationId) {
      await ready;
      const entries = await database.sync.where('organisationId').equals(organisationId).toArray();
      return {
        pending: entries.filter((entry) => entry.state === 'pending-save' || entry.state === 'pending-delete').length,
        conflicts: entries.filter((entry) => entry.state === 'conflict').length,
        errors: entries.filter((entry) => entry.error && entry.state !== 'conflict').length,
        synced: entries.filter((entry) => entry.state === 'synced').length
      };
    }
  });
})(window);
