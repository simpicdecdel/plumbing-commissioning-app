const STORAGE_KEY = 'plumbing-commissioning-records-v1';
const DRAFT_KEY = 'plumbing-commissioning-autosave-v1';

const form = document.querySelector('#commissioningForm');
const recordList = document.querySelector('#recordList');
const recordsView = document.querySelector('#recordsView');
const formView = document.querySelector('#formView');
const saveStatus = document.querySelector('#saveStatus');
const searchInput = document.querySelector('#recordSearch');
const fields = [...form.elements].filter((element) => element.name);
let installPrompt;
let autosaveTimer;

function readRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function writeRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function today() { return new Date().toISOString().slice(0, 10); }

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `record-${Date.now()}`;
}

function collectFormData(status = 'Draft') {
  const data = { id: document.querySelector('#recordId').value || makeId(), status };
  for (const field of fields) data[field.name] = field.type === 'checkbox' ? field.checked : field.value.trim();
  data.updatedAt = new Date().toISOString();
  return data;
}

function populateForm(record = {}) {
  form.reset();
  document.querySelector('#recordId').value = record.id || '';
  for (const field of fields) {
    if (!(field.name in record)) continue;
    if (field.type === 'checkbox') field.checked = Boolean(record[field.name]);
    else field.value = record[field.name] ?? '';
  }
  if (!record.commissioningDate) document.querySelector('#commissioningDate').value = today();
  document.querySelector('#formTitle').textContent = record.id ? 'Edit commissioning' : 'New commissioning';
  saveStatus.textContent = record.id ? `Editing ${record.status?.toLowerCase() || 'record'}.` : 'Drafts save on this device.';
}

function saveRecord(record) {
  clearTimeout(autosaveTimer);
  const records = readRecords();
  const index = records.findIndex((item) => item.id === record.id);
  if (index >= 0) records[index] = record;
  else records.unshift(record);
  writeRecords(records);
  localStorage.removeItem(DRAFT_KEY);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function renderRecords() {
  const query = searchInput.value.toLowerCase().trim();
  const records = readRecords().filter((record) => [record.customer, record.address, record.jobReference, record.applianceType, record.manufacturer, record.model]
    .some((value) => String(value || '').toLowerCase().includes(query)));
  recordList.innerHTML = '';
  if (!records.length) {
    recordList.append(document.querySelector('#emptyStateTemplate').content.cloneNode(true));
    return;
  }
  for (const record of records) {
    const card = document.createElement('article');
    card.className = 'record-card';
    const badgeClass = record.status === 'Draft' ? 'draft' : record.outcome === 'Failed' ? 'failed' : '';
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(record.customer || 'Unnamed site')}</h3>
        <p class="record-meta">${escapeHtml(record.applianceType || 'Appliance not set')} · ${escapeHtml(record.address || 'Address not set')}</p>
        <p class="record-meta">${escapeHtml(record.commissioningDate || '')}${record.jobReference ? ` · Job ${escapeHtml(record.jobReference)}` : ''}</p>
        <span class="badge ${badgeClass}">${escapeHtml(record.status === 'Draft' ? 'Draft' : record.outcome || 'Completed')}</span>
      </div>
      <div class="record-actions">
        <button class="button button-secondary" type="button" data-action="edit" data-id="${record.id}">Open</button>
        <button class="button button-secondary" type="button" data-action="print" data-id="${record.id}">Print</button>
        <button class="button button-danger" type="button" data-action="delete" data-id="${record.id}">Delete</button>
      </div>`;
    recordList.append(card);
  }
}

function showView(name) {
  const showForm = name === 'form';
  recordsView.hidden = showForm;
  formView.hidden = !showForm;
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.view === name));
  if (!showForm) renderRecords();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openNewRecord() {
  let draft;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { draft = null; }
  populateForm(draft || {});
  showView('form');
}

function updateNetworkStatus() {
  const status = document.querySelector('#networkStatus');
  status.textContent = navigator.onLine ? 'Online' : 'Offline ready';
  status.classList.toggle('offline', !navigator.onLine);
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  saveStatus.textContent = 'Saving draft…';
  autosaveTimer = setTimeout(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(collectFormData('Draft')));
    saveStatus.textContent = 'Draft saved on this device.';
  }, 450);
}

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  if (tab.dataset.view === 'form') openNewRecord(); else showView('records');
}));
document.querySelector('#newRecordButton').addEventListener('click', openNewRecord);
document.querySelector('#backButton').addEventListener('click', () => showView('records'));
searchInput.addEventListener('input', renderRecords);
form.addEventListener('input', scheduleAutosave);

document.querySelector('#saveDraftButton').addEventListener('click', () => {
  const record = collectFormData('Draft');
  saveRecord(record);
  document.querySelector('#recordId').value = record.id;
  saveStatus.textContent = 'Draft saved.';
  renderRecords();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const record = collectFormData('Completed');
  saveRecord(record);
  showView('records');
});

recordList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const records = readRecords();
  const record = records.find((item) => item.id === button.dataset.id);
  if (!record) return;
  if (button.dataset.action === 'edit' || button.dataset.action === 'print') {
    populateForm(record);
    showView('form');
    if (button.dataset.action === 'print') setTimeout(() => window.print(), 100);
  }
  if (button.dataset.action === 'delete' && confirm(`Delete the record for ${record.customer || 'this site'}? This cannot be undone.`)) {
    writeRecords(records.filter((item) => item.id !== record.id));
    renderRecords();
  }
});

document.querySelector('#exportButton').addEventListener('click', () => {
  const payload = { exportedAt: new Date().toISOString(), schemaVersion: 1, records: readRecords() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `plumbing-commissioning-backup-${today()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  document.querySelector('#installButton').hidden = false;
});
document.querySelector('#installButton').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  document.querySelector('#installButton').hidden = true;
});

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
updateNetworkStatus();
renderRecords();
