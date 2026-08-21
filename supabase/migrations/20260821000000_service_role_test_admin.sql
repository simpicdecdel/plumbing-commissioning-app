begin;

grant select, insert, update, delete
on table public.organisations,
  public.organisation_members,
  public.commissioning_records
to service_role;

commit;
