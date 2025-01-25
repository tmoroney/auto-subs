# Navigate to Transcription-Server directory
Set-Location -Path "./Transcription-Server"

# Activate virtual environment
& .\.venv\Scripts\Activate.ps1

# Package the server using PyInstaller
pyinstaller package-server.spec --noconfirm

# Navigate back one directory
Set-Location -Path ".."

# Define source and destination paths
$SourcePath = "Transcription-Server\dist\Transcription-Server"
$DestinationPath = "AutoSubs-App\src-tauri\resources\Transcription-Server"

# Copy Transcription-Server to AutoSubs-App/src-tauri/resources (replace any older version)
if (Test-Path -Path $DestinationPath) {
    Remove-Item -Path $DestinationPath -Recurse -Force
}
Copy-Item -Path $SourcePath -Destination $DestinationPath -Recurse -Force

# Sign the binaries in the destination folder
# Define the certificate thumbprint
$CertThumbprint = $env:CERT_THUMBPRINT
if (-not $CertThumbprint) {
    Write-Error "Environment variable CERT_THUMBPRINT is not set."
    exit 1
}
Write-Output "Certificate thumbprint: $CertThumbprint"

# Define the timestamp server URL
$TimestampServer = "http://time.certum.pl"

# Get full path of the target directory
$FullPath = Resolve-Path $DestinationPath
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

# Navigate to AutoSubs-App and build the Tauri app
Set-Location -Path "./AutoSubs-App"
npm install
npm run tauri build
