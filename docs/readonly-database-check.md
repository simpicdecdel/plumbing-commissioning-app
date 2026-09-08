# Read-only production database check

Status: helper prepared and syntax/describe checks passed. The user approved an account-wide token on 9 September 2026; a token named Plumbing production checks - local helper was created, expiring 9 October 2026. Private entry, encrypted storage, and a fresh-process API query using the saved credential were verified successfully on 9 September 2026. The query returned five active records and one deleted test record.

Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-production-records.ps1` from the repository to list record names, IDs, organisation IDs, revisions, update times and deletion times. Device pending edits cannot be verified from the database alone.

The script uses only the Supabase Management API read-only query endpoint, with a fixed SELECT against production project `gdtnotmfvaqqpgxtxvjy`. It accepts no arbitrary SQL or alternate project. `-Describe` prints the endpoint and query without accessing credentials or the network.

Windows script execution is disabled by default on this host. The command uses a process-only override for this reviewed helper; it does not change the persistent Windows execution policy.

## Credential setup

Prefer a fine-grained personal access token scoped to this project with only Database Read (`database_read`). Supabase documents this permission at https://supabase.com/docs/reference/api/v1-read-only-query and scoped tokens at https://supabase.com/docs/guides/platform/personal-access-tokens.

On 9 September 2026, the account dashboard's token creation form displayed only name and expiry, with a warning that tokens can control the whole account. Do not treat that classic token as read-only. Using the read-only endpoint limits this helper's operations, not the credential's wider capabilities. Explicit user approval is required before provisioning that broader credential. The user explicitly approved the broader token before creation.

After permissions are agreed and the token is created, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-production-records.ps1 -SaveToken` in a private local terminal. Paste the token into the hidden prompt. Do not paste it in chat, command arguments, public config or source files. The helper validates it using the fixed read-only query before saving it.

The saved file `.env.supabase-readonly.dpapi` is ignored by Git and encrypted using Windows DPAPI directly through .NET for the current Windows user and computer. The helper avoids ConvertFrom-SecureString and ConvertTo-SecureString because Microsoft.PowerShell.Security failed to load on this host. Use -TestEncryption for a synthetic encryption/decryption check without accessing the credential. This prevents plain-text storage; processes running as that Windows user can still decrypt it. The local web server's public asset allowlist excludes it. Keep tokens out of deployment artefacts and revoke them in Supabase when no longer required.
