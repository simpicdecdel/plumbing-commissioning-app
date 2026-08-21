import { expect, test } from '@playwright/test';

const mockRemoteClient = `
window.commissioningRemote = (() => {
  const recovery = new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
  let state = { user: null, membership: null, recovery };
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener(state));
  return {
    enabled: true,
    initialise: async () => state,
    getState: () => state,
    isRecovery: () => recovery,
    onStateChange: (listener) => listeners.add(listener),
    listRecords: async () => [],
    getRecord: async () => null,
    saveRecord: async () => undefined,
    deleteRecord: async () => undefined,
    sendPasswordResetEmail: async () => undefined,
    updatePassword: async () => {
      state = { user: { email: 'simpic@gmail.com' }, membership: { role: 'administrator', organisationName: 'Plumbing Commissioning' }, recovery: false };
      emit();
    },
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

test('opens sign-in and requests a password reset email', async ({ page }) => {
  await page.getByRole('button', { name: 'Sign in' }).click();
  const form = page.locator('#signInForm');
  await expect(form).toBeVisible();
  await expect(page.locator('#setPasswordForm')).toBeHidden();
  await form.getByLabel('Email').fill('simpic@gmail.com');
  await form.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.locator('#authMessage')).toHaveText('If an account exists for this email, a password reset link has been sent.');
});

test('requires an email address before requesting a password reset', async ({ page }) => {
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.locator('#authMessage')).toHaveText('Enter your email address, then select Forgot password.');
});

test('resets a password from a recovery link', async ({ page }) => {
  await page.goto('/?recovery-test=1#type=recovery');
  await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible();
  await expect(page.locator('#signInForm')).toBeHidden();
  await expect(page.locator('#setPasswordForm')).toBeVisible();
  await page.getByLabel('New password').fill('new-test-password');
  await page.getByLabel('Confirm password').fill('new-test-password');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.locator('#authMessage')).toHaveText('Password reset successfully.');
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
