# Add application users

This operator tool creates Supabase Auth accounts and their Plumbing Commissioning organisation memberships. It runs locally from the repository; OfficeDev hosting is not required. It is not part of the browser app.

Provide first name, surname, email and role (`technician` or `administrator`). Gmail plus aliases are preserved as distinct account addresses. Each new account gets the initial password `password` unless the operator supplies `PLUMBING_INITIAL_PASSWORD` through a protected process environment. This shared default is for temporary testing only. Change it before normal use. The tool does not enforce a first-login password change or weaken the project's password policy.

Accounts are created with confirmed email, so no invitation or confirmation email is sent. Roles are stored in `organisation_members`, not in editable profile metadata. Plants are not automatically assigned.

## One user on Windows

Run from the repository. Omit `-Apply` to preview the account and membership changes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/add-users.ps1 -FirstName Alex -Surname Smith -Email 'alex+tech01@example.com' -Role technician
```

Add `-Apply` to create the account. Use `-ValidateOnly` for offline input validation without reading credentials or contacting Supabase. Name fields accept spaces and Unicode.

The launcher uses the existing `.env.supabase-readonly.dpapi` credential, encrypted for the current Windows user. Despite its historical filename, this is the previously configured management token: provisioning needs permission to read project API keys. The tool retrieves a server-side key in memory and uses the Auth Admin API. It does not modify the read-only database helper. Neither the token nor the project key is written to a file, command-line argument, output or browser bundle. Node.js 24 and installed repository dependencies are required; the launcher also detects the bundled Codex Node runtime on this PC.

## CSV batch

Save the private CSV outside the repository, or under an ignored `.env.*` filename:

```csv
firstName,surname,email,role
Alex,Smith,alex+tech01@example.com,technician
Jordan,Jones,jordan@example.com,administrator
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/add-users.ps1 -CsvPath '.env.users.csv'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/add-users.ps1 -CsvPath '.env.users.csv' -Apply
```

All rows are validated and existing roles checked before any creation. Up to 100 users per batch. Output shows each email, role, account ID and result, never passwords.

## Repeat runs and failures

Existing organisation members with the requested role are left unchanged, including their names and passwords. A conflicting role or an unrelated existing account stops the batch without making changes. Use a separate, reviewed process for changing roles or resetting passwords.

Auth creation and membership insertion are separate API calls. A network failure can leave a partially completed batch. Re-run identical input: completed users are skipped and accounts tagged by this tool can have their missing membership completed. It does not delete users or silently reset existing credentials. If a role has changed since the original request, stop and review it.

## Other hosts

The Node entry point is portable. Supply `PLUMBING_SUPABASE_MANAGEMENT_TOKEN` from the host's secret store, then pipe a JSON object with `users` and `apply` into `node scripts/provision-users.mjs`. Each user has the same four fields as the CSV. Never put the token in the JSON file. A Windows DPAPI file cannot be copied to Linux and decrypted. No OfficeDev service or credential has been installed by this change.

The CLI is fixed to production project `gdtnotmfvaqqpgxtxvjy` and the Plumbing Commissioning organisation. It accepts no project or organisation override. Automated tests use an injected adapter against isolated fixtures.

API references: [Supabase Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser) and [Management API project keys](https://supabase.com/docs/reference/api/v1-get-project-api-keys).
