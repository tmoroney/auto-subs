Write-Host "Downloading latest version of auto-subs.py..."
$downloadUrl = "https://raw.githubusercontent.com/tmoroney/auto-subs/main/auto-subs.py"
$destinationFolder = "$env:ProgramData\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility"
$destinationFile = "$destinationFolder\auto-subs.py"

# If the file already exists, delete it
if (Test-Path -Path $destinationFile) {
    Remove-Item -Path $destinationFile -Force
}

# if the folder doesn't exist, create it
if (-not (Test-Path -Path $destinationFolder)) {
    New-Item -Path $destinationFolder -ItemType Directory
}

# Download the file and move it to the destination folder
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $destinationFile
    Write-Host "auto-subs.py downloaded successfully."
    Write-Host "Placed in directory - $destinationFolder"
    Write-Host "You can now access the script in DaVinci Resolve from Workspace -> Scripts in the top menu." -ForegroundColor Green
} catch {
    Write-Host "Failed to download auto-subs.py: $_"
}