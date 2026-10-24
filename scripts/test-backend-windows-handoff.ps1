#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $ArchivePath,
    [Parameter(Mandatory = $true)] [string] $TestRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $TestRoot) { throw 'TestRoot must be a fresh local directory.' }
$null = New-Item -ItemType Directory -Path $TestRoot
$helper = Join-Path $PSScriptRoot 'prepare-backend-windows.ps1'
$global:dddHandoffArchiveFixture = (Resolve-Path -LiteralPath $ArchivePath).ProviderPath
$global:dddHandoffDownloadCalls = 0
$global:dddHandoffNeonCalls = 0
function global:neon {
    $global:dddHandoffNeonCalls++
    throw 'A handoff preparation test must never call Neon.'
}
function Assert-True([bool] $Condition, [string] $Message) {
    if (-not $Condition) { throw $Message }
}
$checks = New-Object System.Collections.Generic.List[string]
$sentinel = Join-Path $TestRoot '.env.backend.local'
[System.IO.File]::WriteAllText($sentinel, 'synthetic sentinel, never a real environment file')
$sentinelBefore = (Get-FileHash -LiteralPath $sentinel -Algorithm SHA256).Hash
$copy = & $helper -ArchivePath $global:dddHandoffArchiveFixture -StagingParent $TestRoot
Assert-True ($copy.ArchiveEntries -eq 93) 'Unexpected archive inventory.'
Assert-True ((Get-FileHash -LiteralPath (Join-Path $copy.SourceDirectory 'index.mjs') -Algorithm SHA256).Hash.ToLowerInvariant() -eq '5f33d61cf558e6dd9ea32c98f31cd4a166e74a8e7192c74505ff3eb36077b7d6') 'Unexpected deployed JavaScript bytes.'
$checks.Add('Actual reviewed ZIP copied, hash-checked, expanded, full entry/native files validated')
$copyAgain = & $helper -ArchivePath $global:dddHandoffArchiveFixture -StagingParent $TestRoot
Assert-True ($copyAgain.SourceDirectory -ne $copy.SourceDirectory) 'Repeated preparation reused an existing directory.'
$checks.Add('Second run uses a new directory and preserves the first result')

$badZip = Join-Path $TestRoot 'bad archive.zip'
[System.IO.File]::WriteAllText($badZip, 'deliberately invalid synthetic archive')
$caught = $false
try { $null = & $helper -ArchivePath $badZip -StagingParent $TestRoot }
catch { $caught = $_.Exception.Message -match 'SHA256 differs' }
Assert-True $caught 'Corrupted input did not stop at the digest guard.'
$checks.Add('Wrong digest rejects before ZIP extraction')

function global:Invoke-WebRequest {
    param([uri] $Uri, [string] $OutFile, [switch] $UseBasicParsing)
    $global:dddHandoffDownloadCalls++
    Copy-Item -LiteralPath $global:dddHandoffArchiveFixture -Destination $OutFile
}
try {
    $download = & $helper -ArchiveUri 'https://artifact.example.test/reviewed.zip' -StagingParent $TestRoot
    Assert-True ($download.SHA256 -eq $copy.SHA256) 'Mocked transport changed the archive.'
    $checks.Add('HTTPS download branch tested with explicit local transport mock, no network request')
    foreach ($uri in @('http://artifact.example.test/reviewed.zip', 'https://secret@artifact.example.test/reviewed.zip', 'https://artifact.example.test/reviewed.zip?token=synthetic')) {
        $caught = $false
        try { $null = & $helper -ArchiveUri $uri -StagingParent $TestRoot }
        catch { $caught = $_.Exception.Message -match 'public HTTPS URL' }
        Assert-True $caught 'Unsafe download URL was not rejected.'
    }
    Assert-True ($global:dddHandoffDownloadCalls -eq 1) 'Rejected URL unexpectedly reached transport.'
    $checks.Add('HTTP, embedded credential and query-bearing URLs rejected without transport')
} finally {
    Remove-Item function:global:Invoke-WebRequest
}

Assert-True ((Get-FileHash -LiteralPath $sentinel -Algorithm SHA256).Hash -eq $sentinelBefore) 'Synthetic environment sentinel changed.'
Assert-True (-not (Test-Path -LiteralPath (Join-Path $copy.SourceDirectory '.env.backend.local'))) 'An environment file entered the Function tree.'
Assert-True ($global:dddHandoffNeonCalls -eq 0) 'A Neon command was invoked.'
$checks.Add('Synthetic environment sentinel unchanged; no env file packaged; zero Neon commands')
Remove-Item function:global:neon
$result = [pscustomobject]@{
    Passed = $checks.Count
    Checks = $checks.ToArray()
    PowerShellVersion = $PSVersionTable.PSVersion.ToString()
    RuntimePlatform = $(if ($PSVersionTable.ContainsKey('Platform')) { $PSVersionTable.Platform } else { 'Win32NT' })
    ArchiveSHA256 = $copy.SHA256
    ArchiveEntries = $copy.ArchiveEntries
    NativeWindowsExecution = 'not performed'
    LiveDownload = 'not performed; transport mocked explicitly'
    ProviderActions = 0
}
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $TestRoot 'report.json') -Encoding UTF8
$result
