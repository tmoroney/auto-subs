# Step 1: Install Chocolatey
Write-Host "Installing Chocolatey..."
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Step 2: Check the installed Python version
$pythonInstalled = Get-Command python -ErrorAction SilentlyContinue

if ($pythonInstalled) {
    Write-Host "Python $($pythonInstalled.Version.Major) is installed."
    $pythonVersion = $pythonInstalled.Version.Major
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
