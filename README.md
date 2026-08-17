# Plumbing Commissioning App

An offline-first, installable web app for a small Australian plumbing business to record appliance commissioning in the field.

## Product documentation

- [Current requirements](docs/requirements.md)
- [Product decision log](docs/decisions.md)
- [Requirements collaboration workflow](docs/collaboration-workflow.md)
- [Glossary](docs/glossary.md)

Use the repository's **Requirement proposal** issue form to suggest additions or changes. Accepted requirements are added to `docs/requirements.md` with a stable identifier and testable acceptance criteria.

## MVP capabilities

- Create, edit and complete commissioning records.
- Capture job, appliance, installation, test result and handover details.
- Autosave unfinished work locally.
- Search saved records on the device.
- Work after the first successful load without a network connection.
- Print a record and export all records as a JSON backup.
- Install as a Progressive Web App where the browser supports installation.

## MVP assumptions

The source conversation did not include a confirmed field-by-field form, so this version uses these explicit defaults:

- One record covers one appliance at one site.
- The checklist is generic across common water-connected appliances.
- Pressure, flow and outlet temperature fields are optional because they do not apply to every appliance.
- A technician can complete a record after filling the customer, address, date, technician, appliance type and outcome fields.
- Records live only in the browser's local storage. There is no login, cloud sync, central database, photo capture, digital signature or PDF generator yet.
- The JSON export is a backup only. Restore/import is deferred until the record schema is confirmed.
- Regulatory compliance remains the technician's responsibility. The generic checklist does not replace manufacturer instructions, licences, applicable Australian Standards or local requirements.

These choices keep the first version usable without creating false compliance claims. The next product decision should confirm the required appliance types and the exact mandatory readings/checks for each.

## Run locally

Serve the folder over HTTP. Service workers do not run reliably when `index.html` is opened directly from the filesystem.

For example:

```text
npx serve .
```

Then open the local address shown in the terminal. Load it once online before testing offline mode.

## Data and privacy

Records are saved in browser local storage on the device in use. Clearing site data or uninstalling the browser can remove them. Export backups regularly. Do not rely on this MVP as the sole permanent business record until central storage and restore have been implemented and tested.
