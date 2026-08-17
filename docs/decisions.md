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
- Status: Temporary
- Decision: Store MVP records in browser local storage and provide JSON backup export.
- Reason: This supports early offline testing without accounts or backend infrastructure.
- Risk: Clearing browser data, changing devices or losing the device can remove records.
- Review trigger: Before live operational reliance, multiple technicians, or storage of material volumes of customer information.

## DEC-003: One appliance per record

- Date: 17 August 2026
- Status: Provisional
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
