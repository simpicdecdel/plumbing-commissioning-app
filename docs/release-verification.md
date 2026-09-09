# Release verification

## v0.4.8: desktop admin console

- A separate desktop console provides central statistics, record inspection and assignments to Administrators. A separately provisioned server-side operator capability controls user administration and activity history.
- The migration and authenticated Edge Function have been applied only to the isolated test project. Production migration, the single approved owner bootstrap and deployment remain pending release approval.
- The existing 28 local WebKit checks passed. Three desktop console checks passed after adding the new files to the local server allowlist. The overview was rendered and inspected.
- The live console suite passed both in-process and against the deployed Edge Function: organisation scope, ordinary-role denial, protected accounts, deactivation, forced password change, creation/repeat handling, role changes, history-preserving deletion and audit checks.
- Real browser integration passed for console user listing, forcing a technician password change, blocking the field app and restoring access after the change. The test caught and verified a fix for invalidated Auth sessions: the client now signs in with the new password after a successful forced change.
- A known password restriction remained active when Auth was reinitialised offline from its cached state. Windows WebKit failed offline navigation internally, so actual offline reload acceptance remains a physical-device check rather than a claimed automated pass.
- The initial pull-request checks exposed header overflow after adding the Admin console link. CI evidence isolated the remaining problem at 800-pixel tablet width. The header now stacks through tablet widths and wraps its controls; the responsive upload regression covers 390, 800 and 1280 pixels.
- No production user or plant data was modified during console implementation. Physical-device acceptance remains required after release.

## v0.4.7: technician view and plant assignment

Implementation verified on 9 September 2026; PR #18 was subsequently merged and v0.4.7 deployed to production.

- One assigned technician per plant, optional unassigned state for Administrators, automatic self-assignment on technician creation, and continued editing after completion.
- Compact My commissioning cards, grouped form sections, metadata and printing inside the record, and Account backup export. Pending uploads and conflicts remain visible.
- A separate assigned account column governs database reads and writes. Typed names do not grant access. Existing plants remain unassigned for explicit allocation.
- The application checks an authoritative assignment snapshot before uploading. Withdrawn offline edits remain on the original device and become reviewable conflicts when an Administrator signs in there. Keeping the retained content preserves the current assignment.
- Local suite: 15 schema/service-worker checks and 28 WebKit browser tests passed. Live suite: six API tests and five WebKit tests passed in the isolated test project. Tests cover another technician in the same organisation, unassigned records, forged assignment, revoked membership, completed edits and offline reassignment with administrator recovery.
- The reassignment scenario passed again after final UI checks, including keeping the retained edit without changing the new assignee. Mobile list and form screenshots were inspected. Cleanup found zero tagged users and organisations remaining.
- The assignment migration was applied to production before the v0.4.7 client was deployed. Existing record checksums were unchanged; five active records and two deleted records were retained.
- A physical iPhone check of the new technician role and reassignment behaviour remains required after deployment. Automated WebKit is not a complete iOS/PWA substitute.

## v0.4.6: team access and record recovery

Verification date: 9 September 2026.

### Delivered behaviour

- Sign-in and organisation membership gate local record screens, printing and backup export. Administrators can review unassigned legacy records. Technicians cannot delete records, restore backups or restore central deletions.
- Sign-out hides records without deleting the local outbox. Drafts are scoped by account and organisation. An Administrator opening a new record can recover the previous unassigned autosaved draft; it is moved into that account's scope.
- Earlier local records stay local until the user downloads a backup and confirms upload. Editing them does not silently upload them.
- Backup restore rejects pending/conflicting/deleted or foreign-organisation collisions atomically. Restoring an already synced record queues a revision-checked update. Added records remain local until explicit upload.
- Administrators can restore centrally deleted records through **Deleted records**. Members receive minimal deletion markers, without deleted payloads, so technician devices remove deleted records on sync.
- Membership is checked before online synchronisation. Offline access uses the persisted user's last verified membership. Revocation cannot be discovered offline, and these controls do not encrypt IndexedDB or protect it against a person controlling the browser profile.

### Automated evidence

The normal suite covers service-worker freshness and offline shell caching, password recovery, record persistence, backups, local access, pending work, organisation isolation, revision conflicts and confirmed upload. Live tests use disposable identities in the separate test project and refuse production configuration.

- `pnpm test`: 15 schema/service-worker checks and 27 WebKit browser checks passed, including account-switch draft retention and atomic backup rejection. The toolbar also passed overflow checks at 390, 800 and 1280 pixels.
- `pnpm test:live`: five API tests and four WebKit browser tests passed. The browser tests verify real authentication, conflicts, offline reconnect/reopen, deletion and restoration between Administrator and technician sessions without reloading, and an expired session with an invalid refresh token followed by successful re-login and upload of the preserved edit.
- A cleanup check after the final live run found zero tagged test users and zero tagged test organisations remaining.
- The deletion-feed migration was applied to the test project, passed live member/outsider/revoked-member checks, and was then applied to production.
- The production read-only API check after migration returned five active records and one soft-deleted record. No production record payloads were changed for these tests.

### Physical-device evidence and limits

- Earlier release: the user confirmed password recovery and successful sign-in with the new password on a physical iPhone.
- 4 September, v0.4.4: the user confirmed an offline edit, closing and reopening offline, reconnecting and seeing the edit on both iPhone and laptop.
- v0.4.5: the stale database-response cache was removed. The user confirmed all five intended active records were visible on the devices.
- On 9 September the user confirmed v0.4.6 physical-iPhone offline save, close/reopen while offline, reconnect and desktop visibility, then deletion and restoration across devices without reloading. Cleanup returned both devices to the original five records. This does not validate the new v0.4.7 assignment behaviour.

The production project remains separate from the disposable test project. Production record names and payloads are omitted from this public verification note.
