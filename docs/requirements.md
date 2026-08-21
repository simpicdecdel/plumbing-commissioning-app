# Plumbing Commissioning App Requirements

Baseline: Current repository state

Last updated: 20 August 2026

Status: Authentication foundation with local-only commissioning records

## 1. Purpose

The product provides a mobile-friendly plant commissioning application for a small Australian commercial plumbing business. It supports technicians recording one plant and its multiple units at a customer site, including when an internet connection is unavailable.

## 2. Requirement conventions

Requirement identifiers remain stable after publication.

- `REQ-BUS`: business requirement
- `REQ-F`: functional requirement
- `REQ-D`: data requirement
- `REQ-NF`: non-functional requirement
- `REQ-SEC`: security or privacy requirement
- `REQ-COMP`: regulatory or compliance requirement

Statuses:

- **Accepted**: part of the agreed product baseline
- **Provisional**: implemented as an MVP assumption but not yet confirmed by the business
- **Proposed**: requires a decision before implementation
- **Deferred**: intentionally outside the current MVP
- **Retired**: no longer required, retained for traceability

Requirement status records the product decision. Where delivery is incomplete, an **Implementation state** or **Current gap** states what the repository does now. Accepted does not by itself mean delivered.

Priorities use Must, Should, Could and Later.

## 3. Business requirements

### REQ-BUS-001: Plant commissioning records

- Status: Accepted
- Priority: Must
- Requirement: The product must allow a plumbing technician to record plant commissioning work while on site.
- Acceptance criteria:
  - A technician can create and complete a commissioning record on a mobile phone.
  - The record captures the site or job, one plant, multiple units, installation checks, unit exceptions, plant result and handover information.

### REQ-BUS-002: Offline field use

- Status: Accepted
- Priority: Must
- Requirement: The product must remain usable without an internet connection after its first successful online load.
- Acceptance criteria:
  - The application shell loads while offline.
  - Previously saved records remain accessible while offline.
  - A technician can create or edit a record while offline.

### REQ-BUS-003: Australian operating context

- Status: Accepted
- Priority: Must
- Requirement: The product must use Australian English, dates and plumbing measurement units appropriate to the business.
- Acceptance criteria:
  - Pressure is recorded in kPa.
  - Flow is recorded in litres per minute.
  - Temperature is recorded in degrees Celsius.

## 4. Functional requirements

### REQ-F-001: Create a record

- Status: Accepted
- Priority: Must
- Requirement: A technician must be able to create a commissioning record.
- Acceptance criteria:
  - A new form can be opened from the records screen.
  - A unique record identifier is generated.
  - The commissioning date defaults to the current date.

### REQ-F-002: Save a draft

- Status: Accepted
- Priority: Must
- Requirement: A technician must be able to save an incomplete record as a draft.
- Acceptance criteria:
  - A draft does not require the completion fields.
  - A saved draft appears in the record list with a Draft status.
  - The draft can be reopened and edited.

### REQ-F-003: Autosave unfinished work

- Status: Accepted
- Priority: Must
- Requirement: The application must automatically preserve form changes on the device.
- Acceptance criteria:
  - Changes are saved without requiring the technician to select Save draft.
  - The most recent unfinished record can be resumed.

### REQ-F-004: Complete a record

- Status: Accepted
- Priority: Must
- Requirement: A technician must be able to mark a valid commissioning record as completed.
- Acceptance criteria:
  - The application validates all currently mandatory fields.
  - A completed record appears in the record list with its outcome.
  - Completion does not create a duplicate record.

### REQ-F-005: Edit a record

- Status: Accepted
- Priority: Must
- Requirement: A technician must be able to open and edit a saved record.
- Acceptance criteria:
  - Saved values are restored into the form.
  - Saving replaces the existing record rather than creating a duplicate.

### REQ-F-006: Search records

- Status: Accepted
- Priority: Should
- Requirement: A technician must be able to search records stored on the device.
- Acceptance criteria:
  - Search matches customer or site name, address, job reference, plant name or location, unit label, manufacturer, model and serial number.
  - Results update as the search text changes.

### REQ-F-007: Print a record

- Status: Accepted
- Priority: Should
- Requirement: A technician must be able to print a commissioning record using the browser print function.
- Acceptance criteria:
  - Navigation and editing controls are excluded from the printed output.
  - The commissioning information is readable in the print layout.

### REQ-F-008: Delete a record

- Status: Accepted
- Priority: Should
- Requirement: A technician must be able to delete a record after confirming the action.
- Acceptance criteria:
  - The application asks for confirmation before deletion.
  - The record is removed only after confirmation.
  - The interface states that the action cannot be undone.
- Current gap: The current operation permanently deletes only the local IndexedDB record and is available without authentication. Administrator-only soft deletion applies to the future synchronised record path.

### REQ-F-009: Export a backup

- Status: Accepted
- Priority: Must
- Requirement: A technician must be able to export all locally stored records as a JSON backup.
- Acceptance criteria:
  - The export contains a schema version, export timestamp and all records.
  - The downloaded filename includes the export date.

### REQ-F-010: Restore a backup

- Status: Accepted
- Priority: Must before operational reliance
- Requirement: An authorised user must be able to restore records from a valid exported backup. Access control remains governed by REQ-SEC-002.
- Acceptance criteria:
  - The application accepts schema version 2 JSON backups produced by the export function.
  - The application validates the entire backup before changing stored records.
  - Restoring merges records by ID. New IDs are added and matching IDs are replaced.
  - Records on the device that are absent from the backup are retained.
  - The application asks for confirmation and reports added and replaced record counts.
  - Invalid, unsupported or duplicate-ID backups do not change stored records.
- Current gap: Backup restore currently changes only local IndexedDB records and is available without an authentication or administrator check.

### REQ-F-011: Install the application

- Status: Accepted
- Priority: Must
- Requirement: A supported mobile browser must be able to install the product as a Progressive Web App.
- Acceptance criteria:
  - The product supplies an application manifest and install icons.
  - The installed product opens in standalone display mode where supported.

### REQ-F-012: Show connection state

- Status: Accepted
- Priority: Should
- Requirement: The application must tell the technician whether it is online or operating offline.
- Acceptance criteria:
  - The status updates when connectivity changes.

### REQ-F-013: Manage plant units

- Status: Accepted
- Priority: Must
- Requirement: A technician must be able to add and remove multiple units within one plant commissioning record.
- Acceptance criteria:
  - Every unit has a stable identifier within the record.
  - Completion requires at least one unit label.
  - Each unit can record its own operating state and fault or exception detail.

### REQ-F-014: Migrate earlier local records

- Status: Accepted
- Priority: Must
- Requirement: The application must make a practical attempt to preserve records stored by the previous one-appliance localStorage version.
- Acceptance criteria:
  - Each earlier record becomes one plant record containing one unit.
  - Earlier failed outcomes become a unit fault or exception.
  - Earlier localStorage values are removed only after the IndexedDB transaction succeeds.

### REQ-F-015: Storage boundary

- Status: Accepted
- Priority: Must
- Requirement: UI code must use a data-access abstraction rather than browser persistence APIs directly.
- Acceptance criteria:
  - Record, draft and migration operations are exposed through the storage service.
  - `app.js` contains no direct `localStorage` or IndexedDB calls.

### REQ-F-016: Account authentication

- Status: Accepted
- Priority: Must before multi-user use
- Requirement: An invited organisation member must be able to establish and end an authenticated Supabase session.
- Acceptance criteria:
  - A user can sign in with email and password.
  - A user can request a password setup email.
  - A password recovery link opens the set-password flow.
  - A user can sign out.
  - The browser persists and refreshes the session using the Supabase client.
- Implementation state: The client and UI are implemented. A live administrator sign-in was verified manually on 20 August 2026. Browser tests use a mocked remote client, so live authentication is not yet covered by the automated repository suite.

### REQ-F-017: Show organisation membership

- Status: Accepted
- Priority: Must before multi-user use
- Requirement: A signed-in user must be shown their organisation membership and role, or be told that no membership was found.
- Acceptance criteria:
  - Membership is looked up for the authenticated user.
  - The account view shows the organisation name and `technician` or `administrator` role when present.
  - A signed-in user without a membership sees a clear message.
- Implementation state: Implemented in the authentication client and account UI. This display does not yet govern local record operations.

## 5. Record data requirements

### REQ-D-001: One plant per commissioning record

- Status: Accepted
- Priority: Must
- Requirement: One commissioning record represents one plant at one site or job. A site may have multiple plants, represented by separate commissioning records.

### REQ-D-002: Site and job details

- Status: Provisional
- Priority: Must
- Requirement: A record currently captures customer or site name, site address, commissioning date and technician as mandatory fields, with job reference optional.
- Assumption to confirm: These fields are sufficient to identify and retrieve the job during field testing.

### REQ-D-003: Plant details

- Status: Provisional
- Priority: Must
- Requirement: A record currently captures a mandatory plant name or reference and plant type, with plant location optional.
- Assumption to confirm: A free-text plant name is preferable to a separate plant register for the MVP.

### REQ-D-004: Multiple units within a plant

- Status: Accepted
- Priority: Must
- Requirement: A plant contains one or more individually identifiable units within the same commissioning record.
- Acceptance criteria:
  - A technician can add and remove units.
  - Each unit can capture a label, manufacturer, model and serial number.
  - At least one unit label is required for completion.

### REQ-D-005: Plant installation checks

- Status: Provisional
- Priority: Must
- Requirement: The existing generic checks are recorded once at plant level: secure and level, connections, visible leaks, isolation, drainage or discharge, and manufacturer instructions.
- Assumption to confirm: These checks apply at plant level and remain useful for commercial hot water commissioning.

### REQ-D-006: Plant commissioning measurements

- Status: Provisional
- Priority: Must
- Requirement: Static pressure, flow pressure, flow rate and outlet temperature are recorded once at plant level and remain optional.
- Decision needed: Confirm which measurements apply to the plant, which apply to individual units, and which ranges or evidence are mandatory.

### REQ-D-007: Plant outcome

- Status: Provisional
- Priority: Must
- Requirement: Every completed plant record has one outcome: Passed, Passed with actions, or Failed.
- Assumption to confirm: These three plant outcomes reflect the language used by the business and its customers.

### REQ-D-008: Unit faults and exceptions

- Status: Accepted
- Priority: Must
- Requirement: Each unit can be marked Operational, Fault / exception, or Not commissioned. Fault or exception detail is recorded against the affected unit.
- Assumption to confirm: The three current unit states are sufficient for field testing.

### REQ-D-009: Plant notes and handover

- Status: Provisional
- Priority: Should
- Requirement: A record can capture plant-level notes, defects and actions, plus operation demonstrated, documents provided, work area left clean, customer representative and handover date.
- Assumption to confirm: These handover fields remain useful and do not duplicate a later approval or signature step.

### REQ-D-010: Minimum completion fields

- Status: Provisional
- Priority: Must
- Requirement: Completion currently requires site name, site address, commissioning date, technician, plant name, plant type, at least one unit label, every unit state, plant outcome, and exception detail for any unit marked Fault / exception.
- Decision needed: Confirm whether checklist items, readings, acknowledgements, photos or signatures must also be mandatory.

## 6. Non-functional requirements

### REQ-NF-001: Mobile usability

- Status: Accepted
- Priority: Must
- Requirement: The product must be usable on common mobile screen sizes without horizontal scrolling.

### REQ-NF-002: Desktop usability

- Status: Accepted
- Priority: Should
- Requirement: The product should also be usable on a desktop browser for office review and printing.

### REQ-NF-003: Offline application shell

- Status: Accepted
- Priority: Must
- Requirement: Required application files must be cached after the first successful load.

### REQ-NF-004: Accessible interaction

- Status: Accepted
- Priority: Must
- Requirement: Controls must use visible labels, keyboard focus indicators and semantic browser elements.

### REQ-NF-005: Data durability warning

- Status: Accepted
- Priority: Must
- Requirement: The product must clearly warn that locally stored records can be lost and should be backed up.

### REQ-NF-006: IndexedDB offline persistence

- Status: Accepted
- Priority: Must
- Requirement: Records and autosaved drafts must use IndexedDB through the pinned Dexie library and remain available without a network connection.
- Acceptance criteria:
  - Dexie is bundled in the application shell rather than loaded from a remote CDN at runtime.
  - The service worker caches Dexie and the storage layer.

## 7. Security, privacy and compliance

### REQ-SEC-001: Local device storage disclosure

- Status: Accepted
- Priority: Must
- Requirement: Users must be told that records are stored in the browser on the device and may be removed by clearing site data or losing the device.

### REQ-SEC-002: Access control

- Status: Accepted
- Priority: Must before handling live customer records at scale
- Requirement: Only invited, authenticated members of the business organisation may access commissioning records.
- Acceptance criteria:
  - Authentication uses invite-only email accounts through managed Supabase Authentication.
  - Supported roles are Technician and Administrator.
  - Both roles can view, create and edit active records for their organisation.
  - Only Administrators can delete, restore or administer access.
  - Anonymous and cross-organisation access is denied by database row-level security.
- Implementation state: Authentication and membership display are implemented. The migration is deployed, and production tables, RLS enablement, policies, function grants, anonymous read denial and administrator membership were verified manually on 20 August 2026. The full role and cross-organisation permission matrix remains to be integration-tested. Local record access, delete and backup restore are not gated by authentication or role.

### REQ-SEC-003: Central storage and synchronisation

- Status: Accepted
- Priority: Must before multi-user use
- Requirement: Records must synchronise between the local IndexedDB store and a managed Supabase database while retaining offline field operation.
- Acceptance criteria:
  - Every server record belongs to one organisation and retains its creating and last-updating user identifiers.
  - Offline changes are queued on the device and sent after connectivity and authentication return.
  - Each record shows its plumber save time and the current device's most recent successful central synchronisation time.
  - Every write supplies the server revision last seen by that device.
  - A stale revision is reported as a conflict and does not overwrite the current server record.
  - Existing local records are uploaded only after explicit user confirmation and a successful backup export.
  - Server deletion is reversible until a separately accepted retention rule permits permanent deletion.
- Implementation state: The database tables and revision-checked functions are defined in the initial migration. The client now implements authenticated remote reads and writes, an IndexedDB change queue, reconnect retry, cross-device download, remote delete propagation and safe stale-revision conflict reporting. Automated browser tests use a mocked shared service. Live Supabase record synchronisation and the full permission matrix remain unverified. There is no conflict-resolution screen yet. Existing local records are not uploaded merely by signing in and still require the accepted backup-and-confirmation workflow.

### REQ-SEC-004: Public repository hygiene

- Status: Accepted
- Priority: Must
- Requirement: Customer names, addresses, photographs, live records and other sensitive information must not be entered in the public repository, issues or project board.

### REQ-COMP-001: Plant and unit-specific rules

- Status: Proposed
- Priority: Must before claiming compliance
- Requirement: Required checks, measurements, acceptable ranges and evidence must be defined for each supported plant and unit type.

### REQ-COMP-002: Regulatory basis

- Status: Proposed
- Priority: Must before claiming compliance
- Requirement: Applicable licences, manufacturer instructions, Australian Standards and state or local requirements must be identified and reviewed by a competent person.

### REQ-COMP-003: Record retention

- Status: Proposed
- Priority: Must before operational reliance
- Requirement: The business must define how long commissioning records and supporting evidence are retained.

## 8. Deferred capabilities

The following capabilities are outside the current MVP until separately accepted:

- Customer and technician digital signatures
- Photographs and file attachments
- Generated PDF commissioning certificates
- Emailing or sharing records
- Record locking and audit history
- Business branding and configurable company details
- A shared site or job record that groups several plant records
- Plant or unit-specific forms and validation
- Reporting and management dashboards

## 9. Open decisions

1. Which plant types and unit types does the business commission?
2. Which checks and measurements belong at plant level and which belong at unit level?
3. What values or ranges constitute a pass, warning or failure?
4. Are photographs, customer signatures or technician signatures required?
5. What final document must be provided to the customer?
6. How long must records be retained?
7. Should several plant records share a reusable site or job record?
8. Which regulatory sources must the application enforce or reference?
9. What verified release threshold must be met before sign-in gates local records and remote record storage is enabled?

## 10. Change process

1. Submit a **Requirement proposal** issue.
2. Clarify the problem, affected user and evidence.
3. Review the proposal and decide whether to accept, reject or defer it.
4. Give an accepted requirement a stable ID and measurable acceptance criteria.
5. Update this document through a reviewed code change.
6. Link implementation and testing work to the requirement ID.
7. Mark a requirement delivered only after its acceptance criteria have been verified.
