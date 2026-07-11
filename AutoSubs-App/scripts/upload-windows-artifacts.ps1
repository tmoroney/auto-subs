#Requires -Version 7.2
param(
    [Parameter(Mandatory = $true)]
    [string]$Tag
)

$ErrorActionPreference = "Stop"

# Normalize tag to vX.Y.Z
if ($Tag -notmatch '^v') {
    $Tag = "v$Tag"
}

$Version = $Tag -replace '^v', ''
$Repo = "tmoroney/auto-subs"

$BundleDir = Join-Path $PSScriptRoot ".." "src-tauri" "target" "release" "bundle" "nsis" | Resolve-Path

if (-not (Test-Path $BundleDir)) {
    Write-Error "NSIS bundle directory not found: $BundleDir. Did you run 'npm run build:win' first?"
    exit 1
}

# Tauri NSIS outputs something like AutoSubs_3.7.0_x64-setup.exe (or with a locale suffix).
$Installer = Get-ChildItem -Path $BundleDir -Filter "AutoSubs_*-setup.exe" | Select-Object -First 1
if (-not $Installer) {
    Write-Error "No installer found in $BundleDir matching AutoSubs_*-setup.exe"
    exit 1
}

$SigFile = Get-ChildItem -Path $BundleDir -Filter "$($Installer.Name).sig" | Select-Object -First 1
if (-not $SigFile) {
    Write-Error "Signature file not found for $($Installer.Name)"
    exit 1
}

$NewInstallerName = "AutoSubs-windows-x86_64.exe"
$NewSigName = "$NewInstallerName.sig"

$TempDir = Join-Path $env:TEMP "autosubs-release-$Version"
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

$TempInstaller = Join-Path $TempDir $NewInstallerName
$TempSig = Join-Path $TempDir $NewSigName

Copy-Item -Path $Installer.FullName -Destination $TempInstaller -Force
Copy-Item -Path $SigFile.FullName -Destination $TempSig -Force

Write-Host "Uploading Windows artifacts for $Tag to release..."
Write-Host "  Installer: $($Installer.Name) -> $NewInstallerName"
Write-Host "  Signature: $($SigFile.Name) -> $NewSigName"

gh release upload $Tag `
    $TempInstaller `
    $TempSig `
    --repo $Repo `
    --clobber

Write-Host "✅ Windows artifacts uploaded to $Repo release $Tag"
