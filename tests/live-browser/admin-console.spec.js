import { expect, test } from '@playwright/test';
import { createLiveTestFixture, cleanupLiveTestFixture } from '../live/live-test-fixture.mjs';

test('real console lists users and forces the field app through a password change',async({browser})=>{
  const f=await createLiveTestFixture();
  const adminContext=await browser.newContext({viewport:{width:1440,height:1000},isMobile:false});
  const techContext=await browser.newContext();
  try{
    const operator=await f.admin.from('console_operators').insert({user_id:f.users.administrator.id,organisation_id:f.organisationIds[0]});
    expect(operator.error).toBeNull();
    const admin=await adminContext.newPage();
    admin.on('requestfailed',request=>{if(new URL(request.url()).pathname.includes('/functions/'))console.error(`Admin function request failed: ${request.failure()?.errorText}`);});
    await admin.goto('/admin.html');
    await admin.locator('#login input[name=email]').fill(f.users.administrator.email);
    await admin.locator('#login input[name=password]').fill(f.users.administrator.password);
    await admin.locator('#login button').click();
    await expect(admin.locator('#identity')).toContainText('Super administrator');
    await admin.getByRole('button',{name:'Users',exact:true}).click();
    await expect(admin.locator('#userRows')).toContainText(f.users.technician.email);
    await admin.getByLabel(`Action for ${f.users.technician.email}`).selectOption('force_password_reset');
    admin.once('dialog',dialog=>dialog.accept());
    await admin.locator('tr').filter({has:admin.getByLabel(`Action for ${f.users.technician.email}`)}).getByRole('button',{name:'Apply',exact:true}).click();
    await expect(admin.locator('tr').filter({has:admin.getByLabel(`Action for ${f.users.technician.email}`)})).toContainText('Password change required');
    const tech=await techContext.newPage();await tech.goto('/');
    await tech.locator('#accountButton').click();
    await tech.locator('#authEmail').fill(f.users.technician.email);await tech.locator('#authPassword').fill(f.users.technician.password);
    await tech.locator('#signInForm button[type=submit]').click();
    await expect(tech.locator('#setPasswordForm')).toBeVisible();
    await expect(tech.locator('#newRecordButton')).toBeDisabled();
    // Windows WebKit can fail navigation internally when setOffline is active.
    // Reinitialise auth to exercise the same cached-access path without navigation.
    await techContext.setOffline(true);
    await tech.evaluate(()=>window.commissioningRemote.initialise());
    await expect(tech.locator('#setPasswordForm')).toBeVisible();
    await expect(tech.locator('#newRecordButton')).toBeDisabled();
    await techContext.setOffline(false);
    const password='browser-reset-password-1234';
    await tech.locator('#newPassword').fill(password);await tech.locator('#confirmPassword').fill(password);
    await tech.locator('#setPasswordForm button[type=submit]').click();
    await expect(tech.locator('#authMessage')).toContainText('Password reset successfully');
    await expect(tech.locator('#newRecordButton')).toBeEnabled();
    const controls=await f.admin.from('account_controls').select('require_password_change').eq('user_id',f.users.technician.id).single();
    expect(controls.data.require_password_change).toBe(false);
  }finally{
    await adminContext.close();await techContext.close();
    await f.admin.from('console_operators').delete().in('organisation_id',f.organisationIds);
    await cleanupLiveTestFixture(f);
  }
});
