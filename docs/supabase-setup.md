# Supabase multi-user foundation

This document covers the database foundation for the accepted multi-user design. The v0.3.0 PWA remains local-only until authentication, synchronisation and migration have been connected and verified.

## Production shape

- Supabase managed project in the Sydney region.
- Invite-only email accounts.
- One initial organisation.
- `technician` and `administrator` roles.
- All organisation members can view and save active commissioning records.
- Administrators can soft-delete and restore records.
- IndexedDB remains the offline working store.
- Server writes use revision checks. A stale device receives a conflict rather than overwriting a newer record.

## Security boundary

The browser may contain only these public values:

- The project URL.
- An `sb_publishable_...` key.

Never put a Supabase secret key, legacy `service_role` key, database password, access token or customer record in this repository. A publishable key identifies the project but does not grant record access by itself. Authentication and row-level security provide access control.

## Create the managed project

1. Create a Supabase project in the Sydney region.
2. Disable public user registration. Users will be invited by an administrator.
3. Apply `supabase/migrations/20260820000000_initial_multi_user_schema.sql` through the Supabase migration workflow.
4. Create or invite the first administrator in Supabase Authentication.
5. In the SQL editor, create the first organisation and membership using the authenticated user's UUID:

```sql
begin;

insert into public.organisations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Replace with business name');

insert into public.organisation_members (organisation_id, user_id, role)
values (
  '00000000-0000-0000-0000-000000000001',
  'REPLACE_WITH_AUTH_USER_UUID',
  'administrator'
);

commit;
```

Replace both placeholders before running the transaction. Use a generated UUID for the organisation in production.

6. `config.js` contains the production project URL and browser-safe publishable key. For another deployment, replace only those two public values. Never use a secret or legacy `service_role` key.

## What the migration enforces

- Anonymous users have no table or function access.
- Authenticated users can read only organisations to which they belong.
- Technicians cannot delete or restore records.
- Direct record writes are denied. Writes pass through database functions that check membership and the expected revision.
- Deletion is reversible and keeps the record for later retention decisions.
- Cross-organisation access is denied by membership checks and row-level security.

## Verification required before live use

Static repository tests check that the migration contains the intended controls. They do not prove the deployed database behaves correctly. Before enabling login in the PWA, run integration tests against a separate Supabase test project covering:

- Anonymous access denial.
- Technician and administrator permissions.
- Cross-organisation isolation.
- Concurrent edit conflicts.
- Soft delete and restore.
- Session expiry and revoked-user access.
- Upload of existing local records without duplication.

Do not upload existing phone records until the live project has passed these tests and a fresh JSON backup has been exported.
