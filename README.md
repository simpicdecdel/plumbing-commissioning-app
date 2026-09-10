# Plumbing Commissioning PWA

An offline-first, installable web app for recording commercial plumbing plant commissioning in the field.

## Current workflow

One commissioning record represents this hierarchy:

```text
Site / job
  -> Plant
      -> Multiple units
          -> Unit-level fault or exception
      -> One plant commissioning result
```

The current PWA can:

- Create, edit, save as draft and complete a plant commissioning record.
- Add and remove multiple units within a plant.
- Record an operational result, fault / exception, or not-commissioned state for each unit.
- Capture plant-level installation checks, readings, outcome, notes and handover details.
- Autosave unfinished work and retain records offline in IndexedDB using Dexie.
- Search records and unit identifiers stored on the device.
- Print a record, export all records as a versioned JSON backup and restore a valid backup.
- Install as a PWA and reload its application shell without a network connection after the first successful load.
- Sign invited Supabase users in and out, request a password reset email, complete password recovery and show their organisation role.
- Queue signed-in record changes locally, synchronise them with the user's organisation and download changes made on another device.
- Preserve an offline edit when its server revision is stale and report the resulting conflict instead of overwriting the newer server record.
- Resolve a revision conflict by reviewing both versions and deliberately choosing the central or technician version.
- Show when each record was saved by the plumber and when the current device last synchronised it with the central database.

An organisation member must be signed in to view or edit records and export backups. New records synchronise automatically. Earlier local records require **Upload local records**, a downloaded backup and confirmation before upload; signing in or editing them does not upload them. Administrators see all organisation records and can assign, delete and restore plants. Each plant has at most one assigned technician. Technicians see only their assigned plants, automatically own plants they create, and can edit completed records. They cannot change assignments, delete or restore records.

The technician screen uses compact **My commissioning** cards with **Open/Continue**. Successful sync appears at the top; pending uploads and conflicts stay visible on cards. Timestamps and printing are inside **Record details and actions**; backup export is in **Account**. The typed technician name is a commissioning field, not proof of who last edited the record. The card therefore labels it **Technician**, separately from **Last saved**.

The v0.4.7 assignment migration is a prerequisite for v0.4.8. Existing plants remain unassigned for administrators to allocate. Reassignment is checked before online uploads. Withdrawn plants are hidden from the previous technician while pending work is retained for Administrator review on that device. The normal product does not hard-delete central records; withdrawal checks cover retained central rows, including soft deletions.

Sign-out hides records and retains pending work. Offline access uses the signed-in user's last verified membership, which is checked again on reconnect. These application controls do not encrypt the browser's local database. See [release verification](docs/release-verification.md) for automated and physical-device evidence.

## Confirmed behaviour

- A site may contain multiple plants.
- A commissioning record relates to one plant, not one appliance.
- A plant can contain multiple units.
- Individual unit failures and exceptions must be identifiable within the plant record.
- Field use must continue without reliable connectivity.
- Information should be captured once and reused within the record.

## Current assumptions to validate in field testing

- A plant name or reference and at least one unit label are enough to identify the plant structure for completion.
- Unit results are `Operational`, `Fault / exception`, or `Not commissioned`.
- Fault / exception detail is mandatory only when that unit result is selected.
- The existing generic installation checks, optional measurements, plant outcome and handover fields remain useful.
- A completed record can still be edited. Record locking and audit history are deferred.
- Backup restore validates the full file, then merges records by ID in one IndexedDB transaction.

These assumptions keep the workflow testable. They do not establish regulatory or manufacturer compliance.

## Local data and migration

Records and the current autosaved draft are held in IndexedDB in the browser profile on the device. `storage.js` is the data-access boundary used by the UI. UI code does not read or write browser storage directly.

On the first run after this update, the storage layer looks for the previous `localStorage` record and draft keys. Each earlier one-appliance record is converted into a one-plant record containing one unit. The old values are removed only after the IndexedDB transaction succeeds. A migrated failure is retained as a unit fault / exception, with the earlier notes copied into its exception detail.

Clearing site data, losing the device or uninstalling the browser can still remove unsynchronised records. Export backups regularly. Do not use this MVP as the only permanent business record until the live synchronisation, access-control and recovery paths have been fully tested.

## Install and run locally

Serve the folder over HTTP. Service workers do not run when `index.html` is opened directly from the filesystem.

```text
pnpm install
pnpm start
```

Open `http://127.0.0.1:4173/`. Load it once online before testing offline mode.

To serve the app without the remote authentication client during local testing in PowerShell:

```powershell
$env:PLUMBING_REMOTE_DISABLED = '1'
pnpm start
```

The committed `vendor/remote-client.min.js` bundle is generated from `scripts/remote-client-entry.js`. Rebuild it after changing the Supabase client source or dependency:

```text
pnpm build:remote
```

`config.js` contains the production Supabase project URL and browser-safe publishable key. Copy `config.example.js` and replace those public values for another deployment. Never commit a secret key, legacy `service_role` key, database password or access token.

To add users, use the local [user provisioning tool](docs/user-provisioning.md). It accepts first name, surname, email and role for one user or a CSV batch. It previews changes by default, preserves existing accounts on repeat runs, and uses the saved encrypted credential without putting privileged keys in the browser.

The [desktop admin console](docs/admin-console.md) adds organisation statistics and central record inspection for administrators, plus user management and activity history for explicitly granted super administrators. Its database migration and Edge Function must be deployed before the v0.4.8 client.

The production migration, single-operator bootstrap, Edge Function and v0.4.8 GitHub Pages client were confirmed deployed on 9 September 2026. Physical acceptance on 10 September exposed stale offline access after a Technician account had been deactivated online. v0.4.9 now fails closed when cached controls are absent or restricted. It was deployed on 10 September and passed the repeated physical-iPhone offline deactivation check. See [release verification](docs/release-verification.md).

## Automated iPhone-style testing

Windows cannot run Apple's iOS Simulator because it is supplied with Xcode on macOS. This repository uses Playwright WebKit with the `iPhone 13` device profile as the local substitute. It emulates the iPhone viewport, touch input, user agent and WebKit browser engine. It does not reproduce the full iOS operating system, real Mobile Safari, Add to Home Screen prompts, camera access or device-specific hardware behaviour.

Install the test dependency and WebKit browser once:

```text
pnpm install
pnpm exec playwright install webkit
```

Run the automated iPhone suite headlessly:

```text
pnpm test:iphone
```

Run the complete schema and browser suite:

```text
pnpm test
```

Open a visible iPhone-sized WebKit window for exploratory testing:

```text
pnpm test:iphone:headed
```

For Playwright's interactive runner:

```text
pnpm test:iphone:ui
```

The browser suite checks the v0.4.9 mobile header and overflow, PWA assets, service-worker control and fresh database responses, IndexedDB persistence, autosave, backup restoration, invalid-backup rejection, search, unit fault validation, password recovery, cross-device synchronisation, offline queueing and both conflict-resolution choices. It also checks local sign-in and organisation gates, technician restrictions, pending work after re-login and backup-confirmed local upload. Authentication and synchronisation tests use a mocked remote client except the recovery-callback test. Schema tests inspect migrations and public configuration, exercise service-worker caching, and verify that offline membership cannot survive a restricted or interrupted access refresh. The normal suite does not access Supabase. GitHub Actions runs it for pull requests and changes to `main`.

Before a field release, repeat the critical flows on at least one physical iPhone, including installation and a reload with connectivity disabled. Playwright's Windows WebKit build does not reliably emulate an offline Mobile Safari reload. The WebKit profile is useful automated coverage, not proof of real-iOS compatibility.

## Live Supabase integration testing

The normal test suite never requires privileged credentials and uses a mocked shared service. The opt-in live suite creates an administrator, two technicians and an isolated outsider in an approved Supabase test project. It verifies real authentication, organisation isolation, revision conflicts, administrator-only deletion and restore, immediate access removal after membership revocation, cross-browser synchronisation, offline upload after reconnecting or reopening the page, and the conflict-resolution UI. Every run deletes its records, memberships, organisations and Auth users in cleanup. The harness refuses to run when its configured URL matches the production project in `config.js`.

Copy `.env.live-tests.example` to `.env.live-tests` and supply values from a dedicated test project. Use a Supabase secret key only in this server-side test environment. Never put it in `config.js`, a browser bundle, a commit or a test report.

```text
pnpm test:live
```

If a test process is forcibly stopped before cleanup, remove all tagged test fixtures with:

```text
pnpm test:live:cleanup -- --confirm
```

The cleanup command refuses to delete a tagged user if that user belongs to an organisation whose name is not marked as an automated live-test organisation. The GitHub workflow is manual-only and requires the three `PLUMBING_TEST_SUPABASE_*` values to be configured as secrets in the `supabase-test` environment.

## Current architecture boundaries

```text
UI in app.js
  -> commissioningStore in storage.js
      -> Dexie
          -> IndexedDB
```

Authentication is a separate path:

```text
Account UI in app.js
  -> commissioningRemote in vendor/remote-client.min.js
      -> Supabase Authentication and organisation membership lookup
```

The app uses Supabase authentication, organisation roles and revision-checked central storage with IndexedDB as the offline working store. Local screens enforce sign-in, organisation scope and administrator-only deletion and restore. The deletion feed supplies record IDs and revisions to members without exposing deleted payloads to technicians. See [release verification](docs/release-verification.md) for current checks and remaining physical-device limitations.

The synchronisation boundary is:

```text
UI and sync orchestration in sync.js
  -> local-first synchronisation service
      -> commissioningStore in storage.js -> Dexie -> IndexedDB
      -> authenticated Supabase functions -> PostgreSQL with row-level security
```

Photo capture, signature capture and server-side PDF generation remain outside this version.

Dexie 4.4.4 is pinned and bundled in `vendor/dexie.min.js` so database access does not depend on a network request in the field. Its Apache 2.0 licence is retained in `vendor/DEXIE-LICENSE`.
