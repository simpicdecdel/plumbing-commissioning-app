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

New records and edits are synchronised only while an organisation member is signed in. Records that already existed on a device before this update remain local until the user edits them; they are not uploaded merely by signing in. Local records and backup restore remain available without signing in, so authentication still does not gate the local record store. A synchronised server record can be deleted only by an administrator, while a local-only record can still be deleted locally.

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

The browser suite checks the v0.4.4 mobile header and overflow, the emulated iPhone user agent and viewport, PWA assets, service-worker control and offline public-config recovery, IndexedDB persistence, autosave and backup restoration, invalid-backup rejection, search, unit fault validation, authentication and the production-shaped Supabase recovery callback, cross-device synchronisation, offline queueing, revision conflicts and both conflict-resolution choices. Authentication and synchronisation browser tests otherwise use a mocked remote client. Schema tests inspect the migration and public configuration statically. They do not test the deployed Supabase project. GitHub Actions runs the suite for pull requests and changes to `main`.

Before a field release, repeat the critical flows on at least one physical iPhone, including installation and a reload with connectivity disabled. Playwright's Windows WebKit build does not reliably emulate an offline Mobile Safari reload. The WebKit profile is useful automated coverage, not proof of real-iOS compatibility.

## Live Supabase integration testing

The normal test suite never requires privileged credentials and uses a mocked shared service. The opt-in live suite creates a unique administrator, technician and isolated outsider in an approved Supabase test project. It verifies real authentication, organisation isolation, revision conflicts, administrator-only deletion and restore, immediate access removal after membership revocation, cross-browser synchronisation, offline upload after reconnecting or reopening the page, and the conflict-resolution UI. Every run deletes its records, memberships, organisations and Auth users in cleanup. The harness refuses to run when its configured URL matches the production project in `config.js`.

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

The repository contains the accepted managed Supabase design, a deployed initial database migration, active authentication UI, local-first synchronisation and production public configuration. On 20 August 2026, the production project structure, RLS enablement, policy and function grants, administrator membership and a live administrator sign-in were verified manually. On 3 September 2026, the opt-in live suite passed against the separate test project: five API tests covered the technician, administrator, revoked-member and cross-organisation permission matrix, and one iPhone/WebKit test covered real authentication, cross-browser synchronisation and conflict resolution. This test-project result does not verify production configuration. Authentication does not gate local record access or backup restore.

The synchronisation boundary is:

```text
UI and sync orchestration in sync.js
  -> local-first synchronisation service
      -> commissioningStore in storage.js -> Dexie -> IndexedDB
      -> authenticated Supabase functions -> PostgreSQL with row-level security
```

Photo capture, signature capture and server-side PDF generation remain outside this version.

Dexie 4.4.4 is pinned and bundled in `vendor/dexie.min.js` so database access does not depend on a network request in the field. Its Apache 2.0 licence is retained in `vendor/DEXIE-LICENSE`.
