import { test, expect } from '@playwright/test';
test.use({ viewport:{width:1440,height:1000}, isMobile:false });

async function consoleMock(page,{superAdministrator=true,role='administrator',passwordChangeRequired=false}={}) {
  await page.route('**/vendor/remote-client.min.js*',route=>route.fulfill({contentType:'text/javascript',body:`
    const listeners=[];
    let state={user:{id:'operator',email:'operator@example.invalid'},membership:{organisationId:'org',role:${JSON.stringify(role)}},passwordChangeRequired:${passwordChangeRequired}};
    const context={userId:'operator',organisationId:'org',organisationName:'Test organisation',superAdministrator:${superAdministrator}};
    const record={id:'plant-1',revision:2,updated_at:'2026-09-09T02:00:00Z',assigned_technician_id:null,deleted_at:null,payload:{status:'Completed',job:{siteName:'Demonstration site',address:'Example address'},plant:{name:'Hot water plant'},results:{outcome:'Passed'},units:[]}};
    window.adminCalls=[];
    window.commissioningRemote={enabled:true,onStateChange(fn){listeners.push(fn)},async initialise(){listeners.forEach(fn=>fn(state));return state},
      async signOut(){state={};listeners.forEach(fn=>fn(state))},async updatePassword(){state.passwordChangeRequired=false;listeners.forEach(fn=>fn(state))},
      async consoleRpc(name){if(${JSON.stringify(role)}!=='administrator')throw Error('Denied');
        if(name==='admin_console_context')return context;
        if(name==='admin_console_statistics')return {active:5,completed:3,unassigned:2,passed:2,actions:1,failed:0,drafts:2,deleted:1,users:3,asOf:'2026-09-09T02:00:00Z'};
        if(name==='admin_console_users')return {total:2,rows:[{id:'operator',email:'operator@example.invalid',name:'Operator',role:'administrator',super_administrator:true,assigned_plants:0},{id:'tech',email:'tech@example.invalid',name:'<img src=x onerror=alert(1)>',role:'technician',assigned_plants:1}]};
        return [{action:'create_user',actor_id:'operator',target_id:'tech',status:'completed',created_at:'2026-09-09T02:00:00Z'}];},
      async consoleRecords(){return {rows:[record],total:1}},async getRecord(){return record},async listTechnicians(){return [{user_id:'tech',display_name:'Test technician'}]},
      async adminRequest(body){window.adminCalls.push(body);return {ok:true,results:[{status:'ready'}]}},async saveRecord(body){window.adminCalls.push(body)},async refreshAccess(){listeners.forEach(fn=>fn(state))}
    };`}));
  await page.goto('/admin.html');
}

test('desktop super administrator can inspect records and manage users with explicit actions',async({page})=>{
  await consoleMock(page);
  await expect(page.locator('#statistics')).toContainText('Active plants');
  await page.screenshot({path:'.env.admin-console-preview.png',fullPage:true});
  await page.getByRole('button',{name:'Records',exact:true}).click();
  await page.getByRole('button',{name:'Open',exact:true}).click();
  await expect(page.locator('#recordDialog')).toContainText('Hot water plant');
  await expect(page.locator('#recordJson')).toContainText('plant-1');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Users',exact:true}).click();
  await expect(page.locator('#userRows')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#userRows img')).toHaveCount(0);
  await page.getByLabel('Action for tech@example.invalid').selectOption('force_password_reset');
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.adminCalls[0]?.action)).toBe('force_password_reset');
  await page.getByRole('button',{name:'Add user',exact:true}).click();
  await page.getByLabel('First name',{exact:true}).fill('Test');await page.getByLabel('Surname',{exact:true}).fill('Person');
  await page.locator('#createUser input[name=email]').fill('test+002@example.invalid');
  await page.getByLabel('Initial password').fill('initial-password-1234');
  await page.getByRole('button',{name:'Create user',exact:true}).click();
  await expect(page.locator('#userDialog')).not.toBeVisible();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.locator('#console')).toBeHidden();await expect(page.locator('#userRows')).toBeEmpty();
});

test('ordinary administrator sees records and overview without user controls',async({page})=>{
  await consoleMock(page,{superAdministrator:false});
  await expect(page.locator('#statistics')).toContainText('Active plants');
  await expect(page.getByRole('button',{name:'Users',exact:true})).toBeHidden();
  await expect(page.getByRole('button',{name:'Activity',exact:true})).toBeHidden();
});

test('technicians cannot open the console and forced password changes show only the password form',async({page})=>{
  await consoleMock(page,{role:'technician'});
  await expect(page.locator('#console')).toBeHidden();
  await expect(page.locator('#message')).toContainText('Administrator access is required');
  await consoleMock(page,{passwordChangeRequired:true});
  await expect(page.locator('#passwordPanel')).toBeVisible();
  await expect(page.locator('#console')).toBeHidden();
});
