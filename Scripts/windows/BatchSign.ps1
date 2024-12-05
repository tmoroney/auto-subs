# Define the certificate thumbprint
$CertThumbprint = $env:CERT_THUMBPRINT
if (-not $CertThumbprint) {
    Write-Error "Environment variable CERT_THUMBPRINT is not set."
    exit 1
}
Write-Output "Certificate thumbprint: $CertThumbprint"

# Define the timestamp server URL
$TimestampServer = "http://time.certum.pl"

# Define the target directory
$TargetDirectory = "..\AutoSubs-App\src-tauri\resources\Transcription-Server"

$FullPath = Resolve-Path $TargetDirectory
Write-Output "Full path: $FullPath"

# Get all .exe and .dll files recursively in the directory
$BinaryFiles = Get-ChildItem -Path $FullPath -Recurse -Include *.exe, *.dll

# Check if any files are found
if ($BinaryFiles.Count -eq 0) {
    Write-Host "No .exe or .dll files found in the target directory."
    exit
}

# Collect all file paths
$FilePaths = $BinaryFiles.ForEach({ "`"$($_.FullName)`"" }) -join " "

# Sign all files in a single command
Write-Host "Signing files: $FilePaths"
Start-Process -FilePath "signtool" -ArgumentList @(
    "sign",
    "/sha1", $CertThumbprint,
    "/tr", $TimestampServer,
    "/td", "sha256",
    "/fd", "sha256",
    "/v", $FilePaths
) -Wait

Write-Host "All files have been signed successfully."
