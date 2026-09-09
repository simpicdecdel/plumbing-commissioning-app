export const mockRemoteClient = `
window.commissioningRemote = (() => {
  const listeners = new Set();
  const membership = { organisationId: '11111111-1111-4111-8111-111111111111', role: 'administrator', organisationName: 'Plumbing Commissioning' };
  let state = localStorage.getItem('mock-authenticated') === 'true'
    ? { user: { id: 'user-1', email: 'simpic@gmail.com' }, membership, recovery: false }
    : { user: null, membership: null, recovery: false };
  const readRows = () => JSON.parse(localStorage.getItem('mock-server-records') || '[]');
  const writeRows = (rows) => localStorage.setItem('mock-server-records', JSON.stringify(rows));
  const emit = () => listeners.forEach((listener) => listener(state));
  window.testSetAccess = (next) => { state = next; emit(); };
  const conflict = () => { const error = new Error('Record revision conflict'); error.code = 'PT409'; throw error; };
  return {
    enabled: true,
    initialise: async () => state,
    getState: () => state,
    isRecovery: () => false,
    onStateChange: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    signIn: async (email) => {
      localStorage.setItem('mock-authenticated', 'true');
      state = { user: { id: 'user-1', email }, membership, recovery: false };
      emit();
      return state;
    },
    signOut: async () => {
      localStorage.removeItem('mock-authenticated');
      state = { user: null, membership: null, recovery: false };
      emit();
      return state;
    },
    sendPasswordResetEmail: async () => undefined,
    listRecords: async () => {
      if (localStorage.getItem('mock-hide-server-records') === 'true') return [];
      const staleRows = localStorage.getItem('mock-stale-server-response');
      if (!staleRows) return readRows();
      localStorage.removeItem('mock-stale-server-response');
      return JSON.parse(staleRows);
    },
    getRecord: async (_organisationId, remoteId) => readRows().find((row) => row.id === remoteId) || null,
    saveRecord: async ({ remoteId, record, expectedRevision }) => {
      const rows = readRows();
      const index = rows.findIndex((row) => row.id === remoteId);
      if ((expectedRevision === 0 && index >= 0) || (expectedRevision > 0 && rows[index]?.revision !== expectedRevision)) conflict();
      const saved = {
        id: remoteId,
        payload: record,
        revision: expectedRevision === 0 ? 1 : expectedRevision + 1,
        updated_at: new Date().toISOString(),
        deleted_at: null
      };
      if (index >= 0) rows[index] = saved; else rows.push(saved);
      writeRows(rows);
      return saved;
    },
    restoreRecord: async ({ remoteId, expectedRevision }) => {
      const rows = readRows();
      const row = rows.find((record) => record.id === remoteId);
      if (!row || row.revision !== expectedRevision || !row.deleted_at) conflict();
      row.deleted_at = null; row.revision++; writeRows(rows); return row;
    },
    deleteRecord: async ({ remoteId, expectedRevision }) => {
      const rows = readRows();
      const index = rows.findIndex((row) => row.id === remoteId);
      if (index < 0 || rows[index].revision !== expectedRevision) conflict();
      rows[index] = { ...rows[index], revision: expectedRevision + 1, updated_at: new Date().toISOString(), deleted_at: new Date().toISOString() };
      writeRows(rows);
      return rows[index];
    }
  };
})();`;
