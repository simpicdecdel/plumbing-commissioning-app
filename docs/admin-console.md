# Admin console

The desktop console is `admin.html` on the same website as the field app. The field app shows an **Admin console** link to administrators. The console requires an online connection and never stores database responses in the service-worker cache.

## Access

Technicians retain their assigned-plant view. Administrators can view organisation statistics, search active/deleted records, inspect full records, export or print a record, and assign, delete or restore plants. Only super administrators can list and manage user accounts or read the administrative activity log.

Super administrator is an additional server-controlled capability in `console_operators`, not a third value in the existing membership role column. The initial production release must grant it only to the owner's approved account, using a verified Auth user ID. The UI cannot grant this capability. Super administrators and the acting user's own account are protected from role changes, deactivation and deletion through the console. Multiple organisation memberships require separate review before account-level operations.

## User actions

- **Add user:** first name, surname, email, role and an initial password. Reuses the operator tool's validation and safe repeat behaviour. Accounts are confirmed without sending an invitation. Console-created users must change their password before central record access.
- **Send reset email:** sends the existing recovery flow to the target account's stored email address. Sending an email alone does not restrict access.
- **Require password change:** immediately blocks online database reads and record RPCs until the authenticated user completes a password change. No email is sent by this action. The next online field-app access presents the password form. Invalid passwords leave the restriction in place.
- **Deactivate / reactivate:** changes application access without destroying records. Existing access tokens cannot bypass the database restriction. This is application deactivation, not deletion of the Auth identity or a guarantee that every device has signed out.
- **Change role:** permits Administrator or Technician. Assigned plants must be reassigned before promoting a technician.
- **Delete permanently:** only succeeds for an unprotected account in this organisation with no commissioning-record references. Users referenced by created, updated, deleted or assigned fields must be deactivated instead. Auth deletion cascades the membership; records and history are retained.

Offline devices cannot discover a new access restriction until reconnecting. Password-change enforcement blocks central data; it cannot erase data previously downloaded to a disconnected device. Do not describe this as remote device wiping or guaranteed session logout.

## Records and statistics

Statistics cover the central organisation database, including active/deleted records, completion status, outcomes, unassigned plants and account count. Local-only and pending offline changes are excluded. Timestamps use the viewer's local timezone and distinguish central save time from payload fields.

Lists use 50-row pages. Records can be filtered by site name and active/deleted state. Open a row to inspect job, plant, unit, check, result and handover details plus the full stored JSON. Assignment and lifecycle actions use existing revision-checked RPCs. JSON export is a single central record, not the field-app backup format.

## Backend and audit

The `admin-console` Supabase Edge Function verifies the caller's token using Auth, checks current account restrictions and resolves permissions from the database on every request. Only the function has the server-side key. It checks the target's organisation and protected status before making changes. Its CORS allowlist is an additional control, not the authentication boundary.

Administrative mutation intent is logged before execution, followed by completed/failed status. Passwords, tokens and raw requests are not included. Auth and membership operations are not a distributed transaction: started/failed entries may indicate partial completion, so inspect the account before retrying. New accounts retain the operator tool's resume markers. Record assignment and lifecycle changes are logged by a database trigger, including operations from the field app. Earlier events are not reconstructed.

## Deployment order

1. Merge the operator-tool dependency before this console branch, or include both in the reviewed release.
2. Apply `20260909020000_admin_console.sql` to the target database. It creates no privileged users and grants no operator capability automatically.
3. Verify the owner's Auth ID, single organisation membership and Administrator role. Insert exactly that approved `(user_id, organisation_id)` into `console_operators` using the secured deployment credential. Do not match typed technician names or editable profile metadata. Confirm there is exactly one production operator.
4. Deploy `supabase/functions/admin-console/index.ts`. The checked-in function configuration disables the gateway's legacy JWT check because the handler verifies tokens itself with Auth, supporting asymmetric signing keys. Never deploy an unverified replacement handler.
5. Set `ADMIN_CONSOLE_ORIGINS` to the exact website origin(s), comma separated. Its default is the production GitHub Pages origin. `ADMIN_CONSOLE_RECOVERY_URL` defaults to the production field-app URL. The test project additionally permits `http://127.0.0.1:4180` for browser integration tests. Do not copy the test origin into production settings.
6. Deploy the v0.4.8 client. Refresh devices and verify both ordinary and super administrator access, including a technician password change on a physical iPhone.

The Edge Function can be deployed with the Supabase CLI, or bundled with esbuild (`platform: neutral`, `format: esm`, `external: ['npm:*']`) and uploaded through the Management API with `entrypoint_path: index.ts`, `verify_jwt: false` and multipart `file` content. Project administration credentials stay in the existing encrypted local store or an approved deployment secret store.

Deployment status on 9 September 2026: the production migration, single-operator bootstrap, Edge Function and v0.4.8 GitHub Pages client were confirmed present. Read-only checks confirmed one console operator with the Administrator role and one organisation membership, plus one deployed `admin-console` function with `verify_jwt` disabled as required. Local, isolated live and deployed test-handler permission tests passed. Production acceptance on 10 September confirmed assignment withdrawal, retained-edit conflict recovery, forced password change, Technician console denial and immediate online deactivation. It also exposed stale offline access after deactivation. The v0.4.9 cache fix and its physical-iPhone retest remain pending deployment; see `release-verification.md`.

API references: [Edge Function authentication](https://supabase.com/docs/guides/functions/auth), [Auth admin password updates](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [Auth admin deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), [function deployment](https://supabase.com/docs/reference/api/v1-deploy-a-function).
