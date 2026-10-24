#requires -Version 5.1
<#
.SYNOPSIS
Stages the reviewed ARM64 Function archive without calling Neon or loading env files.
.DESCRIPTION
Use -ArchivePath for a local download, or -ArchiveUri for an operator-confirmed public
HTTPS archive URL. The pinned digest must match before extraction. A fresh function
directory is returned for the separate, manual neon functions deploy command.
#>
[CmdletBinding(DefaultParameterSetName = 'Copy')]
param(
    [Parameter(ParameterSetName = 'Copy')]
    [string] $ArchivePath = (Join-Path $PSScriptRoot '..\artifacts\neon\portalapi.zip'),

    [Parameter(Mandatory = $true, ParameterSetName = 'Download')]
    [uri] $ArchiveUri,

    [string] $StagingParent = (Join-Path $PSScriptRoot '..\artifacts\neon')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$expectedSHA256 = '1afca1c65f0c3b58bde89a5e1b80d3dec92c87b392239da0315ed762ebd0730f'

if ($PSCmdlet.ParameterSetName -eq 'Download') {
    if (-not $ArchiveUri.IsAbsoluteUri -or $ArchiveUri.Scheme -ne 'https' -or
        $ArchiveUri.UserInfo -or $ArchiveUri.Query -or $ArchiveUri.Fragment) {
        throw 'Use an operator-confirmed public HTTPS URL without embedded credentials, query or fragment.'
    }
} else {
    $ArchivePath = (Resolve-Path -LiteralPath $ArchivePath).ProviderPath
}

$null = New-Item -ItemType Directory -Path $StagingParent -Force
$stagingRoot = Join-Path (Resolve-Path -LiteralPath $StagingParent).ProviderPath ('portalapi-prebuilt-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $stagingRoot
$stagedZip = Join-Path $stagingRoot 'portalapi.zip'
if ($PSCmdlet.ParameterSetName -eq 'Download') {
    Invoke-WebRequest -Uri $ArchiveUri -OutFile $stagedZip -UseBasicParsing
} else {
    Copy-Item -LiteralPath $ArchivePath -Destination $stagedZip
}

$actualSHA256 = (Get-FileHash -LiteralPath $stagedZip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualSHA256 -ne $expectedSHA256) {
    throw 'Archive SHA256 differs from the reviewed release. Nothing was extracted or deployed.'
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($stagedZip)
try {
    foreach ($entry in $archive.Entries) {
        $entryPath = $entry.FullName.Replace('\', '/')
        if ($entryPath -match '(^/|(^|/)\.\.(/|$)|:)') {
            throw 'Archive contains an unsafe path.'
        }
    }
    $entryCount = $archive.Entries.Count
} finally {
    $archive.Dispose()
}

$sourceDirectory = Join-Path $stagingRoot 'function'
Expand-Archive -LiteralPath $stagedZip -DestinationPath $sourceDirectory
$requiredFiles = @(
    'index.mjs',
    'node_modules/sharp/package.json',
    'node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64-0.35.5.node',
    'node_modules/@img/sharp-libvips-linux-arm64/lib/libvips-cpp.so.8.18.7'
)
foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $sourceDirectory $relativePath) -PathType Leaf)) {
        throw ('Required Function file is missing: ' + $relativePath)
    }
}

foreach ($relativePath in $requiredFiles[2..3]) {
    $nativeFile = [System.IO.File]::OpenRead((Join-Path $sourceDirectory $relativePath))
    try {
        $header = New-Object byte[] 20
        $read = $nativeFile.Read($header, 0, $header.Length)
        if ($read -ne 20 -or $header[0] -ne 0x7f -or $header[1] -ne 0x45 -or
            $header[2] -ne 0x4c -or $header[3] -ne 0x46 -or $header[5] -ne 1 -or
            $header[18] -ne 183 -or $header[19] -ne 0) {
            throw ('Expected Linux ARM64 ELF file: ' + $relativePath)
        }
    } finally {
        $nativeFile.Dispose()
    }
}
$unexpectedConfig = Get-ChildItem -LiteralPath $sourceDirectory -Recurse -File -Force |
    Where-Object { $_.Name -match '^\.env($|\.)' -or $_.Name -eq '.neon' }
if ($unexpectedConfig) {
    throw 'The Function directory must not contain env or Neon context files.'
}

[pscustomobject]@{
    SourceDirectory = $sourceDirectory
    ArchivePath = $stagedZip
    SHA256 = $actualSHA256
    ArchiveEntries = $entryCount
    NativeArchitecture = 'Linux ARM64 glibc; files inspected, not executed'
}
