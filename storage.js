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

  function makeId(prefix = 'record') {
    return global.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    }
  });
})(window);
