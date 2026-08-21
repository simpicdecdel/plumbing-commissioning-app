# Glossary

## Administrator

An authenticated organisation member with the `administrator` role. The synchronisation path reserves server deletion for this role. A record that has never been synchronised can still be deleted locally without signing in.

## Acceptance criteria

Observable conditions that must be met before a requirement or change is considered delivered.

## Accepted requirement

A requirement approved as part of the product baseline.

## Appliance

A legacy term from the first MVP. The current product distinguishes a plant from the individual units operating within it.

## Commissioning

The checks, measurements, testing and handover performed to establish and record that installed plant and its units operate as required.

## Completed record

A record that satisfies the current mandatory fields and has been deliberately marked completed by a technician.

## Draft

An incomplete or unfinished commissioning record saved for later work.

## MVP

Minimum viable product. The smallest version used to test the workflow and requirements. MVP behaviour does not automatically represent the final operational or compliance requirement.

## Offline-first

Designed so core functions remain available without a network connection after the application has first loaded successfully.

## Organisation

The business boundary used by the Supabase design. Membership determines which centrally stored commissioning records an authenticated user may access.

## Plant

The collection of equipment commissioned as one operating system at a site. One commissioning record currently represents one plant.

## Unit

An individually identifiable item of equipment operating within a plant. A unit can carry its own fault or exception without requiring a separate commissioning record.

## Progressive Web App (PWA)

A website with a manifest and service worker that supported browsers can install and run in an app-like window.

## Proposed requirement

A suggested requirement that has not yet been accepted into the product baseline.

## Provisional requirement

An MVP assumption currently represented in the product but awaiting business confirmation.

## Requirement owner

The person accountable for clarifying and approving a requirement. Ownership does not necessarily mean performing the development work.

## Source of truth

The authoritative location containing the current accepted requirements. For this product, it is `docs/requirements.md`.

## Synchronisation

The process that reconciles local IndexedDB records with Supabase. Signed-in changes are queued locally, uploaded when connectivity is available and downloaded to other signed-in devices. Stale edits are retained and reported as conflicts, but the conflict-resolution screen is not yet implemented.

## Row-level security

Database policies that restrict which rows an authenticated Supabase user can read. The initial migration is deployed, and its production RLS enablement, policy presence and grants were verified manually on 20 August 2026. Full live role and cross-organisation behaviour remains to be integration-tested.
