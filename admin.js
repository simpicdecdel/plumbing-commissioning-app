'use strict';
const remote = window.commissioningRemote;
const $ = (id) => document.getElementById(id);
const text = (tag, value, className) => { const node = document.createElement(tag); node.textContent = value ?? ''; if (className) node.className = className; return node; };
const date = (value) => value ? new Date(value).toLocaleString('en-AU') : 'Never';
let ctx = null, epoch = 0, currentTab = 'dashboard', opened = null, authKey = null;
const offsets = { records:0, users:0, activity:0 };
function message(value = '', error = false) { $('message').textContent = value; $('message').classList.toggle('error',error); }
async function busy(operation) {
  const buttons = [...document.querySelectorAll('button')].filter((button) => !button.disabled);
  buttons.forEach((button) => { button.disabled = true; });
  try { await operation(); } catch (error) { message(error.message,true); }
  finally { buttons.forEach((button) => { button.disabled = false; }); }
}
function cell(row, value) { const node = text('td',value); row.append(node); return node; }
function button(parent, label, operation) {
  const node = text('button',label); node.type = 'button'; node.addEventListener('click',() => busy(operation)); parent.append(node); return node;
}
function clearData() {
  ctx = null; opened = null;
  $('createUser').reset();
  for (const id of ['statistics','recordRows','userRows','activityRows','recordDetails','recordJson','identity']) $(id).replaceChildren();
  for (const dialog of document.querySelectorAll('dialog')) dialog.close();
  $('console').hidden = true;
}
async function authChanged(state) {
  const key = JSON.stringify({ user:state.user?.id, membership:state.membership, disabled:state.disabled, passwordChangeRequired:state.passwordChangeRequired });
  // Auth can re-emit SIGNED_IN on focus or token refresh. Do not erase an
  // administrator's chosen action or open record when their access is unchanged.
  if (key === authKey && ctx) return;
  authKey = key;
  const version = ++epoch;
  clearData();
  $('signInPanel').hidden = Boolean(state.user);
  $('passwordPanel').hidden = !state.passwordChangeRequired;
  $('signOut').hidden = !state.user;
  if (!navigator.onLine) { message('The admin console requires an online connection.'); return; }
  if (!state.user) { message('Sign in with an administrator account.'); return; }
  if (state.disabled) { $('passwordPanel').hidden = true; message('Your account is deactivated.',true); return; }
  if (state.passwordChangeRequired) { message('Change your password to continue.'); return; }
  try {
    const context = await remote.consoleRpc('admin_console_context');
    if (version !== epoch) return;
    ctx = context;
    $('identity').textContent = `${state.user.email} · ${ctx.superAdministrator ? 'Super administrator' : 'Administrator'}`;
    document.querySelectorAll('[data-super]').forEach((node) => { node.hidden = !ctx.superAdministrator; });
    if (!ctx.superAdministrator && ['users','activity'].includes(currentTab)) currentTab = 'dashboard';
    $('console').hidden = false;
    message(ctx.organisationName);
    await showTab(currentTab);
  } catch { if (version === epoch) message('Administrator access is required, or the console backend is unavailable.',true); }
}
async function showTab(tab) {
  if (!ctx) return;
  currentTab = tab;
  document.querySelectorAll('.panel').forEach((node) => { node.hidden = node.id !== tab; });
  document.querySelectorAll('[data-tab]').forEach((node) => { if (node.dataset.tab === tab) node.setAttribute('aria-current','page'); else node.removeAttribute('aria-current'); });
  await ({ dashboard:loadStats, records:loadRecords, users:loadUsers, activity:loadActivity })[tab]();
}
async function loadStats() {
  const version = epoch;
  const stats = await remote.consoleRpc('admin_console_statistics');
  if (!ctx || version !== epoch) return;
  $('statistics').replaceChildren();
  const labels = {active:'Active plants',completed:'Completed records',drafts:'Draft records',unassigned:'Unassigned plants',passed:'Passed',actions:'Passed with actions',failed:'Failed',deleted:'Deleted records',users:'User accounts'};
  for (const [key,label] of Object.entries(labels)) {
    const card = text('div','', 'stat'); card.append(text('span',label),text('strong',stats[key] ?? 0)); $('statistics').append(card);
  }
  $('asOf').textContent = `Database snapshot: ${date(stats.asOf)}`;
}
async function loadRecords() {
  const version = epoch;
  const result = await remote.consoleRecords({organisationId:ctx.organisationId, search:$('recordSearch').value.trim(),state:$('recordState').value,offset:offsets.records});
  if (!ctx || version !== epoch) return;
  $('recordRows').replaceChildren();
  for (const record of result.rows) {
    const row = document.createElement('tr'), p = record.payload || {};
    cell(row,p.job?.siteName || 'Unnamed site').append(text('small',p.plant?.name || 'Unnamed plant'));
    cell(row,record.deleted_at ? 'Deleted' : p.status).append(text('small',p.results?.outcome));
    cell(row,p.units?.length ?? 0); cell(row,record.assigned_technician_id ? 'Assigned' : 'Unassigned');
    cell(row,date(record.updated_at)); button(cell(row,''),'Open',() => openRecord(record.id)); $('recordRows').append(row);
  }
  $('recordCount').textContent = `${result.total} records · page ${offsets.records / 50 + 1}`;
  $('recordNext').hidden = offsets.records + 50 >= result.total; $('recordPrev').hidden = offsets.records === 0;
}
async function openRecord(id) {
  const version = epoch;
  const record = await remote.getRecord(ctx.organisationId,id);
  if (!ctx || version !== epoch) return;
  if (!record?.payload) throw new Error('Record is no longer available.');
  opened = record;
  $('recordTitle').textContent = record.payload.job?.siteName || 'Commissioning record';
  $('recordDetails').replaceChildren();
  for (const [title,values] of Object.entries({ 'Central record':{id:record.id,revision:record.revision,lastCentralSave:date(record.updated_at),deleted:record.deleted_at ? date(record.deleted_at) : 'No'},
    Job:record.payload.job, Plant:record.payload.plant, Results:record.payload.results, 'Installation checks':record.payload.installationChecks, Handover:record.payload.handover })) {
    $('recordDetails').append(text('h3',title));
    const grid = text('div','', 'details-grid');
    for (const [key,value] of Object.entries(values || {})) { const item = text('dl',''); item.append(text('dt',key.replace(/([A-Z])/g,' $1')),text('dd',typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value ?? ''))); grid.append(item); }
    $('recordDetails').append(grid);
  }
  $('recordDetails').append(text('h3','Units'));
  for (const unit of record.payload.units || []) $('recordDetails').append(text('p',Object.entries(unit).filter(([key])=>key!=='id').map(([key,value])=>`${key}: ${value}`).join(' · ')));
  $('recordJson').textContent = JSON.stringify(record,null,2);
  const technicians = await remote.listTechnicians(ctx.organisationId);
  if (!ctx || version !== epoch) return;
  $('assignment').replaceChildren(new Option('Unassigned',''), ...technicians.map((tech)=>new Option(tech.display_name,tech.user_id)));
  $('assignment').value = record.assigned_technician_id || '';
  $('assignmentLabel').hidden = Boolean(record.deleted_at); $('saveAssignment').hidden = Boolean(record.deleted_at);
  $('recordLifecycle').textContent = record.deleted_at ? 'Restore record' : 'Delete record';
  if (!$('recordDialog').open) $('recordDialog').showModal();
}
async function loadUsers() {
  const version = epoch;
  const result = await remote.consoleRpc('admin_console_users',{search_text:$('userSearch').value.trim(),page_offset:offsets.users});
  if (!ctx || version !== epoch) return;
  $('userRows').replaceChildren();
  for (const user of result.rows) {
    const row = document.createElement('tr'); cell(row,user.name || 'No name').append(text('small',user.email));
    cell(row,user.super_administrator ? 'Super administrator' : user.role);
    cell(row,user.disabled ? 'Deactivated' : user.require_password_change ? 'Password change required' : 'Active');
    cell(row,user.assigned_plants); cell(row,date(user.last_sign_in_at)); const actions = cell(row,'');
    if (user.super_administrator || user.id === ctx.userId) actions.append(text('span','Protected account'));
    else {
      const select = document.createElement('select'); select.setAttribute('aria-label',`Action for ${user.email}`);
      const options = [['','Choose action'],['send_password_reset','Send reset email'],['force_password_reset','Require password change'],[user.disabled?'reactivate':'deactivate',user.disabled?'Reactivate':'Deactivate'],['set_role',user.role==='technician'?'Make administrator':'Make technician'],['delete_user','Delete permanently']];
      for (const [value,label] of options) select.add(new Option(label,value));
      actions.append(select);
      button(actions,'Apply',async()=>{
        const action=select.value; if(!action) return;
        const label=select.selectedOptions[0].textContent;
        const warning=action==='delete_user'?' This permanently removes the login. Accounts referenced by records cannot be deleted.':action==='force_password_reset'?' Online record access will be blocked until they change their password. No email will be sent.':'';
        if(!confirm(`${label}: ${user.email}?${warning}`)) return;
        await remote.adminRequest({action,userId:user.id,role:user.role==='technician'?'administrator':'technician'});
        message(`${label} completed for ${user.email}.`); await loadUsers();
      });
    }
    $('userRows').append(row);
  }
  $('userCount').textContent=`${result.total} users · page ${offsets.users/50+1}`;
  $('userNext').hidden=offsets.users+50>=result.total; $('userPrev').hidden=offsets.users===0;
}
async function loadActivity() {
  const version=epoch;
  const rows=await remote.consoleRpc('admin_console_activity',{page_offset:offsets.activity});
  if(!ctx || version!==epoch) return;
  $('activityRows').replaceChildren();
  for(const item of rows){const row=document.createElement('tr');for(const value of [date(item.created_at),item.action,item.actor_id,item.target_id||'—',item.status]) cell(row,value);$('activityRows').append(row);}
  $('activityCount').textContent=`Page ${offsets.activity/50+1}`; $('activityPrev').hidden=offsets.activity===0; $('activityNext').hidden=rows.length<50;
}
document.querySelectorAll('[data-tab]').forEach((node)=>node.addEventListener('click',()=>busy(()=>showTab(node.dataset.tab))));
document.querySelectorAll('[data-close]').forEach((node)=>node.addEventListener('click',()=>$(node.dataset.close).close()));
$('userDialog').addEventListener('close',()=>$('createUser').reset());
for(const [kind,load] of [['record',loadRecords],['user',loadUsers],['activity',loadActivity]]){
  const key=kind==='activity'?'activity':`${kind}s`;
  $(kind+'Prev').addEventListener('click',()=>busy(async()=>{offsets[key]=Math.max(0,offsets[key]-50);await load();}));
  $(kind+'Next').addEventListener('click',()=>busy(async()=>{offsets[key]+=50;await load();}));
}
$('refreshStats').addEventListener('click',()=>busy(loadStats));
$('recordSearchForm').addEventListener('submit',(e)=>{e.preventDefault();offsets.records=0;busy(loadRecords);});
$('userSearchForm').addEventListener('submit',(e)=>{e.preventDefault();offsets.users=0;busy(loadUsers);});
$('login').addEventListener('submit',(e)=>{e.preventDefault();busy(async()=>{const fields=new FormData(e.target);await remote.signIn(fields.get('email'),fields.get('password'));e.target.reset();});});
$('signOut').addEventListener('click',()=>busy(()=>remote.signOut()));
$('passwordForm').addEventListener('submit',(e)=>{e.preventDefault();busy(async()=>{const fields=new FormData(e.target);if(fields.get('password')!==fields.get('confirm'))throw new Error('Passwords do not match.');await remote.updatePassword(fields.get('password'));e.target.reset();});});
$('newUser').addEventListener('click',()=>{$('createUser').reset();$('createMessage').textContent='';$('userDialog').showModal();});
$('createUser').addEventListener('submit',(e)=>{e.preventDefault();busy(async()=>{
  const fields=Object.fromEntries(new FormData(e.target)); const {password,...user}=fields;
  try{const result=await remote.adminRequest({action:'create_user',user,password});e.target.reset();$('userDialog').close();message(`${user.email}: ${result.results[0].status}.`);await loadUsers();}
  catch(error){$('createMessage').textContent=error.message;throw error;}
});});
$('saveAssignment').addEventListener('click',()=>busy(async()=>{
  const record=opened;
  await remote.saveRecord({remoteId:record.id,organisationId:ctx.organisationId,expectedRevision:record.revision,record:{...record.payload,assignedTechnicianId:$('assignment').value||null}});
  await openRecord(record.id);await loadRecords();message('Assignment saved.');
}));
$('recordLifecycle').addEventListener('click',()=>busy(async()=>{
  const record=opened; const action=record.deleted_at?'restoreRecord':'deleteRecord';
  if(!confirm(`${record.deleted_at?'Restore':'Delete'} this commissioning record?`))return;
  await remote[action]({remoteId:record.id,organisationId:ctx.organisationId,expectedRevision:record.revision});
  $('recordDialog').close();await loadRecords();message('Record updated.');
}));
$('printRecord').addEventListener('click',()=>window.print());
$('exportRecord').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(opened,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`commissioning-${opened.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
window.addEventListener('offline',()=>{++epoch;clearData();message('The admin console requires an online connection.');});
window.addEventListener('online',()=>busy(()=>remote.refreshAccess()));
if(remote?.enabled){remote.onStateChange(authChanged);remote.initialise().catch(()=>message('Could not initialise sign-in.',true));}
else message('The admin console is not configured.',true);
