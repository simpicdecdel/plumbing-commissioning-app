# Product Decision Log

This log records material product decisions and their reasons. Changing an accepted decision requires a new entry that replaces it rather than silently rewriting history.

## DEC-001: Offline-first Progressive Web App

- Date: 17 August 2026
- Status: Accepted
- Decision: Build an installable, offline-first Progressive Web App for mobile field use.
- Reason: Technicians need mobile access at sites where connectivity may be unreliable.
- Review trigger: Native-device capabilities become mandatory or browser limitations prevent required functions.

## DEC-002: Local browser storage for the MVP

- Date: 17 August 2026
- Status: Replaced
- Decision: Store MVP records in browser local storage and provide JSON backup export.
- Reason: This supports early offline testing without accounts or backend infrastructure.
- Risk: Clearing browser data, changing devices or losing the device can remove records.
- Review trigger: Before live operational reliance, multiple technicians, or storage of material volumes of customer information.

## DEC-003: One appliance per record

- Date: 17 August 2026
- Status: Replaced
- Decision: Treat one commissioning record as one appliance at one site.
- Reason: This is the simplest record structure for the first build.
- Review trigger: Confirm the business workflow for jobs containing several appliances.

## DEC-004: Generic commissioning checklist

- Date: 17 August 2026
- Status: Provisional
- Decision: Use a generic checklist and optional measurements across common water-connected appliances.
- Reason: No confirmed appliance-specific field specification was available during the first build.
- Risk: A generic checklist cannot substantiate regulatory or manufacturer compliance.
- Review trigger: A competent person confirms the supported appliance types and their required checks, ranges and evidence.

## DEC-005: GitHub as the requirements source of truth

- Date: 17 August 2026
- Status: Accepted
- Decision: Keep accepted requirements in `docs/requirements.md`. Use GitHub issues for proposed changes and implementation work.
- Reason: Requirements, code changes and tests need shared version history and traceability without maintaining competing documents.
- Review trigger: The operational team cannot participate effectively through the GitHub web interface.

## DEC-006: Plant-centric commissioning record

- Date: 19 August 2026
- Status: Accepted
- Decision: Treat one commissioning record as one plant at one site or job. The record contains multiple units and unit-level faults or exceptions.
- Reason: Commercial hot water systems may contain multiple units operating as one plant, while individual unit failures still need to be identifiable.
- Risks and trade-offs: A site with several plants requires several records until a shared site or job layer is justified.
- Review trigger: Field testing shows that plant boundaries or cross-plant commissioning cannot be represented clearly.
- Replaces: DEC-003

## DEC-007: IndexedDB through a storage abstraction

- Date: 19 August 2026
- Status: Accepted
- Decision: Store records and autosaved drafts in IndexedDB through Dexie. UI code uses `commissioningStore` and does not call browser persistence APIs directly.
- Reason: IndexedDB is better suited to structured offline records and future attachments or synchronisation. The boundary allows the persistence implementation to change without rewriting the screens.
- Alternatives considered: Keep localStorage; add Supabase at the same time.
- Risks and trade-offs: Data is still tied to one browser profile and device. Dexie becomes a pinned client dependency.
- Review trigger: Central multi-user storage or synchronisation is accepted.
- Replaces: DEC-002

## DEC-008: Preserve earlier local records during upgrade

- Date: 19 August 2026
- Status: Accepted
- Decision: On first run, convert each earlier one-appliance localStorage record into one plant containing one unit, then remove the old values only after the IndexedDB transaction succeeds.
- Reason: Existing field-test data should not be discarded when the record structure changes.
- Risks and trade-offs: The migration cannot infer a real plant boundary from an earlier single-appliance record, so migrated plant names may need manual correction.
- Review trigger: Migration testing identifies earlier record shapes that cannot be converted safely.

## DEC-009: Managed Supabase multi-user service

- Date: 20 August 2026
- Status: Accepted
- Decision: Use a managed Supabase project in Sydney for invite-only email authentication, central commissioning records and database-enforced organisation roles. Retain IndexedDB as the offline working store. Use revision-checked writes and explicit conflict resolution rather than last-write-wins updates.
- Reason: Multiple technicians and office users need shared records without making one business-managed server the production availability and security boundary.
- Alternatives considered: Continue with device-only records; self-host the central services on OfficeDev; use Firebase.
- Risks and trade-offs: The service creates an external operating cost and vendor dependency. Conflict resolution, confirmed migration of earlier local records and live integration tests still require work.
- Review trigger: Cost, data residency, availability or integration constraints become unacceptable, or the business gains the capacity to operate and secure the full service itself.
- Replaces: The remaining local-only aspect of DEC-007. The IndexedDB storage boundary remains accepted.

### Implementation status at 21 August 2026

- Implemented: authentication client, sign-in, password reset and recovery, sign-out, membership display, public production configuration, deployed initial database migration, static security tests, local-first synchronisation, offline queueing, cross-device download, safe conflict reporting and explicit central-or-technician conflict resolution.
- Not implemented: confirmed local-to-remote migration, role enforcement for local-only delete or backup restore, and server-side restore UI.
- Manually verified on 20 August 2026: production tables, RLS enablement, policies, security-definer function grants, anonymous read denial, administrator membership and live administrator sign-in.
- Manually verified on 21 August 2026: a live Supabase record created in one browser origin downloaded into a fresh origin.
- Automated live coverage exists for conflict resolution, soft deletion and restore, and the technician, administrator, revoked-member and cross-organisation permission matrix. Not verified for the current release: a successful run against the dedicated Supabase test project and live offline retry.

## Decision entry template

```text
## DEC-NNN: Short title

- Date: YYYY-MM-DD
- Status: Proposed | Accepted | Temporary | Replaced
- Decision:
- Reason:
- Alternatives considered:
- Risks and trade-offs:
- Review trigger:
- Replaces:
```
