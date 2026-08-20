begin;

create schema if not exists private;

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.organisation_members (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('technician', 'administrator')),
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);

create index organisation_members_user_id_idx
  on public.organisation_members(user_id);

create table public.commissioning_records (
  id uuid primary key,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  check ((deleted_at is null) = (deleted_by is null))
);

create index commissioning_records_org_updated_idx
  on public.commissioning_records(organisation_id, updated_at desc);

create index commissioning_records_org_deleted_idx
  on public.commissioning_records(organisation_id, deleted_at)
  where deleted_at is not null;

alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.commissioning_records enable row level security;

create or replace function private.is_organisation_member(target_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organisation_members as membership
    where membership.organisation_id = target_organisation_id
      and membership.user_id = auth.uid()
  );
$$;

create or replace function private.is_organisation_administrator(target_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organisation_members as membership
    where membership.organisation_id = target_organisation_id
      and membership.user_id = auth.uid()
      and membership.role = 'administrator'
  );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on function private.is_organisation_member(uuid) from public, anon;
revoke all on function private.is_organisation_administrator(uuid) from public, anon;
grant execute on function private.is_organisation_member(uuid) to authenticated;
grant execute on function private.is_organisation_administrator(uuid) to authenticated;

create policy organisations_select_for_members
on public.organisations
for select
to authenticated
using (private.is_organisation_member(id));

create policy organisation_members_select_for_members
on public.organisation_members
for select
to authenticated
using (private.is_organisation_member(organisation_id));

create policy commissioning_records_select_for_members
on public.commissioning_records
for select
to authenticated
using (
  private.is_organisation_member(organisation_id)
  and (
    deleted_at is null
    or private.is_organisation_administrator(organisation_id)
  )
);

revoke all on table public.organisations from anon, authenticated;
revoke all on table public.organisation_members from anon, authenticated;
revoke all on table public.commissioning_records from anon, authenticated;
grant select on table public.organisations to authenticated;
grant select on table public.organisation_members to authenticated;
grant select on table public.commissioning_records to authenticated;

create or replace function public.save_commissioning_record(
  record_id uuid,
  target_organisation_id uuid,
  record_payload jsonb,
  expected_revision bigint
)
returns public.commissioning_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  saved_record public.commissioning_records;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not private.is_organisation_member(target_organisation_id) then
    raise exception using errcode = '42501', message = 'Organisation access denied';
  end if;

  if record_payload is null or jsonb_typeof(record_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Record payload must be a JSON object';
  end if;

  if expected_revision = 0 then
    insert into public.commissioning_records (
      id,
      organisation_id,
      payload,
      revision,
      created_by,
      updated_by
    ) values (
      record_id,
      target_organisation_id,
      record_payload,
      1,
      current_user_id,
      current_user_id
    )
    on conflict (id) do nothing
    returning * into saved_record;
  elsif expected_revision > 0 then
    update public.commissioning_records
    set payload = record_payload,
        revision = revision + 1,
        updated_by = current_user_id,
        updated_at = now()
    where id = record_id
      and organisation_id = target_organisation_id
      and revision = expected_revision
      and deleted_at is null
    returning * into saved_record;
  else
    raise exception using errcode = '22023', message = 'Expected revision must be zero or greater';
  end if;

  if saved_record.id is null then
    raise exception using
      errcode = '40001',
      message = 'Record revision conflict',
      hint = 'Reload the current server record before resolving and retrying the edit.';
  end if;

  return saved_record;
end;
$$;

create or replace function public.soft_delete_commissioning_record(
  record_id uuid,
  target_organisation_id uuid,
  expected_revision bigint
)
returns public.commissioning_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  saved_record public.commissioning_records;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not private.is_organisation_administrator(target_organisation_id) then
    raise exception using errcode = '42501', message = 'Administrator access required';
  end if;

  update public.commissioning_records
  set revision = revision + 1,
      updated_by = current_user_id,
      updated_at = now(),
      deleted_at = now(),
      deleted_by = current_user_id
  where id = record_id
    and organisation_id = target_organisation_id
    and revision = expected_revision
    and deleted_at is null
  returning * into saved_record;

  if saved_record.id is null then
    raise exception using errcode = '40001', message = 'Record revision conflict';
  end if;

  return saved_record;
end;
$$;

create or replace function public.restore_commissioning_record(
  record_id uuid,
  target_organisation_id uuid,
  expected_revision bigint
)
returns public.commissioning_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  saved_record public.commissioning_records;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not private.is_organisation_administrator(target_organisation_id) then
    raise exception using errcode = '42501', message = 'Administrator access required';
  end if;

  update public.commissioning_records
  set revision = revision + 1,
      updated_by = current_user_id,
      updated_at = now(),
      deleted_at = null,
      deleted_by = null
  where id = record_id
    and organisation_id = target_organisation_id
    and revision = expected_revision
    and deleted_at is not null
  returning * into saved_record;

  if saved_record.id is null then
    raise exception using errcode = '40001', message = 'Record revision conflict';
  end if;

  return saved_record;
end;
$$;

revoke all on function public.save_commissioning_record(uuid, uuid, jsonb, bigint) from public, anon;
revoke all on function public.soft_delete_commissioning_record(uuid, uuid, bigint) from public, anon;
revoke all on function public.restore_commissioning_record(uuid, uuid, bigint) from public, anon;
grant execute on function public.save_commissioning_record(uuid, uuid, jsonb, bigint) to authenticated;
grant execute on function public.soft_delete_commissioning_record(uuid, uuid, bigint) to authenticated;
grant execute on function public.restore_commissioning_record(uuid, uuid, bigint) to authenticated;

commit;
