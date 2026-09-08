param(
    [switch]$SaveToken,
    [switch]$Describe,
    [switch]$TestEncryption
)

$ErrorActionPreference = 'Stop'
$projectRef = 'gdtnotmfvaqqpgxtxvjy'
$endpoint = "https://api.supabase.com/v1/projects/$projectRef/database/query/read-only"
$credentialPath = Join-Path $PSScriptRoot '..\.env.supabase-readonly.dpapi'
# Fixed query: no arbitrary SQL, project override, or write endpoint is accepted.
$query = @'
select id, organisation_id, payload->'job'->>'siteName' as site_name,
       revision, updated_at, deleted_at
from public.commissioning_records
order by updated_at desc, id
'@

if ($Describe) {
    Write-Output "Project: $projectRef"
    Write-Output "Endpoint: $endpoint"
    Write-Output $query
    exit 0
}

# Use DPAPI directly: Microsoft.PowerShell.Security cannot load on this host.
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Security')
function Protect-Token([System.Security.SecureString]$Value) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    $bytes = $null
    try {
        $bytes = New-Object byte[] ($Value.Length * 2)
        [Runtime.InteropServices.Marshal]::Copy($pointer, $bytes, 0, $bytes.Length)
        $encrypted = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
        return [Convert]::ToBase64String($encrypted)
    } finally {
        if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Unprotect-Token([string]$Value) {
    $bytes = [System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($Value), $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    $secure = New-Object System.Security.SecureString
    try {
        for ($index = 0; $index -lt $bytes.Length; $index += 2) {
            $secure.AppendChar([char]([int]$bytes[$index] + 256 * [int]$bytes[$index + 1]))
        }
        $secure.MakeReadOnly()
        return $secure
    } catch {
        $secure.Dispose()
        throw
    } finally {
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
}

if ($TestEncryption) {
    $sample = New-Object System.Security.SecureString
    $restored = $null
    $pointer = [IntPtr]::Zero
    try {
        'synthetic-token-for-encryption-test'.ToCharArray() | ForEach-Object { $sample.AppendChar($_) }
        $encrypted = Protect-Token $sample
        $restored = Unprotect-Token $encrypted
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($restored)
        if ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) -cne 'synthetic-token-for-encryption-test') { throw 'Encryption round-trip failed.' }
        Write-Output 'Windows encryption and decryption test passed. No credential accessed or saved.'
    } finally {
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        if ($restored) { $restored.Dispose() }
        $sample.Dispose()
    }
    exit 0
}

if ($SaveToken) {
    $secureToken = Read-Host 'Paste the Supabase access token (input is hidden)' -AsSecureString
} elseif (Test-Path -LiteralPath $credentialPath) {
    $secureToken = Unprotect-Token ([IO.File]::ReadAllText($credentialPath).Trim())
} else {
    throw 'No credential is configured. Run with -SaveToken only after approving the token permissions. Do not paste a token into chat.'
}

if ($secureToken.Length -eq 0) { throw 'No token entered.' }
$tokenPointer = [IntPtr]::Zero
$headers = $null
try {
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $headers = @{ Authorization = 'Bearer ' + [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer) }
    $body = @{ query = $query } | ConvertTo-Json -Compress
    try {
        $result = Invoke-RestMethod -Uri $endpoint -Method Post -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 30 -MaximumRedirection 0
    } catch {
        # Do not print raw exceptions, request headers, or response bodies.
        throw 'The read-only database request failed. Check token permissions, expiry, network access and API availability. The credential was not saved.'
    }
    if ($SaveToken) {
        # Windows DPAPI encrypts for the current Windows user on this computer.
        [IO.File]::WriteAllText($credentialPath, (Protect-Token $secureToken), [Text.Encoding]::ASCII)
        Write-Output 'Token validated and saved with Windows encryption.'
    }
    $result | ConvertTo-Json -Depth 8
} finally {
    if ($headers) { $headers.Clear() }
    if ($tokenPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer) }
    $secureToken.Dispose()
}
