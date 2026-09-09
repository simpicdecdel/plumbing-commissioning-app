import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createHandler } from '../../supabase/functions/admin-console/handler.mjs';
import { createLiveTestFixture, cleanupLiveTestFixture, signInFixtureUser, TEST_PURPOSE } from './live-test-fixture.mjs';

test('admin console permissions, account controls, lifecycle and audit', { timeout:120000 }, async(t)=>{
  const f=await createLiveTestFixture();
  const sessions={};
  const localHandler=createHandler({service:f.admin,allowedOrigins:['https://console.example.invalid'],recoveryUrl:'https://console.example.invalid/',
    userClient:(token)=>createClient(f.config.supabaseUrl,f.config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`},fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(15000)})}})});
  const handler=process.env.PLUMBING_ADMIN_EDGE_TESTS==='1'
    ? (request)=>fetch(`${f.config.supabaseUrl}/functions/v1/admin-console`,{method:request.method,headers:request.headers,body:request.body,duplex:'half',signal:AbortSignal.timeout(20000)})
    : localHandler;
  const call=async(key,body)=>{
    const response=await handler(new Request('https://edge.example.invalid',{method:'POST',headers:{Authorization:`Bearer ${sessions[key].session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body)}));
    return {status:response.status,body:await response.json()};
  };
  let createdId;
  try {
    assert.equal((await handler(new Request('https://edge.example.invalid',{method:'POST',body:'{}'}))).status,401);
    for(const key of ['administrator','technician','peer','outsider']) sessions[key]=await signInFixtureUser(f,key);
    await t.test('ordinary administrator can read statistics but not users or privileged operations',async()=>{
      assert.equal((await sessions.administrator.client.rpc('admin_console_statistics')).error,null);
      assert.ok((await sessions.administrator.client.rpc('admin_console_users')).error);
      assert.equal((await call('administrator',{action:'deactivate',userId:f.users.technician.id})).status,403);
      assert.equal((await call('technician',{action:'context'})).status,403);
      assert.ok((await sessions.technician.client.rpc('admin_console_statistics')).error);
      assert.ok((await sessions.technician.client.from('account_controls').upsert({user_id:f.users.technician.id,disabled:false,require_password_change:false})).error);
    });
    const operator=await f.admin.from('console_operators').insert({user_id:f.users.administrator.id,organisation_id:f.organisationIds[0]});assert.equal(operator.error,null);
    await t.test('super administrator is server-controlled, scoped and cannot modify themselves',async()=>{
      assert.equal((await call('administrator',{action:'context'})).body.superAdministrator,true);
      assert.equal((await call('administrator',{action:'deactivate',userId:f.users.outsider.id})).status,403);
      assert.equal((await call('administrator',{action:'deactivate',userId:f.users.administrator.id})).status,409);
      assert.ok((await sessions.technician.client.from('console_operators').insert({user_id:f.users.technician.id,organisation_id:f.organisationIds[0]})).error);
    });
    const recordId=randomUUID();
    const save=await sessions.administrator.client.rpc('save_commissioning_record',{record_id:recordId,target_organisation_id:f.organisationIds[0],expected_revision:0,record_payload:{id:recordId,status:'Completed',job:{siteName:'Console test'},results:{outcome:'Passed with actions'},assignedTechnicianId:f.users.technician.id}});assert.equal(save.error,null);
    await t.test('statistics reflect actual statuses and protected deletion keeps record history',async()=>{
      const stats=await sessions.administrator.client.rpc('admin_console_statistics');assert.equal(stats.data.completed,1);assert.equal(stats.data.actions,1);
      assert.equal((await call('administrator',{action:'delete_user',userId:f.users.technician.id})).status,409);
      assert.equal((await call('administrator',{action:'set_role',userId:f.users.technician.id,role:'administrator'})).status,409);
    });
    await t.test('deactivation blocks existing sessions and old RPCs immediately; reactivation restores access',async()=>{
      assert.equal((await call('administrator',{action:'deactivate',userId:f.users.technician.id})).status,200);
      const rows=await sessions.technician.client.from('commissioning_records').select('id');assert.equal(rows.error,null);assert.equal(rows.data.length,0);
      assert.ok((await sessions.technician.client.rpc('sync_assigned_commissioning_records',{target_organisation_id:f.organisationIds[0]})).error);
      assert.equal((await call('technician',{action:'change_password',password:'new-password-1234'})).status,403);
      assert.equal((await call('administrator',{action:'reactivate',userId:f.users.technician.id})).status,200);
      assert.equal((await sessions.technician.client.from('commissioning_records').select('id')).data.length,1);
    });
    await t.test('forced password change blocks record access until successful password change',async()=>{
      assert.equal((await call('administrator',{action:'force_password_reset',userId:f.users.technician.id})).status,200);
      assert.equal((await sessions.technician.client.rpc('get_my_access_controls')).data.passwordChangeRequired,true);
      assert.equal((await sessions.technician.client.from('commissioning_records').select('id')).data.length,0);
      assert.ok((await sessions.technician.client.rpc('save_commissioning_record',{record_id:recordId,target_organisation_id:f.organisationIds[0],expected_revision:1,record_payload:{id:recordId}})).error);
      assert.equal((await call('technician',{action:'change_password',password:'bad'})).status,400);
      const changed=await call('technician',{action:'change_password',password:'new-password-1234'});assert.equal(changed.status,200,JSON.stringify(changed.body));
      assert.equal((await sessions.technician.client.rpc('get_my_access_controls')).data.passwordChangeRequired,false);
    });
    await t.test('create, repeat, change role and delete an unused account; capture audit',async()=>{
      const user={firstName:'Console',surname:'Test',email:`plumbing-live-${f.runId}-console@example.invalid`,role:'technician'};
      const result=await call('administrator',{action:'create_user',user,password:'initial-password-1234'});assert.equal(result.status,200,JSON.stringify(result.body));
      createdId=result.body.results[0].userId;f.users.console={id:createdId};
      await f.admin.auth.admin.updateUserById(createdId,{user_metadata:{test_purpose:TEST_PURPOSE,test_run_id:f.runId}});
      const control=await f.admin.from('account_controls').select('*').eq('user_id',createdId).single();assert.equal(control.data.require_password_change,true);
      assert.equal((await call('administrator',{action:'create_user',user,password:'changed-input-password'})).body.results[0].status,'already exists');
      assert.equal((await call('administrator',{action:'set_role',userId:createdId,role:'administrator'})).status,200);
      assert.equal((await call('administrator',{action:'delete_user',userId:createdId})).status,200);delete f.users.console;
      const audit=await sessions.administrator.client.rpc('admin_console_activity');assert.equal(audit.error,null);
      assert.ok(audit.data.some(event=>event.action==='delete_user'&&event.status==='completed'&&event.target_id===createdId));
      assert.ok(!JSON.stringify(audit.data).includes('initial-password-1234'));
    });
    await t.test('revoking operator capability immediately blocks privileged requests',async()=>{
      await f.admin.from('console_operators').delete().eq('user_id',f.users.administrator.id);
      assert.equal((await call('administrator',{action:'deactivate',userId:f.users.peer.id})).status,403);
    });
  } finally {
    await f.admin.from('console_operators').delete().in('organisation_id',f.organisationIds);
    for(const session of Object.values(sessions)) await session.client.auth.signOut();
    await cleanupLiveTestFixture(f);
  }
});
