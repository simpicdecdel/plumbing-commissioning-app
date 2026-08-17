# Plumbing Commissioning App Requirements

Version: 0.1

Last updated: 17 August 2026

Status: Current MVP baseline

## 1. Purpose

The product provides a mobile-friendly appliance commissioning application for a small Australian family plumbing business. It supports technicians recording commissioning work at customer sites, including when an internet connection is unavailable.

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

Priorities use Must, Should, Could and Later.

## 3. Business requirements

### REQ-BUS-001: Field commissioning records

- Status: Accepted
- Priority: Must
- Requirement: The product must allow a plumbing technician to record appliance commissioning work while on site.
- Acceptance criteria:
  - A technician can create and complete a commissioning record on a mobile phone.
  - The record captures the job, appliance, installation checks, results and handover information.

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
  - Search matches customer or site name, address, job reference, appliance type, manufacturer and model.
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

### REQ-F-009: Export a backup

- Status: Accepted
- Priority: Must
- Requirement: A technician must be able to export all locally stored records as a JSON backup.
- Acceptance criteria:
  - The export contains a schema version, export timestamp and all records.
  - The downloaded filename includes the export date.

### REQ-F-010: Restore a backup

- Status: Proposed
- Priority: Must before operational reliance
- Requirement: An authorised user should be able to restore records from a valid exported backup.
- Acceptance criteria: To be defined after the record schema is confirmed.

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

## 5. Record data requirements

### REQ-D-001: One appliance per record

- Status: Provisional
- Priority: Must
- Requirement: One commissioning record represents one appliance at one site.
- Decision needed: Confirm whether a job containing several appliances should use separate records or a parent job with multiple appliance records.

### REQ-D-002: Job details

- Status: Provisional
- Priority: Must
- Requirement: A record captures:
  - Customer or site name, mandatory
  - Site address, mandatory
  - Commissioning date, mandatory
  - Technician, mandatory
  - Job reference, optional

### REQ-D-003: Appliance details

- Status: Provisional
- Priority: Must
- Requirement: A record captures:
  - Appliance type, mandatory
  - Appliance location, optional
  - Manufacturer, optional
  - Model, optional
  - Serial number, optional

### REQ-D-004: Appliance types

- Status: Provisional
- Priority: Must
- Requirement: The MVP provides these appliance types:
  - Hot water system
  - Tapware or mixer
  - Toilet or cistern
  - Dishwasher
  - Washing machine
  - Water filter
  - Pump
  - Other
- Decision needed: Confirm the actual appliance types commissioned by the business.

### REQ-D-005: Installation checks

- Status: Provisional
- Priority: Must
- Requirement: A technician can record whether:
  - The appliance is secure and level.
  - Connections are correct and accessible.
  - There are no visible leaks.
  - Isolation valves are fitted and working.
  - Drainage or discharge is correct.
  - Manufacturer instructions were followed.
- Acceptance criteria:
  - Each check can be marked independently.
  - Notes can explain defects, actions and items that do not apply.

### REQ-D-006: Commissioning measurements

- Status: Provisional
- Priority: Must
- Requirement: A technician can record:
  - Static pressure in kPa
  - Flow pressure in kPa
  - Flow rate in litres per minute
  - Outlet temperature in degrees Celsius
- Current rule: Measurements are optional because they do not apply to every appliance.
- Decision needed: Define mandatory measurements and acceptable ranges for each appliance type.

### REQ-D-007: Test outcome

- Status: Provisional
- Priority: Must
- Requirement: Every completed record has one of these outcomes:
  - Passed
  - Passed with actions
  - Failed

### REQ-D-008: Notes, defects and actions

- Status: Accepted
- Priority: Must
- Requirement: A technician can record free-text notes, defects and required actions.

### REQ-D-009: Handover details

- Status: Provisional
- Priority: Should
- Requirement: A technician can record:
  - Operation demonstrated
  - Instructions or warranty documents provided
  - Work area left clean
  - Customer representative name
  - Handover date

### REQ-D-010: Minimum completion fields

- Status: Provisional
- Priority: Must
- Requirement: Completion currently requires:
  - Customer or site name
  - Site address
  - Commissioning date
  - Technician
  - Appliance type
  - Test outcome
- Decision needed: Confirm whether checklist items, measurements, notes, customer acknowledgement or technician acknowledgement must also be mandatory.

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

## 7. Security, privacy and compliance

### REQ-SEC-001: Local storage disclosure

- Status: Accepted
- Priority: Must
- Requirement: Users must be told that records are stored in the browser on the device and may be removed by clearing site data or losing the device.

### REQ-SEC-002: Access control

- Status: Proposed
- Priority: Must before handling live customer records at scale
- Requirement: Only authorised users should be able to access business and customer commissioning records.
- Decision needed: Define user roles, authentication method and device requirements.

### REQ-SEC-003: Central storage and synchronisation

- Status: Proposed
- Priority: Must before multi-user use
- Requirement: Records should be stored centrally and synchronised between authorised technicians and office staff.
- Decision needed: Define offline conflict handling, ownership and retention.

### REQ-SEC-004: Public repository hygiene

- Status: Accepted
- Priority: Must
- Requirement: Customer names, addresses, photographs, live records and other sensitive information must not be entered in the public repository, issues or project board.

### REQ-COMP-001: Appliance-specific rules

- Status: Proposed
- Priority: Must before claiming compliance
- Requirement: Required checks, measurements, acceptable ranges and evidence must be defined for each supported appliance type.

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
- Multiple users and user administration
- Record locking and audit history
- Business branding and configurable company details
- Multiple appliances grouped under one job
- Appliance-specific forms and validation
- Reporting and management dashboards

## 9. Open decisions

1. Which appliance types does the business commission?
2. Which checks and measurements are mandatory for each appliance type?
3. What values or ranges constitute a pass, warning or failure?
4. Are photographs, customer signatures or technician signatures required?
5. What final document must be provided to the customer?
6. Must records synchronise between technicians and the office?
7. How long must records be retained?
8. Who may create, edit, complete, reopen or delete records?
9. Should multiple appliances be grouped under one job?
10. Which regulatory sources must the application enforce or reference?

## 10. Change process

1. Submit a **Requirement proposal** issue.
2. Clarify the problem, affected user and evidence.
3. Review the proposal and decide whether to accept, reject or defer it.
4. Give an accepted requirement a stable ID and measurable acceptance criteria.
5. Update this document through a reviewed code change.
6. Link implementation and testing work to the requirement ID.
7. Mark a requirement delivered only after its acceptance criteria have been verified.
