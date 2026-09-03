# Supabase multi-user foundation

This document covers the authentication, database and initial local-first synchronisation implementation for the accepted multi-user design. The browser client is connected and the production public configuration is present. Live record synchronisation still requires the verification described below.

## Current implementation boundary

Implemented in this repository:

- Supabase email/password sign-in and sign-out.
- Password reset and account recovery flow.
- Persisted and refreshed browser sessions.
- Organisation membership and role display.
- The initial database migration and static security tests.
- A production project URL and browser-safe publishable key in `config.js`.
- Production tables, RLS enablement, policies, security-definer function grants, anonymous read denial and administrator membership were verified manually on 20 August 2026.
- A live administrator sign-in was verified manually on 20 August 2026.
- Remote record reads and revision-checked saves through the authenticated Supabase functions.
- An IndexedDB outbox for signed-in saves and administrator deletes, including offline retry.
- Cross-device download, remote delete propagation and safe revision-conflict reporting.
- Explicit conflict resolution using either the retained technician version or the current central version.
- Automated browser coverage against a mocked shared service.

Not yet implemented or verified:

- Role enforcement for local-only delete or backup restore.
- User-confirmed upload of records that existed locally before synchronisation was introduced.
- A live two-device verification of offline retry, conflict resolution and soft deletion. Cross-origin upload and download were verified manually on 21 August 2026.

Signing in does not restrict access to records held in the browser on that device. Existing local records are deliberately not uploaded merely by signing in.

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

The server-side live-test harness uses a secret key and the explicit `service_role` table grants in `20260821000000_service_role_test_admin.sql`. That role bypasses row-level security and can administer all application rows. It must be used only by trusted server-side test code and revoked before production if the live harness will not remain in use.

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

8. Serve the app with `pnpm start` and verify sign-in, password recovery, sign-out, organisation membership display and a clearly labelled test record on two devices.

## What the migration enforces

- Anonymous users have no table or function access.
- Authenticated users can read only organisations to which they belong.
- Technicians cannot delete or restore records.
- Direct record writes are denied. Writes pass through database functions that check membership and the expected revision.
- Deletion is reversible and keeps the record for later retention decisions.
- Cross-organisation access is denied by membership checks and row-level security.

## Verification status and remaining requirements before live use

Static repository tests check that the migration contains the intended controls. The normal authentication and synchronisation UI tests use a mocked remote client. On 3 September 2026, the opt-in suite passed against the separate Supabase test project: five live API tests covered anonymous denial, technician and administrator permissions, cross-organisation isolation, revision conflicts, administrator-only soft deletion and restore, and immediate access removal after membership revocation; one live iPhone/WebKit test covered real authentication, cross-browser synchronisation and conflict resolution. Cleanup then found zero tagged users and zero tagged organisations remaining. This test-project result does not verify production configuration.

Before treating the build as ready for live customer records, verification is still required for:

- Live offline retry.
- Session expiry.
- User-confirmed upload of existing local records without duplication.
- Production configuration and the final release threshold in `docs/requirements.md`.

Run the current static schema checks with `pnpm test:schema` and the full local suite with `pnpm test`.

### Disposable live-test identities

The opt-in live integration suite uses the Supabase Auth Admin API from Node, never from browser code. It requires a dedicated test project and a secret key supplied through `PLUMBING_TEST_SUPABASE_SECRET_KEY`. Each run creates three auto-confirmed users with reserved `example.invalid` addresses and identifying Auth metadata:

- An administrator and technician in one temporary organisation.
- An outsider in a second temporary organisation for isolation checks.

The suite also removes a technician's membership while that user's existing session remains active, then proves that row reads return no organisation data and revision-checked writes are denied immediately. It deletes test records first, followed by remaining memberships, organisations and Auth users. This order satisfies the database foreign keys. `pnpm test:live:cleanup -- --confirm` removes tagged fixtures left by an interrupted run and stops if any tagged user belongs to a non-test organisation.

Do not run these tests against the production project. The harness reads the public production URL from `config.js` and refuses to run or clean up when the configured live-test URL matches it. Configure a separate Supabase project or branch and store the URL, publishable key and secret key only in `.env.live-tests` or GitHub environment secrets.

Do not upload existing phone records until the live project has passed these tests and a fresh JSON backup has been exported.
