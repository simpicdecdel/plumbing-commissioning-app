import { expect, test } from '@playwright/test';

const mockRemoteClient = `
window.commissioningRemote = (() => {
  let state = { user: null, membership: null, recovery: false };
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener(state));
  return {
    enabled: true,
    initialise: async () => state,
    getState: () => state,
    isRecovery: () => false,
    onStateChange: (listener) => listeners.add(listener),
    listRecords: async () => [],
    getRecord: async () => null,
    saveRecord: async () => undefined,
    deleteRecord: async () => undefined,
    sendPasswordSetupEmail: async () => undefined,
    signIn: async (email) => {
      state = { user: { email }, membership: { role: 'administrator', organisationName: 'Plumbing Commissioning' }, recovery: false };
      emit();
    },
    signOut: async () => { state = { user: null, membership: null, recovery: false }; emit(); }
  };
})();`;

test.beforeEach(async ({ page }) => {
  await page.route('**/vendor/remote-client.min.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: mockRemoteClient }));
  await page.goto('/');
});

test('opens sign-in and requests a password setup email', async ({ page }) => {
  await page.getByRole('button', { name: 'Sign in' }).click();
  const form = page.locator('#signInForm');
  await form.getByLabel('Email').fill('simpic@gmail.com');
  await form.getByRole('button', { name: 'Email password setup link' }).click();
  await expect(page.locator('#authMessage')).toHaveText('Password setup email sent. Open it on this device to continue.');
});

test('shows the administrator account after sign-in', async ({ page }) => {
  await page.getByRole('button', { name: 'Sign in' }).click();
  const form = page.locator('#signInForm');
  await form.getByLabel('Email').fill('simpic@gmail.com');
  await form.getByLabel('Password').fill('test-password');
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Administrator' })).toBeVisible();
  await expect(page.locator('#accountRole')).toContainText('administrator');
});
