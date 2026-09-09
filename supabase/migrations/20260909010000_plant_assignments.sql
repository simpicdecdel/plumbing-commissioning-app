begin;

-- Existing records deliberately remain unassigned. Names are not account IDs.
alter table public.commissioning_records add column if not exists assigned_technician_id uuid references auth.users(id) on delete restrict;
create index if not exists commissioning_records_assignee_idx on public.commissioning_records(organisation_id, assigned_technician_id);

drop policy commissioning_records_select_for_members on public.commissioning_records;
create policy commissioning_records_select_for_members on public.commissioning_records for select to authenticated
using (private.is_organisation_member(organisation_id) and
  (private.is_organisation_administrator(organisation_id) or
   (assigned_technician_id = auth.uid() and deleted_at is null)));

create or replace function public.save_commissioning_record(record_id uuid, target_organisation_id uuid, record_payload jsonb, expected_revision bigint)
returns public.commissioning_records language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  administrator boolean := private.is_organisation_administrator(target_organisation_id);
  previous public.commissioning_records;
  saved public.commissioning_records;
  assignee uuid;
  canonical jsonb;
begin
  if actor is null or not private.is_organisation_member(target_organisation_id) then
    raise exception using errcode = '42501', message = 'Organisation access denied';
  end if;
  if record_payload is null or jsonb_typeof(record_payload) <> 'object' or expected_revision is null or expected_revision < 0 then
    raise exception using errcode = '22023', message = 'Valid payload and revision required';
  end if;
  select * into previous from public.commissioning_records where id = record_id and organisation_id = target_organisation_id for update;
  if expected_revision > 0 and previous.id is not null and not administrator and previous.assigned_technician_id is distinct from actor then
    raise exception using errcode = '42501', message = 'This plant is no longer assigned to you';
  end if;
  if administrator then
    assignee := case when record_payload ? 'assignedTechnicianId' then nullif(record_payload->>'assignedTechnicianId', '')::uuid else previous.assigned_technician_id end;
  else
    assignee := actor;
    if record_payload ? 'assignedTechnicianId' and nullif(record_payload->>'assignedTechnicianId', '')::uuid is distinct from actor then
      raise exception using errcode = '42501', message = 'Only Administrators can change assignments';
    end if;
  end if;
  if assignee is not null and not exists (select 1 from public.organisation_members where organisation_id = target_organisation_id and user_id = assignee and role = 'technician') then
    raise exception using errcode = '22023', message = 'Choose a technician in this organisation';
  end if;
  canonical := record_payload || jsonb_build_object('assignedTechnicianId', assignee, 'localOrganisationId', target_organisation_id);
  if expected_revision = 0 then
    insert into public.commissioning_records(id, organisation_id, payload, created_by, updated_by, assigned_technician_id)
    values(record_id, target_organisation_id, canonical, actor, actor, assignee)
    on conflict (id) do nothing returning * into saved;
  else
    update public.commissioning_records set payload = canonical, assigned_technician_id = assignee,
      revision = revision + 1, updated_at = now(), updated_by = actor
    where id = record_id and organisation_id = target_organisation_id and revision = expected_revision and deleted_at is null
    returning * into saved;
  end if;
  if saved.id is null then raise exception using errcode = 'PT409', message = 'Record revision conflict'; end if;
  return saved;
end;
$$;

-- One snapshot supplies visible records and withdrawal notices for IDs already
-- held by this device. Never infer revocation from a failed/partial table read.
create or replace function public.sync_assigned_commissioning_records(target_organisation_id uuid, known_record_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_organisation_member(target_organisation_id) then
    raise exception using errcode = '42501', message = 'Organisation access denied';
  end if;
  return (with visible as (
    select r.id, r.payload || jsonb_build_object('assignedTechnicianId', r.assigned_technician_id) as payload,
      r.assigned_technician_id, r.revision, r.updated_at, r.deleted_at
    from public.commissioning_records r where r.organisation_id = target_organisation_id
    and (private.is_organisation_administrator(target_organisation_id) or (r.assigned_technician_id = auth.uid() and r.deleted_at is null))
  ) select jsonb_build_object(
    'records', coalesce((select jsonb_agg(to_jsonb(v)) from visible v), '[]'::jsonb),
    'withdrawn', coalesce((select jsonb_agg(k.id) from (select distinct unnest(known_record_ids) as id) k
      where exists(select 1 from public.commissioning_records r where r.id = k.id and r.organisation_id = target_organisation_id)
      and not exists(select 1 from visible v where v.id = k.id)), '[]'::jsonb)
  ));
end;
$$;

create or replace function public.list_assignable_technicians(target_organisation_id uuid)
returns table(user_id uuid, display_name text) language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_organisation_administrator(target_organisation_id) then
    raise exception using errcode = '42501', message = 'Administrator access required';
  end if;
  return query select m.user_id, coalesce(nullif(u.raw_user_meta_data->>'full_name',''), nullif(u.raw_user_meta_data->>'name',''), u.email)::text
    from public.organisation_members m join auth.users u on u.id = m.user_id
    where m.organisation_id = target_organisation_id and m.role = 'technician';
end;
$$;

create or replace function public.list_commissioning_deletions(target_organisation_id uuid)
returns table(id uuid, revision bigint, updated_at timestamptz, deleted_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_organisation_member(target_organisation_id) then
    raise exception using errcode = '42501', message = 'Organisation membership required';
  end if;
  return query select r.id, r.revision, r.updated_at, r.deleted_at from public.commissioning_records r
    where r.organisation_id = target_organisation_id and r.deleted_at is not null
    and (private.is_organisation_administrator(target_organisation_id) or r.assigned_technician_id = auth.uid());
end;
$$;

revoke all on function public.sync_assigned_commissioning_records(uuid, uuid[]) from public, anon;
revoke all on function public.list_assignable_technicians(uuid) from public, anon;
grant execute on function public.sync_assigned_commissioning_records(uuid, uuid[]) to authenticated;
grant execute on function public.list_assignable_technicians(uuid) to authenticated;
commit;
