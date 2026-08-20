# Supabase multi-user foundation

This document covers the authentication and database foundation for the accepted multi-user design. The browser authentication client is connected and the production public configuration is present. Commissioning record storage remains local-only until synchronisation and local-record migration are implemented and verified.

## Current implementation boundary

Implemented in this repository:

- Supabase email/password sign-in and sign-out.
- Password setup and recovery flow.
- Persisted and refreshed browser sessions.
- Organisation membership and role display.
- The initial database migration and static security tests.
- A production project URL and browser-safe publishable key in `config.js`.
- Production tables, RLS enablement, policies, security-definer function grants, anonymous read denial and administrator membership were verified manually on 20 August 2026.
- A live administrator sign-in was verified manually on 20 August 2026.

Not yet implemented or verified:

- Remote commissioning record reads, writes, deletion or restoration.
- Offline change queues, revision conflict handling and synchronisation.
- Role enforcement for local delete or backup restore.
- Migration of existing IndexedDB records to Supabase.
- Automated live tests for the complete technician, administrator, revoked-user and cross-organisation permission matrix.

Signing in therefore does not yet restrict access to records held in the browser on that device.

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
7. Install dependencies and rebuild the committed browser client after changing `scripts/remote-client-entry.js` or the Supabase dependency:

```text
pnpm install
pnpm build:remote
```

8. Serve the app with `pnpm start` and verify sign-in, password recovery, sign-out and organisation membership display.

## What the migration enforces

- Anonymous users have no table or function access.
- Authenticated users can read only organisations to which they belong.
- Technicians cannot delete or restore records.
- Direct record writes are denied. Writes pass through database functions that check membership and the expected revision.
- Deletion is reversible and keeps the record for later retention decisions.
- Cross-organisation access is denied by membership checks and row-level security.

## Verification required before live use

Static repository tests check that the migration contains the intended controls. Authentication UI tests use a mocked remote client. Manual production verification covered the deployed structure, grants, anonymous read denial, administrator membership and administrator sign-in, but it did not prove the complete permission matrix. Before treating sign-in as record access control or enabling remote record storage, run integration tests against a separate Supabase test project covering:

- Anonymous access denial.
- Technician and administrator permissions.
- Cross-organisation isolation.
- Concurrent edit conflicts.
- Soft delete and restore.
- Session expiry and revoked-user access.
- Upload of existing local records without duplication.

Run the current static schema checks with `pnpm test:schema` and the full local suite with `pnpm test`.

Do not upload existing phone records until the live project has passed these tests and a fresh JSON backup has been exported.
