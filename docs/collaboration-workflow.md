# Requirements Collaboration Workflow

## Source of truth

`docs/requirements.md` contains the accepted and explicitly provisional product baseline. Chat messages, meeting notes and issue comments are supporting evidence, not accepted requirements by themselves.

## How to propose a change

1. Open the repository's **Issues** tab.
2. Select **New issue**.
3. Choose **Requirement proposal**.
4. Describe the problem, affected user, desired outcome and evidence.
5. Do not include customer names, addresses, photographs or live commissioning records because the repository is public.

## Decision process

1. **New suggestion**: Confirm the proposal is understandable and does not duplicate an existing issue.
2. **Needs clarification**: Identify missing evidence, users, scope or acceptance conditions.
3. **Ready for decision**: State the main trade-offs and proposed priority.
4. **Accepted, rejected or deferred**: Record the decision and reason.
5. **Building**: Link the code change to the issue and requirement ID.
6. **Testing**: Verify every acceptance criterion.
7. **Delivered**: Update the requirements status and close the issue only after verification.

## Recommended GitHub Project configuration

Create a project named **Plumbing Commissioning Requirements** with these status values:

- New suggestion
- Needs clarification
- Ready for decision
- Accepted
- Building
- Testing
- Delivered
- Rejected or deferred

Add these fields:

- Priority: Must, Should, Could, Later
- Type: Requirement, Defect, Research, Compliance
- Owner
- Target release
- Requirement ID
- Appliance type

Recommended views:

- **Requirements board** grouped by Status
- **Accepted backlog** filtered to Accepted
- **Open decisions** filtered to Type: Research or Compliance
- **Delivery roadmap** grouped by Target release

## Review meeting

Hold a short weekly requirements review with someone authorised to make product decisions. Review only items in **Needs clarification** and **Ready for decision**. Record decisions in the issue and, when material, in `docs/decisions.md`.

## Definition of ready

A requirement is ready for development when:

- The problem and affected user are clear.
- The scope and exclusions are stated.
- Acceptance criteria are observable and testable.
- Dependencies, privacy implications and compliance questions are identified.
- An owner and priority are assigned.

## Definition of delivered

A requirement is delivered when:

- The implementation is linked to the requirement ID.
- Every acceptance criterion has been verified.
- Relevant documentation has been updated.
- Known limitations are recorded.
- The accepted requirements catalogue reflects the delivered behaviour.
