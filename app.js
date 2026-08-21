const store = window.commissioningStore;
const form = document.querySelector('#commissioningForm');
const recordList = document.querySelector('#recordList');
const recordsView = document.querySelector('#recordsView');
const formView = document.querySelector('#formView');
const saveStatus = document.querySelector('#saveStatus');
const searchInput = document.querySelector('#recordSearch');
const unitsList = document.querySelector('#unitsList');
const restoreFile = document.querySelector('#restoreFile');
const storageNotice = document.querySelector('#storageNotice');
let installPrompt;
let autosaveTimer;

const remote = window.commissioningRemote;
const sync = window.commissioningSync;
const authDialog = document.querySelector('#authDialog');
const authMessage = document.querySelector('#authMessage');
const signInForm = document.querySelector('#signInForm');
const setPasswordForm = document.querySelector('#setPasswordForm');
const accountPanel = document.querySelector('#accountPanel');

function showAuthMessage(message = '', isError = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle('error', isError);
}

function renderAuthState(authState = {}) {
  const signedIn = Boolean(authState.user);
  const recovery = Boolean(authState.recovery);
  document.querySelector('#accountButton').textContent = signedIn ? (authState.membership?.role === 'administrator' ? 'Administrator' : 'Account') : 'Sign in';
  signInForm.hidden = signedIn || recovery;
  setPasswordForm.hidden = !recovery;
  accountPanel.hidden = !signedIn || recovery;
  document.querySelector('#authTitle').textContent = recovery ? 'Set password' : signedIn ? 'Account' : 'Sign in';
  document.querySelector('#accountEmail').textContent = authState.user?.email || '';
  document.querySelector('#accountRole').textContent = authState.membership
    ? `${authState.membership.organisationName || 'Organisation'} · ${authState.membership.role}`
    : signedIn ? 'No organisation membership found.' : '';
  document.querySelector('#syncButton').hidden = !signedIn || !authState.membership;
  storageNotice.textContent = signedIn && authState.membership
    ? 'New or edited records sync to your organisation. Existing device records remain local until you edit them.'
    : 'Records stay in IndexedDB on this device unless you sign in and save or edit them.';
  sync?.setAuthState(authState).catch((error) => console.error('Could not initialise synchronisation.', error));
}

async function initialiseAuth() {
  if (!remote?.enabled) {
    await sync?.setAuthState({});
    return;
  }
  remote.onStateChange(renderAuthState);
  renderAuthState(await remote.initialise());
  if (remote.isRecovery()) authDialog.showModal();
}

function today() { return new Date().toISOString().slice(0, 10); }

function makeId(prefix = 'record') {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function value(id) { return document.querySelector(`#${id}`).value.trim(); }
function checked(id) { return document.querySelector(`#${id}`).checked; }

function blankRecord() {
  return {
    id: makeId(), schemaVersion: 2, status: '',
    job: { siteName: '', reference: '', address: '', commissioningDate: today(), technician: '' },
    plant: { name: '', location: '', type: 'Commercial hot water plant' },
    units: [], installationChecks: {}, results: {}, handover: {}, updatedAt: new Date().toISOString()
  };
}

function collectUnits() {
  return [...unitsList.querySelectorAll('.unit-card')].map((card) => ({
    id: card.dataset.unitId || makeId('unit'),
    label: card.querySelector('[data-unit-field="label"]').value.trim(),
    manufacturer: card.querySelector('[data-unit-field="manufacturer"]').value.trim(),
    model: card.querySelector('[data-unit-field="model"]').value.trim(),
    serialNumber: card.querySelector('[data-unit-field="serialNumber"]').value.trim(),
    status: card.querySelector('[data-unit-field="status"]').value,
    exception: card.querySelector('[data-unit-field="exception"]').value.trim()
  }));
}

function collectFormData(status = 'Draft') {
  return {
    id: document.querySelector('#recordId').value || makeId(), schemaVersion: 2, status,
    job: {
      siteName: value('customer'), reference: value('jobReference'), address: value('address'),
      commissioningDate: value('commissioningDate'), technician: value('technician')
    },
    plant: { name: value('plantName'), location: value('plantLocation'), type: value('plantType') },
    units: collectUnits(),
    installationChecks: {
      secure: checked('secure'), connections: checked('connections'), leakFree: checked('leakFree'),
      isolation: checked('isolation'), drainage: checked('drainage'), manufacturerInstructions: checked('manufacturerInstructions')
    },
    results: {
      staticPressure: value('staticPressure'), flowPressure: value('flowPressure'), flowRate: value('flowRate'),
      outletTemperature: value('outletTemperature'), outcome: value('outcome'), notes: value('notes')
    },
    handover: {
      operationDemonstrated: checked('operationDemonstrated'), documentsProvided: checked('documentsProvided'),
      siteLeftClean: checked('siteLeftClean'), customerRepresentative: value('customerRepresentative'), handoverDate: value('handoverDate')
    },
    updatedAt: new Date().toISOString()
  };
}

function addUnit(unit = {}) {
  const fragment = document.querySelector('#unitTemplate').content.cloneNode(true);
  const card = fragment.querySelector('.unit-card');
  card.dataset.unitId = unit.id || makeId('unit');
  card.querySelector('.unit-number').textContent = `Unit ${unitsList.children.length + 1}`;
  for (const [key, fieldValue] of Object.entries(unit)) {
    const field = card.querySelector(`[data-unit-field="${key}"]`);
    if (field) field.value = fieldValue ?? '';
  }
  card.querySelector('[data-action="remove-unit"]').addEventListener('click', () => {
    card.remove(); renumberUnits(); scheduleAutosave();
  });
  card.querySelector('[data-unit-field="status"]').addEventListener('change', updateUnitExceptionState);
  unitsList.append(card);
  updateUnitExceptionState({ target: card.querySelector('[data-unit-field="status"]') });
}

function renumberUnits() {
  [...unitsList.children].forEach((card, index) => { card.querySelector('.unit-number').textContent = `Unit ${index + 1}`; });
}

function updateUnitExceptionState(event) {
  const card = event.target.closest('.unit-card');
  const exception = card.querySelector('[data-unit-field="exception"]');
  const hasException = event.target.value === 'Fault / exception';
  exception.required = hasException;
  exception.closest('label').classList.toggle('is-required', hasException);
}

function setField(id, fieldValue) {
  const field = document.querySelector(`#${id}`);
  if (field.type === 'checkbox') field.checked = Boolean(fieldValue);
  else field.value = fieldValue ?? '';
}

function populateForm(record = blankRecord()) {
  form.reset(); unitsList.innerHTML = '';
  document.querySelector('#recordId').value = record.id || makeId();
  const job = record.job || {}; const plant = record.plant || {}; const checks = record.installationChecks || {};
  const results = record.results || {}; const handover = record.handover || {};
  const fieldValues = {
    customer: job.siteName, jobReference: job.reference, address: job.address,
    commissioningDate: job.commissioningDate || today(), technician: job.technician,
    plantName: plant.name, plantLocation: plant.location, plantType: plant.type || 'Commercial hot water plant',
    secure: checks.secure, connections: checks.connections, leakFree: checks.leakFree,
    isolation: checks.isolation, drainage: checks.drainage, manufacturerInstructions: checks.manufacturerInstructions,
    staticPressure: results.staticPressure, flowPressure: results.flowPressure, flowRate: results.flowRate,
    outletTemperature: results.outletTemperature, outcome: results.outcome, notes: results.notes,
    operationDemonstrated: handover.operationDemonstrated, documentsProvided: handover.documentsProvided,
    siteLeftClean: handover.siteLeftClean, customerRepresentative: handover.customerRepresentative, handoverDate: handover.handoverDate
  };
  Object.entries(fieldValues).forEach(([id, fieldValue]) => setField(id, fieldValue));
  (record.units?.length ? record.units : [{}]).forEach(addUnit);
  document.querySelector('#formTitle').textContent = record.status ? 'Edit commissioning' : 'New commissioning';
  saveStatus.textContent = record.status ? `Editing ${record.status.toLowerCase()}.` : 'Drafts save on this device.';
}

async function saveRecord(record) {
  clearTimeout(autosaveTimer);
  await store.saveRecord(record);
  await store.clearDraft();
  await sync?.queueSave(record);
}

function escapeHtml(valueToEscape = '') {
  return String(valueToEscape).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
}

function describeSyncEntry(entry) {
  if (!entry) return { status: 'Local only', time: 'Not synced' };
  if (entry.state === 'conflict') return { status: 'Conflict needs review', time: entry.lastSyncedAt ? formatDateTime(entry.lastSyncedAt) : 'Not synced' };
  if (entry.error) return { status: 'Sync error', time: entry.lastSyncedAt ? formatDateTime(entry.lastSyncedAt) : 'Not synced' };
  if (entry.state === 'pending-save') return { status: 'Pending upload', time: entry.lastSyncedAt ? formatDateTime(entry.lastSyncedAt) : 'Not synced' };
  if (entry.state === 'pending-delete') return { status: 'Pending deletion', time: entry.lastSyncedAt ? formatDateTime(entry.lastSyncedAt) : 'Not synced' };
  if (entry.state === 'deleted') return { status: 'Deleted centrally', time: entry.lastSyncedAt ? formatDateTime(entry.lastSyncedAt) : 'Not synced' };
  return { status: 'Synced', time: entry.lastSyncedAt ? formatDateTime(entry.lastSyncedAt) : 'Not synced' };
}

async function renderRecords() {
  const query = searchInput.value.toLowerCase().trim();
  const records = (await store.listRecords()).filter((record) => {
    const unitValues = (record.units || []).flatMap((unit) => [unit.label, unit.manufacturer, unit.model, unit.serialNumber]);
    return [record.job?.siteName, record.job?.address, record.job?.reference, record.plant?.name, record.plant?.location, ...unitValues]
      .some((fieldValue) => String(fieldValue || '').toLowerCase().includes(query));
  });
  const syncEntries = await Promise.all(records.map((record) => store.getSyncEntry(record.id)));
  const syncEntriesByRecordId = new Map(syncEntries.filter(Boolean).map((entry) => [entry.recordId, entry]));
  recordList.innerHTML = '';
  if (!records.length) { recordList.append(document.querySelector('#emptyStateTemplate').content.cloneNode(true)); return; }
  for (const record of records) {
    const syncEntry = syncEntriesByRecordId.get(record.id);
    const savedAt = formatDateTime(record.updatedAt);
    const syncDetails = describeSyncEntry(syncEntry);
    const faults = (record.units || []).filter((unit) => unit.status === 'Fault / exception').length;
    const card = document.createElement('article'); card.className = 'record-card';
    const outcome = record.results?.outcome; const badgeClass = record.status === 'Draft' ? 'draft' : outcome === 'Failed' ? 'failed' : '';
    card.innerHTML = `
      <div class="record-job-details">
        <h3>${escapeHtml(record.job?.siteName || 'Unnamed site')}</h3>
        <p class="record-meta">${escapeHtml(record.plant?.name || 'Plant not set')} · ${escapeHtml(record.job?.address || 'Address not set')}</p>
        <p class="record-meta">${record.units?.length || 0} unit${record.units?.length === 1 ? '' : 's'}${faults ? ` · ${faults} fault / exception${faults === 1 ? '' : 's'}` : ''}${record.job?.reference ? ` · Job ${escapeHtml(record.job.reference)}` : ''}</p>
        <span class="badge ${badgeClass}">${escapeHtml(record.status === 'Draft' ? 'Draft' : outcome || 'Completed')}</span>
      </div>
      <div class="record-detail-column">
        <p class="record-column-label">Saved by technician</p>
        <p class="record-column-value">${escapeHtml(record.job?.technician || 'Not recorded')}</p>
        <p class="record-meta">${escapeHtml(savedAt)}</p>
      </div>
      <div class="record-detail-column">
        <p class="record-column-label">Sync details</p>
        <p class="record-column-value">${escapeHtml(syncDetails.status)}</p>
        <p class="record-meta">${escapeHtml(syncDetails.time)}</p>
      </div>
      <div class="record-actions">
        <button class="button button-secondary" type="button" data-action="edit" data-id="${escapeHtml(record.id)}">Open</button>
        <button class="button button-secondary" type="button" data-action="print" data-id="${escapeHtml(record.id)}">Print</button>
        <button class="button button-danger" type="button" data-action="delete" data-id="${escapeHtml(record.id)}">Delete</button>
      </div>`;
    recordList.append(card);
  }
}

async function showView(name) {
  const showForm = name === 'form'; recordsView.hidden = showForm; formView.hidden = !showForm;
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.view === name));
  if (!showForm) await renderRecords();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function openNewRecord() { populateForm((await store.getDraft()) || blankRecord()); await showView('form'); }

function updateNetworkStatus() {
  const status = document.querySelector('#networkStatus'); status.textContent = navigator.onLine ? 'Online' : 'Offline ready';
  status.classList.toggle('offline', !navigator.onLine);
}

function updateSyncStatus(syncState = sync?.getStatus?.() || { state: 'local' }) {
  const element = document.querySelector('#syncStatus');
  const labels = {
    local: 'Local only',
    offline: syncState.pending ? `${syncState.pending} pending` : 'Offline',
    pending: `${syncState.pending || 0} pending`,
    syncing: 'Syncing…',
    synced: syncState.lastSuccessfulSyncAt ? 'Synced just now' : 'Synced',
    conflict: `${syncState.conflicts} conflict${syncState.conflicts === 1 ? '' : 's'}`,
    error: 'Sync error'
  };
  element.textContent = labels[syncState.state] || 'Local only';
  element.dataset.state = syncState.state || 'local';
}

function reportStorageError(error) {
  console.error(error); saveStatus.textContent = 'Could not save on this device. Try again before leaving this screen.';
  saveStatus.classList.add('error');
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer); saveStatus.classList.remove('error'); saveStatus.textContent = 'Saving draft…';
  autosaveTimer = setTimeout(async () => {
    try { await store.saveDraft(collectFormData('Draft')); saveStatus.textContent = 'Draft saved on this device.'; }
    catch (error) { reportStorageError(error); }
  }, 450);
}

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', async () => {
  if (tab.dataset.view === 'form') await openNewRecord(); else await showView('records');
}));
document.querySelector('#newRecordButton').addEventListener('click', openNewRecord);
document.querySelector('#backButton').addEventListener('click', () => showView('records'));
document.querySelector('#addUnitButton').addEventListener('click', () => { addUnit(); scheduleAutosave(); });
searchInput.addEventListener('input', renderRecords);
form.addEventListener('input', scheduleAutosave);

document.querySelector('#saveDraftButton').addEventListener('click', async () => {
  try {
    const record = collectFormData('Draft'); await saveRecord(record); document.querySelector('#recordId').value = record.id;
    saveStatus.textContent = 'Draft saved.'; await renderRecords();
  } catch (error) { reportStorageError(error); }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!form.reportValidity()) return;
  try { await saveRecord(collectFormData('Completed')); await showView('records'); }
  catch (error) { reportStorageError(error); }
});

recordList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const record = await store.getRecord(button.dataset.id); if (!record) return;
  if (button.dataset.action === 'edit' || button.dataset.action === 'print') {
    populateForm(record); await showView('form');
    if (button.dataset.action === 'print') setTimeout(() => window.print(), 100);
  }
  if (button.dataset.action === 'delete' && confirm(`Delete the record for ${record.job?.siteName || 'this site'}? This cannot be undone.`)) {
    try {
      await sync?.queueDelete(record.id);
      await store.deleteRecord(record.id);
      await renderRecords();
    } catch (error) {
      storageNotice.textContent = error.message;
      storageNotice.classList.add('notice-error');
    }
  }
});

document.querySelector('#exportButton').addEventListener('click', async () => {
  const payload = { exportedAt: new Date().toISOString(), schemaVersion: 2, records: await store.listRecords() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
  link.download = `plumbing-commissioning-backup-${today()}.json`; link.click(); URL.revokeObjectURL(link.href);
});

function validateBackup(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('The selected file is not a backup.');
  if (payload.schemaVersion !== 2) throw new Error('This backup version is not supported.');
  if (!Array.isArray(payload.records)) throw new Error('The backup does not contain a records list.');

  const ids = new Set();
  for (const record of payload.records) {
    const validRecord = record && typeof record === 'object' && !Array.isArray(record)
      && record.schemaVersion === 2 && typeof record.id === 'string' && record.id.trim()
      && record.job && typeof record.job === 'object'
      && record.plant && typeof record.plant === 'object'
      && Array.isArray(record.units) && record.results && typeof record.results === 'object'
      && typeof record.updatedAt === 'string';
    if (!validRecord) throw new Error('The backup contains an invalid record.');
    if (ids.has(record.id)) throw new Error('The backup contains duplicate record IDs.');
    ids.add(record.id);
  }
  return payload.records;
}

document.querySelector('#restoreButton').addEventListener('click', () => restoreFile.click());
restoreFile.addEventListener('change', async () => {
  const file = restoreFile.files?.[0];
  restoreFile.value = '';
  if (!file) return;
  storageNotice.classList.remove('notice-error');
  try {
    const records = validateBackup(JSON.parse(await file.text()));
    if (!records.length) {
      storageNotice.textContent = 'The backup is valid but contains no records.';
      return;
    }
    if (!confirm(`Restore ${records.length} record${records.length === 1 ? '' : 's'}? Existing records with the same IDs will be replaced.`)) return;
    const result = await store.restoreRecords(records);
    storageNotice.textContent = `Backup restored: ${result.added} added, ${result.replaced} replaced.`;
    await renderRecords();
  } catch (error) {
    console.error(error);
    storageNotice.textContent = `Backup not restored: ${error instanceof SyntaxError ? 'The file is not valid JSON.' : error.message}`;
    storageNotice.classList.add('notice-error');
  }
});

window.addEventListener('online', () => { updateNetworkStatus(); sync?.syncNow(); });
window.addEventListener('offline', () => { updateNetworkStatus(); updateSyncStatus({ ...sync?.getStatus?.(), state: 'offline' }); });
window.addEventListener('commissioning-sync-updated', async (event) => {
  updateSyncStatus(event.detail.status);
  if (event.detail.changes?.downloaded || event.detail.changes?.removed) await renderRecords();
});
document.querySelector('#syncButton').addEventListener('click', () => sync?.syncNow());
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); installPrompt = event; document.querySelector('#installButton').hidden = false;
});
document.querySelector('#installButton').addEventListener('click', async () => {
  if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice;
  installPrompt = null; document.querySelector('#installButton').hidden = true;
});

document.querySelector('#accountButton').addEventListener('click', () => {
  showAuthMessage(remote?.enabled ? '' : 'Team sign-in is not configured on this build.');
  renderAuthState(remote?.getState?.());
  authDialog.showModal();
});
document.querySelector('#closeAuthButton').addEventListener('click', () => authDialog.close());
authDialog.addEventListener('click', (event) => { if (event.target === authDialog) authDialog.close(); });

signInForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showAuthMessage('Signing in…');
  try {
    await remote.signIn(document.querySelector('#authEmail').value.trim(), document.querySelector('#authPassword').value);
    signInForm.reset();
    showAuthMessage('Signed in.');
    authDialog.close();
  } catch (error) { showAuthMessage(error.message, true); }
});

document.querySelector('#passwordSetupButton').addEventListener('click', async () => {
  const email = document.querySelector('#authEmail').value.trim();
  if (!email || !document.querySelector('#authEmail').reportValidity()) return;
  showAuthMessage('Requesting a password setup email…');
  try {
    await remote.sendPasswordSetupEmail(email);
    showAuthMessage('Password setup email sent. Open it on this device to continue.');
  } catch (error) { showAuthMessage(error.message, true); }
});

setPasswordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = document.querySelector('#newPassword').value;
  if (password !== document.querySelector('#confirmPassword').value) {
    showAuthMessage('The passwords do not match.', true);
    return;
  }
  showAuthMessage('Setting password…');
  try {
    await remote.updatePassword(password);
    setPasswordForm.reset();
    showAuthMessage('Password set successfully.');
  } catch (error) { showAuthMessage(error.message, true); }
});

document.querySelector('#signOutButton').addEventListener('click', async () => {
  showAuthMessage('Signing out…');
  try { await remote.signOut(); showAuthMessage('Signed out.'); }
  catch (error) { showAuthMessage(error.message, true); }
});

async function start() {
  try {
    const migration = await store.initialise();
    if (migration?.migratedRecordCount || migration?.migratedDraft) {
      document.querySelector('#storageNotice').textContent = `${migration.migratedRecordCount} earlier record${migration.migratedRecordCount === 1 ? '' : 's'} moved to IndexedDB on this device.`;
    }
    updateNetworkStatus(); updateSyncStatus(); await renderRecords(); await initialiseAuth();
    if ('serviceWorker' in navigator) await navigator.serviceWorker.register('./service-worker.js');
  } catch (error) {
    reportStorageError(error);
    recordList.innerHTML = '<p class="notice notice-error">Local records could not be opened. Do not clear site data. Reload and try again.</p>';
  }
}

window.addEventListener('load', start);
