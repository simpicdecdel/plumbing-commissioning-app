begin;

-- Members need deletion markers to remove cached copies, not deleted payloads.
create or replace function public.list_commissioning_deletions(target_organisation_id uuid)
returns table(id uuid, revision bigint, updated_at timestamptz, deleted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_organisation_member(target_organisation_id) then
    raise exception using errcode = '42501', message = 'Organisation membership required';
  end if;
  return query select r.id, r.revision, r.updated_at, r.deleted_at
    from public.commissioning_records r
    where r.organisation_id = target_organisation_id and r.deleted_at is not null;
end;
$$;

revoke all on function public.list_commissioning_deletions(uuid) from public, anon;
grant execute on function public.list_commissioning_deletions(uuid) to authenticated;
commit;
