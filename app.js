const store = window.commissioningStore;
const form = document.querySelector('#commissioningForm');
const recordList = document.querySelector('#recordList');
const recordsView = document.querySelector('#recordsView');
const formView = document.querySelector('#formView');
const saveStatus = document.querySelector('#saveStatus');
const searchInput = document.querySelector('#recordSearch');
const unitsList = document.querySelector('#unitsList');
const restoreFile = document.querySelector('#restoreFile');
let installPrompt;
let autosaveTimer;

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
  clearTimeout(autosaveTimer); await store.saveRecord(record); await store.clearDraft();
}

function escapeHtml(valueToEscape = '') {
  return String(valueToEscape).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

async function renderRecords() {
  const query = searchInput.value.toLowerCase().trim();
  const records = (await store.listRecords()).filter((record) => {
    const unitValues = (record.units || []).flatMap((unit) => [unit.label, unit.manufacturer, unit.model, unit.serialNumber]);
    return [record.job?.siteName, record.job?.address, record.job?.reference, record.plant?.name, record.plant?.location, ...unitValues]
      .some((fieldValue) => String(fieldValue || '').toLowerCase().includes(query));
  });
  recordList.innerHTML = '';
  if (!records.length) { recordList.append(document.querySelector('#emptyStateTemplate').content.cloneNode(true)); return; }
  for (const record of records) {
    const faults = (record.units || []).filter((unit) => unit.status === 'Fault / exception').length;
    const card = document.createElement('article'); card.className = 'record-card';
    const outcome = record.results?.outcome; const badgeClass = record.status === 'Draft' ? 'draft' : outcome === 'Failed' ? 'failed' : '';
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(record.job?.siteName || 'Unnamed site')}</h3>
        <p class="record-meta">${escapeHtml(record.plant?.name || 'Plant not set')} · ${escapeHtml(record.job?.address || 'Address not set')}</p>
        <p class="record-meta">${record.units?.length || 0} unit${record.units?.length === 1 ? '' : 's'}${faults ? ` · ${faults} fault / exception${faults === 1 ? '' : 's'}` : ''}${record.job?.reference ? ` · Job ${escapeHtml(record.job.reference)}` : ''}</p>
        <span class="badge ${badgeClass}">${escapeHtml(record.status === 'Draft' ? 'Draft' : outcome || 'Completed')}</span>
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
    await store.deleteRecord(record.id); await renderRecords();
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
  const storageNotice = document.querySelector('#storageNotice');
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

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); installPrompt = event; document.querySelector('#installButton').hidden = false;
});
document.querySelector('#installButton').addEventListener('click', async () => {
  if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice;
  installPrompt = null; document.querySelector('#installButton').hidden = true;
});

async function start() {
  try {
    const migration = await store.initialise();
    if (migration?.migratedRecordCount || migration?.migratedDraft) {
      document.querySelector('#storageNotice').textContent = `${migration.migratedRecordCount} earlier record${migration.migratedRecordCount === 1 ? '' : 's'} moved to IndexedDB on this device.`;
    }
    updateNetworkStatus(); await renderRecords();
    if ('serviceWorker' in navigator) await navigator.serviceWorker.register('./service-worker.js');
  } catch (error) {
    reportStorageError(error);
    recordList.innerHTML = '<p class="notice notice-error">Local records could not be opened. Do not clear site data. Reload and try again.</p>';
  }
}

window.addEventListener('load', start);
