# Copyright (C) 2023 TroubleChute (Wesley Pyburn)
# Licensed under the GNU General Public License v3.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.gnu.org/licenses/gpl-3.0.en.html
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#    
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#    
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <https://www.gnu.org/licenses/>.
#
# ----------------------------------------
# This script:
# 1. Installs Chocolatey (for installing Python and FFMPEG) - https://chocolatey.org/install
# 2. Check if Conda or Python is installed. If neither: install Python using Choco (if Python not already detected)
# 3. Installs FFMPEG using Choco (if FFMPEG not already detected)
# 4. Install CUDA using Choco (if CUDA not already detected)
# 5. Install Pytorch if not already installed, or update. Installs either GPU version if CUDA found, or CPU-only version
# 6. Verify that Whisper is installed. Reinstall using another method if not.
# ----------------------------------------

Write-Host "--------------------------------------------" -ForegroundColor Cyan
Write-Host "Welcome to TroubleChute's Whisper installer!" -ForegroundColor Cyan
Write-Host "Whisper as well as all of its other dependencies should now be installed..." -ForegroundColor Cyan
Write-Host "[Version 2023-06-06]" -ForegroundColor Cyan
Write-Host "`nThis script is provided AS-IS without warranty of any kind. See https://tc.ht/privacy & https://tc.ht/terms."
Write-Host "Consider supporting these install scripts: https://tc.ht/support" -ForegroundColor Green
Write-Host "--------------------------------------------`n`n" -ForegroundColor Cyan

Set-Variable ProgressPreference SilentlyContinue # Remove annoying yellow progress bars when doing Invoke-WebRequest for this session

# 1. Install Chocolatey
Write-Host "`nInstalling Chocolatey..." -ForegroundColor Cyan
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Import function to reload without needing to re-open Powershell
iex (irm refreshenv.tc.ht)

# 2. Check if Conda or Python is installed
# Check if Conda is installed
Import-FunctionIfNotExists -Command Get-UseConda -ScriptUri "Get-Python.tc.ht"

# Check if Conda is installed
$condaFound = Get-UseConda -Name "Whisper" -EnvName "whisper" -PythonVersion "3.10.11"

# Get Python command (eg. python, python3) & Check for compatible version
if ($condaFound) {
    conda activate "whisper"
    $python = "python"
} else {
    $python = Get-Python -PythonRegex 'Python ([3].[1][0-1].[6-9]|3.10.1[0-1])' -PythonRegexExplanation "Python version is not between 3.10.6 and 3.10.11." -PythonInstallVersion "3.10.11" -ManualInstallGuide "https://hub.tcno.co/ai/whisper/install/"
    if ($python -eq "miniconda") {
        $python = "python"
        $condaFound = $true
    }
}


# 3. Install FFMPEG with Choco if not already installed.
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host "`nFFMPEG is not installed. Installing..." -ForegroundColor Cyan

    choco upgrade ffmpeg -y
    Update-SessionEnvironment
}

if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
    Write-Host "FFmpeg is installed." -ForegroundColor Green
}
else {
    Write-Host "FFmpeg is not installed. Please add FFMPEG to PATH (install ffmpeg) and run this script again." -ForegroundColor Red
    Write-Host "Alternatively, follow this guide for manual installation: https://hub.tcno.co/ai/whisper/install/" -ForegroundColor Red
    Read-Host "Process can not continue. The program will exit when you press Enter to continue..."
    Exit
}

iex (irm Import-RemoteFunction.tc.ht)
# 4. Install CUDA using Choco if not already installed.
if ((Get-CimInstance Win32_VideoController).Name -like "*Nvidia*") {
    Import-FunctionIfNotExists -Command Install-CudaAndcuDNN -ScriptUri "Install-Cuda.tc.ht"
    Install-CudaAndcuDNN -CudaVersion "11.8" -CudnnOptional $true
    
    # 5. Install Pytorch if not already installed, or update.
    Write-Host "`nInstalling or updating PyTorch (With GPU support)..." -ForegroundColor Cyan
    if ($condaFound){
        conda install pytorch torchvision torchaudio pytorch-cuda=11.8 -c pytorch -c nvidia -y
    } else {
        &$python -m pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
    }
} else {
    Write-Host "Nvidia CUDA is not installed. Please install the latest Nvidia CUDA Toolkit and run this script again." -ForegroundColor Red
    Write-Host "For now the script will proceed with installing CPU-only PyTorch. Whisper will still run when it's done." -ForegroundColor Red
    
    # 5. Install Pytorch if not already installed, or update.
    Write-Host "`nInstalling or updating PyTorch (CPU-only)..." -ForegroundColor Cyan
    if ($condaFound) {
        conda install pytorch torchvision torchaudio cpuonly -c pytorch -y
    } else {
        &$python -m pip install torch torchvision torchaudio
    }
}


Write-Host "`nInstalling or updating Whisper..." -ForegroundColor Cyan
if ($condaFound) {
    # For some reason conda NEEDS to be deactivated and reactivated to use pip reliably... Otherwise python and pip are not found.
    conda deactivate
    #Open-Conda
    conda activate whisper
    pip install -U openai-whisper # Environment is already active
    pip install -U stable-ts # Add this line to install stable-ts
} else {
    &$python -m pip install -U openai-whisper
    &$python -m pip install -U stable-ts # Add this line to install stable-ts
    Update-SessionEnvironment
}

# 6. Verify that Whisper is installed. Reinstall using another method if not.
if (Get-Command whisper -ErrorAction SilentlyContinue) {
    Write-Host "`n`nWhisper is installed!" -ForegroundColor Green
    Write-Host "You can now use `whisper --help` for more information in this PowerShell window, CMD or another program!" -ForegroundColor Green
}
else {
    Write-Host "Whisper is not installed, trying again but this time installing from the openai/whisper GitHub repo" -ForegroundColor Green

    if ($condaFound){
        pip install -U setuptools-rust
        pip install git+https://github.com/openai/whisper.git
        pip install -U stable-ts # Add this line to install stable-ts
    } else {
        &$python -m pip install -U setuptools-rust
        &$python -m pip install -U --no-deps --force-reinstall git+https://github.com/openai/whisper.git
        &$python -m pip install -U stable-ts # Add this line to install stable-ts
    }

    if (Get-Command whisper -ErrorAction SilentlyContinue) {
        Write-Host "`n`nWhisper is installed!" -ForegroundColor Green
        Write-Host "You can now use whisper --help for more information in this PowerShell window, CMD or another program!" -ForegroundColor Green
    } else {
        Write-Host "`n`nWhisper is not installed. Please follow this guide for manual installation: https://hub.tcno.co/ai/whisper/install/" -ForegroundColor Red
        Read-Host "Process can not continue. The program will exit when you press Enter to continue..."
    }
}