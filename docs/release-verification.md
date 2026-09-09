# Release verification

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
- The v0.4.6 checks above use automated WebKit contexts. A fresh physical-iPhone offline restart and reconnect check for v0.4.6 remains outstanding. Windows WebKit does not reproduce all Mobile Safari and installed-PWA behaviour.

The production project remains separate from the disposable test project. Production record names and payloads are omitted from this public verification note.
