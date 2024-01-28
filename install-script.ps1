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

# Step 1: Install Chocolatey
Write-Host "Installing Chocolatey..."
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Step 2: Check the installed Python version
$pythonInstalled = Get-Command python -ErrorAction SilentlyContinue

if ($pythonInstalled) {
    # Get the Python version
    $commandNames = @('py', 'python', 'python3') # Possible command names

    # Iterate over the command names
    foreach ($commandName in $commandNames) {
        # Try to get the Python version
        $pythonVersionOutput = & $commandName --version 2>&1
        if ($pythonVersionOutput -and $pythonVersionOutput -notmatch 'not recognized') {
            # If the command worked, split the output to get the version number
            $versionParts = $pythonVersionOutput.Split(' ')[1].Split('.')
            $pythonVersion = [double]"$($versionParts[0]).$($versionParts[1])"
            Write-Host "Python version $pythonVersion is already installed."
            break
        }
    }

    if ($pythonVersion -lt 3.8 -or $pythonVersion -gt 3.11) {
        Write-Host "Python version is outside the range 3.8 to 3.11. Installing Python 3.11..."
        # Install Python 3.11 if the version is outside the range
        choco install python --version 3.11 -y
        # Add Python to system environment variables
        $pythonPath = "C:\Python311\;C:\Python311\Scripts\"
        [System.Environment]::SetEnvironmentVariable('Path', "$($env:Path);$pythonPath", [System.EnvironmentVariableTarget]::Machine)
        # Refresh the environment variables in the current session
        $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine')
    }
}
else {
    Write-Host "Python is not installed. Installing Python 3.11..."
    # Install Python 3.11 if not already installed
    choco install python --version 3.11 -y
    # Add Python to system environment variables
    $pythonPath = "C:\Python311\;C:\Python311\Scripts\"
    [System.Environment]::SetEnvironmentVariable('Path', "$($env:Path);$pythonPath", [System.EnvironmentVariableTarget]::Machine)
    # Refresh the environment variables in the current session
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine')
}

# Step 3: Install FFMPEG using Chocolatey if not already installed
$ffmpegInstalled = Get-Command ffmpeg -ErrorAction SilentlyContinue

if (-not $ffmpegInstalled) {
    Write-Host "Installing FFMPEG..."
    choco install ffmpeg -y
}

# Step 4: Install OpenAI Whisper
Write-Host "Installing OpenAI Whisper..."
pip install -U openai-whisper

# Step 5: Install Stable-ts
Write-Host "Installing Stable-ts (improves quality of subtitles)..."
pip install -U stable-ts

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
