#Requires -Version 5.1
param(
    [Parameter(Mandatory = $false)]
    [string]$Tag
)

$ErrorActionPreference = "Stop"

$Repo = "tmoroney/auto-subs"

if (-not $Tag) {
    Write-Host "No tag supplied. Looking up the newest release for $Repo..."
    $releases = gh release list --repo $Repo --json tagName,isDraft --limit 30 | ConvertFrom-Json
    $draft = $releases | Where-Object { $_.isDraft } | Select-Object -First 1
    if ($draft) {
        $Tag = $draft.tagName
        Write-Host "Using newest draft release: $Tag"
    } else {
        $release = $releases | Select-Object -First 1
        if (-not $release) {
            Write-Error "No release found for $Repo. Create a release first or pass a tag explicitly."
            exit 1
        }
        $Tag = $release.tagName
        Write-Host "No draft release found; using newest release: $Tag"
    }
}

# Normalize tag to vX.Y.Z
if ($Tag -notmatch '^v') {
    $Tag = "v$Tag"
}

$Version = $Tag -replace '^v', ''

$TargetDir = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { [System.IO.Path]::Combine($PSScriptRoot, "..", "src-tauri", "target") }
$BundleDir = [System.IO.Path]::Combine($TargetDir, "release", "bundle", "nsis")

if (-not (Test-Path $BundleDir)) {
    Write-Error "NSIS bundle directory not found: $BundleDir. Did you run 'npm run build:win' first?"
    exit 1
}

$BundleDir = Resolve-Path $BundleDir

# Tauri NSIS outputs something like AutoSubs_3.7.0_x64-setup.exe (or with a locale suffix).
$InstallerFilter = "AutoSubs_${Version}*-setup.exe"
$Installer = Get-ChildItem -Path $BundleDir -Filter $InstallerFilter | Select-Object -First 1
if (-not $Installer) {
    Write-Error "No installer found in $BundleDir matching $InstallerFilter"
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

# Trigger the updater JSON workflow. It checks whether the Mac signatures are
# already present before generating latest.json, so whichever upload finishes
# last (Mac CI or this Windows upload) will actually produce the file.
Write-Host "Triggering updater JSON generation..."
gh workflow run generate-updater-json.yml `
    --repo $Repo `
    -f tag="$Tag"

Write-Host "✅ Updater JSON generation triggered"
