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

async function signIn(page, userKey) {
  const user = fixture.users[userKey];
  await expect.poll(() => page.evaluate(() => window.PLUMBING_APP_CONFIG?.supabaseUrl))
    .toBe(fixture.config.supabaseUrl);
  await page.getByRole('button', { name: 'Sign in' }).click();
  const form = page.locator('#signInForm');
  await form.getByLabel('Email').fill(user.email);
  await form.getByLabel('Password').fill(user.password);
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: user.role === 'administrator' ? 'Administrator' : 'Account' })).toBeVisible();
  await expect(page.locator('#syncStatus')).toContainText('Synced');
}

async function completeRecord(page, siteName) {
  await page.getByRole('button', { name: 'New record' }).click();
  await page.locator('#customer').fill(siteName);
  await page.locator('#address').fill('10 Automated Test Street, Sydney NSW');
  await page.locator('#technician').fill('Automated Test User');
  await page.locator('#plantName').fill('Automated Test Plant');
  await page.locator('[data-unit-field="label"]').first().fill('AUTO-HWS-01');
  await page.locator('#outcome').selectOption('Passed');
  await page.getByRole('button', { name: 'Complete record' }).click();
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
  await technicianPage.getByRole('button', { name: 'Complete record' }).click();
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
  await administratorPage.getByRole('button', { name: 'Complete record' }).click();
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
    await page.getByRole('button', { name: 'Complete record' }).click();
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
