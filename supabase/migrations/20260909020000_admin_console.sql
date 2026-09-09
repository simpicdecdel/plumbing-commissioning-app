begin;

create table public.console_operators (
  user_id uuid primary key references auth.users(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete cascade
);
create table public.account_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  disabled boolean not null default false,
  require_password_change boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.admin_activity (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_id uuid not null,
  target_id uuid,
  action text not null,
  status text not null check(status in ('started','completed','failed')),
  created_at timestamptz not null default now(),
  details jsonb not null default '{}'
);
create index admin_activity_org_time on public.admin_activity(organisation_id, created_at desc);
alter table public.console_operators enable row level security;
alter table public.account_controls enable row level security;
alter table public.admin_activity enable row level security;
revoke all on public.console_operators, public.account_controls, public.admin_activity from public, anon, authenticated;
grant all on public.console_operators, public.account_controls, public.admin_activity to service_role;

create or replace function private.account_allowed(target_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_user is not null and not exists(
    select 1 from public.account_controls where user_id=target_user and (disabled or require_password_change)
  );
$$;
revoke all on function private.account_allowed(uuid) from public, anon, authenticated;

-- All existing record RPCs and table policies call these functions. Restrict
-- old clients too, without trusting cached role claims or profile metadata.
create or replace function private.is_organisation_member(target_organisation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.account_allowed(auth.uid()) and exists(select 1 from public.organisation_members
    where organisation_id=target_organisation_id and user_id=auth.uid());
$$;
create or replace function private.is_organisation_administrator(target_organisation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.account_allowed(auth.uid()) and exists(select 1 from public.organisation_members
    where organisation_id=target_organisation_id and user_id=auth.uid() and role='administrator');
$$;

create function public.get_my_access_controls()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('disabled', coalesce((select disabled from public.account_controls where user_id=auth.uid()), false),
    'passwordChangeRequired', coalesce((select require_password_change from public.account_controls where user_id=auth.uid()), false));
$$;

create function public.admin_console_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare member public.organisation_members; org_name text;
begin
  if not private.account_allowed(auth.uid()) then raise exception using errcode='42501', message='Account restricted'; end if;
  select * into member from public.organisation_members where user_id=auth.uid();
  if member.role is distinct from 'administrator' or (select count(*) from public.organisation_members where user_id=auth.uid()) <> 1 then
    raise exception using errcode='42501', message='Administrator access required';
  end if;
  select name into org_name from public.organisations where id=member.organisation_id;
  return jsonb_build_object('userId',auth.uid(),'organisationId',member.organisation_id,'organisationName',org_name,
    'superAdministrator',exists(select 1 from public.console_operators where user_id=auth.uid() and organisation_id=member.organisation_id));
end;
$$;

create function public.admin_console_statistics()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ctx jsonb; org uuid;
begin
  ctx := public.admin_console_context(); org := (ctx->>'organisationId')::uuid;
  return (select jsonb_build_object('active',count(*) filter(where deleted_at is null),
    'deleted',count(*) filter(where deleted_at is not null),
    'unassigned',count(*) filter(where deleted_at is null and assigned_technician_id is null),
    'completed',count(*) filter(where deleted_at is null and payload->>'status'='Completed'),
    'drafts',count(*) filter(where deleted_at is null and payload->>'status'='Draft'),
    'passed',count(*) filter(where deleted_at is null and payload->'results'->>'outcome'='Passed'),
    'actions',count(*) filter(where deleted_at is null and payload->'results'->>'outcome'='Passed with actions'),
    'failed',count(*) filter(where deleted_at is null and payload->'results'->>'outcome'='Failed'),
    'users',(select count(*) from public.organisation_members where organisation_id=org),
    'asOf',now()) from public.commissioning_records where organisation_id=org);
end;
$$;

create function public.admin_console_users(search_text text default '', page_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ctx jsonb; org uuid; result jsonb;
begin
  ctx := public.admin_console_context(); org := (ctx->>'organisationId')::uuid;
  if not (ctx->>'superAdministrator')::boolean then raise exception using errcode='42501', message='Super administrator required'; end if;
  if page_offset < 0 or length(search_text)>200 then raise exception using errcode='22023', message='Invalid search'; end if;
  with matched as (
    select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name','') as name, m.role,
      u.last_sign_in_at, coalesce(c.disabled,false) as disabled, coalesce(c.require_password_change,false) as require_password_change,
      exists(select 1 from public.console_operators where user_id=u.id) as super_administrator,
      (select count(*) from public.commissioning_records r where r.organisation_id=org and r.assigned_technician_id=u.id and r.deleted_at is null) as assigned_plants
    from public.organisation_members m join auth.users u on u.id=m.user_id
    left join public.account_controls c on c.user_id=u.id
    where m.organisation_id=org and (u.email ilike '%'||search_text||'%' or coalesce(u.raw_user_meta_data->>'full_name','') ilike '%'||search_text||'%')
  ) select jsonb_build_object('total',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(p)) from
    (select * from matched order by email,id limit 50 offset page_offset) p),'[]'::jsonb)) into result;
  return result;
end;
$$;

create function public.admin_console_activity(page_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ctx jsonb;
begin
  ctx := public.admin_console_context();
  if not (ctx->>'superAdministrator')::boolean then raise exception using errcode='42501', message='Super administrator required'; end if;
  if page_offset < 0 then raise exception using errcode='22023', message='Invalid offset'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(a)),'[]') from (select * from public.admin_activity
    where organisation_id=(ctx->>'organisationId')::uuid order by created_at desc,id limit 50 offset page_offset) a);
end;
$$;

revoke all on function public.get_my_access_controls(), public.admin_console_context(), public.admin_console_statistics(),
  public.admin_console_users(text,integer), public.admin_console_activity(integer) from public, anon;
grant execute on function public.get_my_access_controls(), public.admin_console_context(), public.admin_console_statistics(),
  public.admin_console_users(text,integer), public.admin_console_activity(integer) to authenticated;

-- Provision the first operator explicitly at deployment, by verified account ID.
-- No email matching or implicit privilege grants run in this migration.
create function private.audit_record_administration()
returns trigger language plpgsql security definer set search_path = '' as $$
declare operation text;
begin
  if new.deleted_at is distinct from old.deleted_at then
    operation := case when new.deleted_at is null then 'restore_record' else 'delete_record' end;
  elsif new.assigned_technician_id is distinct from old.assigned_technician_id then operation := 'assign_record';
  end if;
  if operation is not null then
    insert into public.admin_activity(organisation_id,actor_id,target_id,action,status,details)
    values(new.organisation_id,coalesce(auth.uid(),new.updated_by),new.id,operation,'completed',
      jsonb_build_object('revision',new.revision,'assignedTechnicianId',new.assigned_technician_id));
  end if;
  return new;
end;
$$;
revoke all on function private.audit_record_administration() from public,anon,authenticated;
create trigger record_administration_audit after update on public.commissioning_records for each row execute function private.audit_record_administration();
commit;
