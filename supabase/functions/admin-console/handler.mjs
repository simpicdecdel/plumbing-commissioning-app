import { provisionUsers, validateUsers, createAdapter } from '../../../scripts/user-provisioning-core.mjs';

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const uuid = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) throw new ApiError(400, 'A valid ID is required.');
  return value;
};
async function data(result, message = 'Operation failed. Refresh before retrying.') {
  const { data, error } = await result;
  if (error) throw new ApiError(409, message);
  return data;
}

export function createHandler({ service, userClient, allowedOrigins, recoveryUrl }) {
  return async (request) => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (origin && !allowedOrigins.includes(origin)) return new Response('Origin denied', { status: 403 });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    let auditId;
    try {
      if (request.method !== 'POST') throw new ApiError(405, 'POST required.');
      const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) throw new ApiError(401, 'Sign in required.');
      const verified = await service.auth.getUser(token);
      if (verified.error || !verified.data?.user) throw new ApiError(401, 'Sign in again.');
      const actor = verified.data.user;
      const client = userClient(token);
      const raw = await request.text();
      if (raw.length > 32000) throw new ApiError(413, 'Request too large.');
      let body;
      try { body = JSON.parse(raw); } catch { throw new ApiError(400, 'Invalid request.'); }
      const controls = await data(service.from('account_controls').select('*').eq('user_id', actor.id).maybeSingle());
      if (controls?.disabled) throw new ApiError(403, 'This account is deactivated.');
      if (body.action === 'change_password') {
        if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 256) throw new ApiError(400, 'Use a password between 8 and 256 characters.');
        // Password update must succeed before the server-side access block clears.
        await data(service.auth.admin.updateUserById(actor.id, { password: body.password }), 'Password was not accepted. Access remains restricted.');
        if (controls?.require_password_change) {
          const cleared = await data(service.from('account_controls').update({ require_password_change:false, updated_at:new Date().toISOString() })
            .eq('user_id',actor.id).eq('updated_at',controls.updated_at).eq('disabled',false).select('user_id'));
          if (cleared.length !== 1) throw new ApiError(409, 'Account restrictions changed. Sign in again to check access.');
        }
        return reply({ ok: true });
      }
      if (controls?.require_password_change) throw new ApiError(403, 'Change your password before continuing.');
      const context = await client.rpc('admin_console_context');
      if (context.error || !context.data) throw new ApiError(403, 'Administrator access required.');
      const ctx = context.data;
      if (body.action === 'context') return reply(ctx);
      const actions = ['create_user', 'set_role', 'deactivate', 'reactivate', 'force_password_reset', 'send_password_reset', 'delete_user'];
      if (!actions.includes(body.action)) throw new ApiError(400, 'Unknown action.');
      if (!ctx.superAdministrator) throw new ApiError(403, 'Super administrator access required.');
      let target;
      if (body.action === 'create_user') {
        try { validateUsers([body.user]); } catch { throw new ApiError(400, 'Supply first name, surname, email and a valid role.'); }
        if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 256) throw new ApiError(400, 'Use an initial password between 8 and 256 characters.');
      } else {
        uuid(body.userId);
        if (body.userId === actor.id) throw new ApiError(409, 'Manage another account. Self-management is blocked here.');
        const memberships = await data(service.from('organisation_members').select('organisation_id,role').eq('user_id', body.userId));
        if (memberships.length !== 1 || memberships[0].organisation_id !== ctx.organisationId) throw new ApiError(403, 'Target is outside this organisation or has shared organisation access.');
        const operator = await data(service.from('console_operators').select('user_id').eq('user_id', body.userId).maybeSingle());
        if (operator) throw new ApiError(409, 'Super administrator accounts require a separate reviewed process.');
        const userResult = await data(service.auth.admin.getUserById(body.userId));
        target = userResult.user;
        if (body.action === 'set_role') {
          if (!['administrator','technician'].includes(body.role)) throw new ApiError(400, 'Invalid role.');
          if (body.role === 'administrator') {
            const assigned = await data(service.from('commissioning_records').select('id').eq('assigned_technician_id',body.userId).limit(1));
            if (assigned.length) throw new ApiError(409, 'Reassign this technician’s plants before changing their role.');
          }
        }
        if (body.action === 'delete_user') {
          const references = await data(service.from('commissioning_records').select('id')
            .or(`created_by.eq.${body.userId},updated_by.eq.${body.userId},deleted_by.eq.${body.userId},assigned_technician_id.eq.${body.userId}`).limit(1));
          if (references.length) throw new ApiError(409, 'This account is referenced by commissioning records. Deactivate it to preserve history.');
        }
      }
      // Audit intent must be durably stored before any administrative mutation.
      const audit = await data(service.from('admin_activity').insert({ organisation_id:ctx.organisationId, actor_id:actor.id,
        target_id:target?.id ?? null, action:body.action, status:'started',
        details:body.action === 'set_role' ? {role:body.role} : {} }).select('id').single());
      auditId = audit.id;
      let result = { ok:true };
      if (body.action === 'create_user') {
        const adapter = createAdapter(service);
        const add = adapter.addMembership;
        adapter.addMembership = async (row) => {
          // Covers a retry after Auth creation succeeded but membership failed.
          const existing = await data(service.from('account_controls').select('user_id').eq('user_id',row.user_id).maybeSingle());
          if (!existing) await data(service.from('account_controls').insert({ user_id:row.user_id, require_password_change:true }));
          return add(row);
        };
        const created = await provisionUsers({ users:[body.user], adapter, apply:true, password:body.password, organisationId:ctx.organisationId });
        await data(service.from('admin_activity').update({target_id:created[0].userId}).eq('id',auditId));
        result = { ok:true, results:created };
      }
      if (body.action === 'set_role') await data(service.from('organisation_members').update({role:body.role}).eq('user_id',target.id).eq('organisation_id',ctx.organisationId));
      if (['deactivate','reactivate','force_password_reset'].includes(body.action)) {
        const previous = await data(service.from('account_controls').select('*').eq('user_id',target.id).maybeSingle());
        await data(service.from('account_controls').upsert({user_id:target.id,
          disabled:body.action === 'force_password_reset' ? (previous?.disabled ?? false) : body.action === 'deactivate',
          require_password_change:body.action === 'force_password_reset' || (previous?.require_password_change ?? false), updated_at:new Date().toISOString()}));
      }
      if (body.action === 'send_password_reset') await data(service.auth.resetPasswordForEmail(target.email,{redirectTo:recoveryUrl}), 'Reset email could not be sent. Check mail delivery settings.');
      if (body.action === 'delete_user') await data(service.auth.admin.deleteUser(target.id), 'User deletion was blocked. Deactivate the account instead.');
      await data(service.from('admin_activity').update({status:'completed'}).eq('id',auditId), 'Action finished, but audit completion failed. Refresh before retrying.');
      return reply(result);
    } catch (error) {
      if (auditId) await service.from('admin_activity').update({status:'failed'}).eq('id',auditId);
      return reply({ error:error instanceof ApiError ? error.message : 'Operation did not finish. Refresh and inspect the account before retrying.' }, error instanceof ApiError ? error.status : 500);
    }
  };
}
