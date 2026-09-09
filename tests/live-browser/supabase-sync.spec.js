import assert from 'node:assert/strict';
import { expect, test } from '@playwright/test';
import { cleanupLiveTestFixture, createLiveTestFixture } from '../live/live-test-fixture.mjs';

let fixture;
const contexts = [];

test.beforeAll(async () => { fixture = await createLiveTestFixture(); });
test.afterAll(async () => {
  await Promise.allSettled(contexts.map((context) => context.close()));
  await cleanupLiveTestFixture(fixture);
});

async function createLiveContext(browser) {
  const context = await browser.newContext();
  contexts.push(context);
  return context;
}

async function signIn(page, userKey, expectedStatus = 'Synced') {
  const user = fixture.users[userKey];
  await expect.poll(() => page.evaluate(() => window.PLUMBING_APP_CONFIG?.supabaseUrl))
    .toBe(fixture.config.supabaseUrl);
  await page.getByRole('button', { name: 'Sign in' }).click();
  const form = page.locator('#signInForm');
  await form.getByLabel('Email').fill(user.email);
  await form.getByLabel('Password').fill(user.password);
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: user.role === 'administrator' ? 'Administrator' : 'Account' })).toBeVisible();
  await expect(page.locator('#syncStatus')).toContainText(expectedStatus);
}

async function completeRecord(page, siteName) {
  await page.locator('#newRecordButton').click();
  await expect(page.locator('#formView')).toBeVisible();
  if (await page.locator('#assignmentSelectLabel').isVisible()) await page.locator('#assignedTechnician').selectOption(fixture.users.technician.id);
  await page.locator('#customer').fill(siteName);
  await page.locator('#address').fill('10 Automated Test Street, Sydney NSW');
  await page.locator('#technician').fill('Automated Test User');
  await page.locator('#plantName').fill('Automated Test Plant');
  await page.locator('[data-unit-field="label"]').first().fill('AUTO-HWS-01');
  if (await page.locator('.technician-section').count()) await page.locator('.technician-section').filter({ has: page.locator('#outcome') }).locator('summary').click();
  await page.locator('#outcome').selectOption('Passed');
  await page.getByRole('button', { name: /^(Complete record|Save changes)$/ }).click();
  await expect(page.locator('#formView')).toBeHidden();
  await expect(page.locator('.record-card').filter({ hasText: siteName })).toBeVisible();
  await expect(page.locator('#syncStatus')).toContainText('Synced');
}

async function replaceSiteName(page, siteName) {
  await expect(page.locator('#formTitle')).toHaveText('Edit commissioning');
  const field = page.locator('#customer');
  await field.fill('');
  await field.fill(siteName);
  await field.blur();
  await expect(field).toHaveValue(siteName);
  await page.waitForTimeout(500);
  await expect(field).toHaveValue(siteName);
}

test('real users synchronise and resolve a stale edit through the app', async ({ browser }) => {
  const initialSite = `Live browser ${fixture.runId}`;
  const centralEdit = `Technician central ${fixture.runId}`;
  const staleEdit = `Administrator stale ${fixture.runId}`;

  const administratorContext = await createLiveContext(browser);
  const administratorPage = await administratorContext.newPage();
  await administratorPage.goto('/');
  await signIn(administratorPage, 'administrator');
  await completeRecord(administratorPage, initialSite);

  const technicianContext = await createLiveContext(browser);
  const technicianPage = await technicianContext.newPage();
  await technicianPage.goto('/');
  await signIn(technicianPage, 'technician');
  await expect(technicianPage.locator('.record-card').filter({ hasText: initialSite })).toBeVisible();

  await technicianPage.locator('.record-card').filter({ hasText: initialSite }).getByRole('button', { name: 'Open' }).click();
  await replaceSiteName(technicianPage, centralEdit);
  const localRecordId = await technicianPage.locator('#recordId').inputValue();
  await technicianPage.getByRole('button', { name: /^(Complete record|Save changes)$/ }).click();
  await expect(technicianPage.locator('#formView')).toBeHidden();
  const centralRecord = await fixture.admin.from('commissioning_records')
    .select('payload,revision')
    .eq('organisation_id', fixture.organisationIds[0])
    .eq('payload->>id', localRecordId)
    .single();
  assert.equal(centralRecord.error, null);
  assert.equal(centralRecord.data.payload.job.siteName, centralEdit);
  assert.equal(centralRecord.data.revision, 2);
  await expect(technicianPage.locator('.record-card').filter({ hasText: centralEdit })).toBeVisible();

  await administratorPage.locator('.record-card').filter({ hasText: initialSite }).getByRole('button', { name: 'Open' }).click();
  await replaceSiteName(administratorPage, staleEdit);
  await administratorPage.getByRole('button', { name: /^(Complete record|Save changes)$/ }).click();
  await expect(administratorPage.locator('#syncStatus')).toHaveText('1 conflict');
  await administratorPage.getByRole('button', { name: 'Resolve' }).click();

  const conflictDialog = administratorPage.locator('#conflictDialog');
  await expect(conflictDialog.getByText(staleEdit, { exact: true })).toBeVisible();
  await expect(conflictDialog.getByText(centralEdit, { exact: true })).toBeVisible();
  administratorPage.once('dialog', (confirmation) => confirmation.accept());
  await conflictDialog.getByRole('button', { name: 'Use central version' }).click();
  await expect(conflictDialog).toBeHidden();
  await expect(administratorPage.locator('.record-card').filter({ hasText: centralEdit })).toBeVisible();
  await expect(administratorPage.locator('#syncStatus')).toContainText('Synced');
});

test('offline edits upload on reconnect and after reopening the page', async ({ browser }) => {
  const initialSite = `Live offline ${fixture.runId}`;
  const reconnectEdit = `Offline reconnect ${fixture.runId}`;
  const reopenEdit = `Offline reopen ${fixture.runId}`;
  const context = await createLiveContext(browser);
  let page = await context.newPage();
  await page.goto('/');
  await signIn(page, 'administrator');
  await completeRecord(page, initialSite);

  await page.locator('.record-card').filter({ hasText: initialSite }).getByRole('button', { name: 'Open' }).click();
  const localRecordId = await page.locator('#recordId').inputValue();
  async function centralVersions() {
    const { data, error } = await fixture.admin.from('commissioning_records')
      .select('payload,revision')
      .eq('organisation_id', fixture.organisationIds[0])
      .eq('payload->>id', localRecordId);
    assert.equal(error, null);
    return data.map((record) => ({ siteName: record.payload.job.siteName, revision: record.revision }));
  }

  async function saveOfflineEdit(siteName) {
    await context.setOffline(true);
    await expect(page.locator('#networkStatus')).toHaveText('Offline ready');
    await replaceSiteName(page, siteName);
    await page.getByRole('button', { name: /^(Complete record|Save changes)$/ }).click();
    await expect(page.locator('#formView')).toBeHidden();
    await expect(page.locator('.record-card').filter({ hasText: siteName })).toBeVisible();
    await expect(page.locator('#syncStatus')).toHaveText('1 pending');
  }

  await saveOfflineEdit(reconnectEdit);
  assert.deepEqual(await centralVersions(), [{ siteName: initialSite, revision: 1 }]);
  await context.setOffline(false);
  await expect(page.locator('#syncStatus')).toContainText('Synced', { timeout: 15_000 });
  await expect.poll(centralVersions, { timeout: 15_000 }).toEqual([{ siteName: reconnectEdit, revision: 2 }]);

  await page.locator('.record-card').filter({ hasText: reconnectEdit }).getByRole('button', { name: 'Open' }).click();
  await saveOfflineEdit(reopenEdit);
  assert.deepEqual(await centralVersions(), [{ siteName: reconnectEdit, revision: 2 }]);

  // Close the page with a pending edit, then reconnect before opening it again.
  // Only the browser context's persisted session and IndexedDB outbox survive.
  await page.close();
  await context.setOffline(false);
  page = await context.newPage();
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.PLUMBING_APP_CONFIG?.supabaseUrl))
    .toBe(fixture.config.supabaseUrl);
  await expect(page.locator('.record-card').filter({ hasText: reopenEdit })).toBeVisible();
  await expect(page.locator('#syncStatus')).toContainText('Synced', { timeout: 15_000 });
  await expect.poll(centralVersions, { timeout: 15_000 }).toEqual([{ siteName: reopenEdit, revision: 3 }]);

  const observerContext = await createLiveContext(browser);
  const observerPage = await observerContext.newPage();
  await observerPage.goto('/');
  await signIn(observerPage, 'technician');
  await expect(observerPage.locator('.record-card').filter({ hasText: reopenEdit })).toHaveCount(1);
  await expect(observerPage.locator('.record-card').filter({ hasText: initialSite })).toHaveCount(0);
  await expect(observerPage.locator('.record-card').filter({ hasText: reconnectEdit })).toHaveCount(0);
});

test('administrator deletion and restore propagate to technician without page reload', async ({ browser }) => {
  const site = `Deletion recovery ${fixture.runId}`;
  const adminPage = await (await createLiveContext(browser)).newPage();
  await adminPage.goto('/'); await signIn(adminPage, 'administrator');
  await completeRecord(adminPage, site);
  const technicianPage = await (await createLiveContext(browser)).newPage();
  await technicianPage.goto('/'); await signIn(technicianPage, 'technician');
  const card = (page) => page.locator('.record-card').filter({ hasText: site });
  await expect(card(technicianPage)).toBeVisible();
  await expect(card(technicianPage).getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  adminPage.once('dialog', (dialog) => dialog.accept());
  await card(adminPage).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(card(adminPage)).toHaveCount(0);
  await technicianPage.getByRole('button', { name: 'Sync now' }).click();
  await expect(card(technicianPage)).toHaveCount(0);
  await adminPage.getByRole('button', { name: 'Deleted records', exact: true }).click();
  const deleted = adminPage.locator('#deletedList p').filter({ hasText: site });
  await expect(deleted).toBeVisible();
  adminPage.once('dialog', (dialog) => dialog.accept());
  await deleted.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(card(adminPage)).toBeVisible();
  await technicianPage.getByRole('button', { name: 'Sync now' }).click();
  await expect(card(technicianPage)).toBeVisible();
});

test('expired session with invalid refresh token preserves offline work through re-login', async ({ browser }) => {
  const context = await createLiveContext(browser);
  let page = await context.newPage();
  await page.goto('/'); await signIn(page, 'administrator');
  const site = `Expiry original ${fixture.runId}`;
  const edited = `Expiry pending ${fixture.runId}`;
  await completeRecord(page, site);
  await page.locator('.record-card').filter({ hasText: site }).getByRole('button', { name: 'Open' }).click();
  await context.setOffline(true);
  await replaceSiteName(page, edited);
  await page.getByRole('button', { name: /^(Complete record|Save changes)$/ }).click();
  await expect(page.locator('#syncStatus')).toHaveText('1 pending');
  // Expire only this disposable test browser session; no production credentials are used.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) => /^sb-.*-auth-token$/.test(name));
    const session = JSON.parse(localStorage.getItem(key));
    session.expires_at = 1;
    session.refresh_token = 'invalid-test-refresh-token';
    localStorage.setItem(key, JSON.stringify(session));
  });
  await page.close(); await context.setOffline(false);
  page = await context.newPage(); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('.record-card')).toHaveCount(0);
  await signIn(page, 'administrator');
  await expect(page.locator('.record-card').filter({ hasText: edited })).toBeVisible();
  const result = await fixture.admin.from('commissioning_records').select('payload,revision')
    .eq('organisation_id', fixture.organisationIds[0]).eq('payload->job->>siteName', edited);
  assert.equal(result.error, null); assert.equal(result.data.length, 1); assert.equal(result.data[0].revision, 2);
});

test('technician creation and offline reassignment preserve work without leaking other plants', async ({ browser }, testInfo) => {
  const phoneContext = await createLiveContext(browser);
  const phone = await phoneContext.newPage();
  await phone.goto('/'); await signIn(phone, 'technician');
  const site = `Assigned plant ${fixture.runId}`;
  await completeRecord(phone, site);
  await expect(phone.locator('#recordsTitle')).toHaveText('My commissioning');
  const card = (page, name = site) => page.locator('.record-card').filter({ hasText: name });
  await expect(card(phone).getByRole('button', { name: 'Print', exact: true })).toHaveCount(0);
  await expect(card(phone)).not.toContainText('Last saved');
  await phone.screenshot({ path: testInfo.outputPath('technician-list.png'), fullPage: true });
  const peer = await (await createLiveContext(browser)).newPage();
  await peer.goto('/'); await signIn(peer, 'peer');
  await expect(card(peer)).toHaveCount(0);
  const adminPage = await (await createLiveContext(browser)).newPage();
  await adminPage.goto('/'); await signIn(adminPage, 'administrator');
  await expect(card(adminPage)).toBeVisible();
  await card(phone).getByRole('button', { name: 'Open', exact: true }).click();
  await expect(phone.locator('#formView')).toBeVisible();
  await phone.screenshot({ path: testInfo.outputPath('technician-record.png'), fullPage: true });
  await phoneContext.setOffline(true);
  const offlineName = `Retained offline ${fixture.runId}`;
  await replaceSiteName(phone, offlineName);
  await phone.getByRole('button', { name: /^(Complete record|Save changes)$/ }).click();
  await expect(phone.locator('#syncStatus')).toHaveText('1 pending');
  await card(adminPage).getByRole('button', { name: 'Open', exact: true }).click();
  await adminPage.locator('#assignedTechnician').selectOption(fixture.users.peer.id);
  await adminPage.getByRole('button', { name: /^(Complete record|Save changes)$/ }).click();
  await expect(adminPage.locator('#formView')).toBeHidden();
  await expect(adminPage.locator('#syncStatus')).toContainText('Synced');
  await phoneContext.setOffline(false);
  await expect(card(phone, offlineName)).toHaveCount(0);
  await expect.poll(() => phone.evaluate(async () => (await commissioningStore.listSyncEntries(commissioningRemote.getState().membership.organisationId)).filter((entry) => entry.accessRevoked && entry.pendingRecord).length)).toBe(1);
  await peer.getByRole('button', { name: 'Sync now' }).click();
  await expect(card(peer)).toBeVisible();
  await expect(card(peer, offlineName)).toHaveCount(0);
  // An Administrator on the original device can review the retained edit.
  await phone.evaluate(() => commissioningRemote.signOut());
  await signIn(phone, 'administrator', '1 conflict');
  await expect(card(phone, offlineName).getByRole('button', { name: 'Resolve', exact: true })).toBeVisible();
  await card(phone, offlineName).getByRole('button', { name: 'Resolve', exact: true }).click();
  phone.once('dialog', (dialog) => dialog.accept());
  await phone.getByRole('button', { name: 'Keep technician version', exact: true }).click();
  await expect(phone.locator('#conflictDialog')).toBeHidden();
  await peer.getByRole('button', { name: 'Sync now' }).click();
  await expect(card(peer, offlineName)).toBeVisible();
});
