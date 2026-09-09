[CmdletBinding(DefaultParameterSetName = 'Single')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Single')][string]$FirstName,
    [Parameter(Mandatory, ParameterSetName = 'Single')][string]$Surname,
    [Parameter(Mandatory, ParameterSetName = 'Single')][string]$Email,
    [Parameter(Mandatory, ParameterSetName = 'Single')][ValidateSet('administrator', 'technician')][string]$Role,
    [Parameter(Mandatory, ParameterSetName = 'Batch')][string]$CsvPath,
    [switch]$Apply,
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$users = if ($PSCmdlet.ParameterSetName -eq 'Batch') {
    @(Import-Csv -LiteralPath $CsvPath -Encoding UTF8 | ForEach-Object {
        @{ firstName = $_.firstName; surname = $_.surname; email = $_.email; role = $_.role }
    })
} else {
    @(@{ firstName = $FirstName; surname = $Surname; email = $Email; role = $Role })
}
$request = @{ users = @($users); apply = [bool]$Apply; validateOnly = [bool]$ValidateOnly }
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else {
    Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js is required. Install Node.js 24 or add it to PATH.' }
$scriptPath = Join-Path $PSScriptRoot 'provision-users.mjs'
$bytes = $null
$inputBytes = $null
$process = $null
try {
    if (-not $ValidateOnly) {
        # Use DPAPI directly; the PowerShell Security module is unavailable on this host.
        [void][System.Reflection.Assembly]::LoadWithPartialName('System.Security')
        $credentialPath = Join-Path $PSScriptRoot '..\.env.supabase-readonly.dpapi'
        try {
            $bytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
                [Convert]::FromBase64String([IO.File]::ReadAllText($credentialPath).Trim()),
                $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
            $request.managementToken = [Text.Encoding]::Unicode.GetString($bytes)
        } catch { throw 'Could not read the saved Windows credential. Run as the Windows user who saved it.' }
    }
    # Credentials travel only over the child process stdin, never argv or a file.
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $nodePath
    $start.Arguments = '"' + $scriptPath + '"'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    [void]$process.Start()
    $inputBytes = [Text.Encoding]::UTF8.GetBytes(($request | ConvertTo-Json -Depth 5 -Compress))
    $process.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length)
    $process.StandardInput.Close()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw 'User tool did not complete. See the safe error above. Re-run the same input to inspect/resume.' }
} finally {
    $request.Clear()
    if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    if ($null -ne $inputBytes) { [Array]::Clear($inputBytes, 0, $inputBytes.Length) }
    if ($null -ne $process) { $process.Dispose() }
}
