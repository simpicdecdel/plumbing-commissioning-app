(function initialiseCommissioningSync(global) {
  'use strict';

  const store = global.commissioningStore;
  const remote = global.commissioningRemote;
  const listeners = new Set();
  let authState = {};
  let activeSync = null;
  let status = Object.freeze({ state: 'local', pending: 0, conflicts: 0, errors: 0, synced: 0 });

  function context() {
    const organisationId = authState.membership?.organisationId;
    return authState.user && organisationId ? {
      organisationId,
      role: authState.membership.role
    } : null;
  }

  function emit(nextStatus, changes = null) {
    status = Object.freeze({ ...status, ...nextStatus });
    listeners.forEach((listener) => listener(status));
    global.dispatchEvent(new CustomEvent('commissioning-sync-updated', { detail: { status, changes } }));
    return status;
  }

  async function refreshStatus(preferredState) {
    const current = context();
    if (!current) return emit({ state: 'local', pending: 0, conflicts: 0, errors: 0, synced: 0 });
    const summary = await store.getSyncSummary(current.organisationId);
    const state = preferredState
      || (summary.conflicts ? 'conflict'
        : summary.errors ? 'error'
          : summary.pending ? (navigator.onLine ? 'pending' : 'offline')
            : 'synced');
    return emit({ state, ...summary });
  }

  function isConflict(error) {
    return error?.code === '40001' || /revision conflict/i.test(error?.message || '');
  }

  async function performSync() {
    const current = context();
    if (!current) return refreshStatus('local');
    if (!navigator.onLine) return refreshStatus('offline');
    emit({ state: 'syncing' });

    const pendingEntries = await store.listPendingSync(current.organisationId);
    let failed = false;
    for (const entry of pendingEntries) {
      try {
        if (entry.state === 'pending-save') {
          const saved = await remote.saveRecord({
            remoteId: entry.remoteId,
            organisationId: current.organisationId,
            record: entry.pendingRecord,
            expectedRevision: entry.revision || 0
          });
          await store.markSyncSaved(entry.recordId, saved);
        } else if (entry.state === 'pending-delete') {
          const deleted = await remote.deleteRecord({
            remoteId: entry.remoteId,
            organisationId: current.organisationId,
            expectedRevision: entry.revision
          });
          await store.markSyncDeleted(entry.recordId, deleted);
        }
      } catch (error) {
        if (isConflict(error)) {
          let serverRecord = null;
          try { serverRecord = await remote.getRecord(current.organisationId, entry.remoteId); }
          catch (readError) { console.error('Could not load the conflicting server record.', readError); }
          await store.markSyncConflict(entry.recordId, serverRecord, error.message);
          continue;
        }
        await store.markSyncError(entry.recordId, error.message || 'Synchronisation failed.');
        failed = true;
        console.error('Synchronisation upload failed.', error);
        break;
      }
    }

    let changes = null;
    if (!failed) {
      try {
        const remoteRecords = await remote.listRecords(current.organisationId);
        changes = await store.applyRemoteRecords(current.organisationId, remoteRecords);
      } catch (error) {
        failed = true;
        console.error('Synchronisation download failed.', error);
      }
    }

    const finalStatus = await refreshStatus(failed ? 'error' : null);
    if (!failed) return emit({ ...finalStatus, lastSuccessfulSyncAt: new Date().toISOString() }, changes);
    return emit(finalStatus, changes);
  }

  function syncNow() {
    if (activeSync) return activeSync;
    activeSync = performSync().finally(() => { activeSync = null; });
    return activeSync;
  }

  async function syncAfterCurrent() {
    if (activeSync) await activeSync;
    return syncNow();
  }

  global.commissioningSync = Object.freeze({
    getStatus: () => status,
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async setAuthState(nextAuthState = {}) {
      const previousOrganisationId = context()?.organisationId;
      authState = nextAuthState;
      const current = context();
      if (!current) return refreshStatus('local');
      await refreshStatus(previousOrganisationId === current.organisationId ? null : 'pending');
      return syncNow();
    },
    async queueSave(record) {
      const current = context();
      if (!current) return { queued: false };
      const entry = await store.queueSyncSave(record, current.organisationId);
      await refreshStatus(navigator.onLine ? 'pending' : 'offline');
      if (navigator.onLine) await syncAfterCurrent();
      return { queued: true, entry };
    },
    async queueDelete(recordId) {
      const current = context();
      if (!current) return { queued: false };
      const existing = await store.getSyncEntry(recordId);
      if (existing?.revision > 0 && current.role !== 'administrator') {
        throw new Error('Only an Administrator can delete a synchronised record.');
      }
      const result = await store.queueSyncDelete(recordId, current.organisationId);
      await refreshStatus(navigator.onLine ? 'pending' : 'offline');
      if (result.queued && navigator.onLine) await syncAfterCurrent();
      return result;
    },
    syncNow
  });
})(window);
