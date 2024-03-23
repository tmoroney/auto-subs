#MIT License
#
#Copyright (c) 2023 Tom Moroney
#
#Permission is hereby granted, free of charge, to any person obtaining a copy
#of this software and associated documentation files (the "Software"), to deal
#in the Software without restriction, including without limitation the rights
#to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
#copies of the Software, and to permit persons to whom the Software is
#furnished to do so, subject to the following conditions:
#
#The above copyright notice and this permission notice shall be included in all
#copies or substantial portions of the Software.
#
#THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
#IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
#FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
#AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
#LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
#OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
#SOFTWARE.

# Check if the current user has administrative privileges
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "Please open Powershell as Administor to run this script - requires administrative privileges." -ForegroundColor Red
    exit
}

Write-Host "Script executed with administrative privileges. Proceeding with installation."

# Step 1: Check the installed Python version
$pythonInstalled = Get-Command python -ErrorAction SilentlyContinue
$pythonVersion = 0

if ($pythonInstalled) {
    # Get the Python version
    $commandNames = @('py', 'python', 'python3') # Possible command names

    # Iterate over the command names
    foreach ($commandName in $commandNames) {
        # Check if the command exists
        if (Get-Command $commandName -ErrorAction SilentlyContinue) {
            # Try to get the Python version
            $pythonVersionOutput = & $commandName --version 2>&1
            if ($pythonVersionOutput -match 'Python (\d+)\.(\d+)') {
                $majorVersion = [int]$Matches[1]
                $minorVersion = [int]$Matches[2]
                if ($majorVersion -lt 3 -or ($majorVersion -eq 3 -and $minorVersion -lt 8)) {
                    Write-Host "Python version must be greater than 3.8." -ForegroundColor Red
                    Write-Host "Please install the latest version of Python (3.12.2 is verified to work)"
                    Write-Host "https://www.python.org/downloads/" -ForegroundColor Green
                    exit
                } else {
                    Write-Host "Python version $majorVersion.$minorVersion is already installed."
                }
                break
            }
        }
    }
}
else {
    Write-Host "Python is not installed. Please install the latest version of Python"
    Write-Host " (3.12.2 is verified to work) - " -NoNewline
    Write-Host "https://www.python.org/downloads/" -ForegroundColor Green
}

# Step 2: Install Chocolatey
Write-Host "Installing Chocolatey..."
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Step 3: Install FFMPEG using Chocolatey if not already installed
$ffmpegInstalled = Get-Command ffmpeg -ErrorAction SilentlyContinue

if (-not $ffmpegInstalled) {
    Write-Host "Installing FFMPEG..."
    choco install ffmpeg -y
}

# Step 4: Install OpenAI Whisper
Write-Host "Installing OpenAI Whisper..."
try {
    pip install -U openai-whisper
} catch {
    Write-Host "Failed to install OpenAI Whisper using pip. Trying pip3..."
    pip3 install -U openai-whisper
}

# Step 5: Install Stable-ts
Write-Host "Installing Stable-ts (improves quality of subtitles)..."
try {
    pip install -U stable-ts
} catch {
    Write-Host "Failed to install Stable-ts using pip. Trying pip3..."
    pip3 install -U stable-ts
}

# Step 6: Download auto-subs.py and place it in the specified folder
Write-Host "Downloading auto-subs.py..."
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
    Write-Host "Installation complete."
} catch {
    Write-Host "Failed to download auto-subs.py: $_"
}
