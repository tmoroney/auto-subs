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

Write-Host "Welcome to TroubleChute's Whisper installer!" -ForegroundColor Cyan
Write-Host "Whisper as well as all of its other dependencies should now be installed..." -ForegroundColor Cyan
Write-Host "[Version 2023-04-14]`n`n" -ForegroundColor Cyan

# 1. Install Chocolatey
Write-Host "`nInstalling Chocolatey..." -ForegroundColor Cyan
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Import function to reload without needing to re-open Powershell
iex (irm refreshenv.tc.ht)

# 2. Check if Conda or Python is installed
# Check if Conda is installed
$condaFound = Get-Command conda -ErrorAction SilentlyContinue
if (-not $condaFound) {
    # Try checking if conda is installed a little deeper... (May not always be activated for user)
    # Allow importing remote functions
    iex (irm Get-CondaPath.tc.ht)
    $condaFound = Open-Conda # This checks for Conda, returns true if conda is hoooked
    Update-SessionEnvironment
}


# If conda found: create environment
if ($condaFound) {
    Write-Host "`n`nDo you want to install Whisper in a Conda environment called 'whisper'?`nYou'll need to use 'conda activate whisper' before being able to use it?"-ForegroundColor Cyan
    Write-Host -ForegroundColor Cyan -NoNewline "`n`nUse Conda? (y/n): "
    $installWhisper = Read-Host
    if ($installWhisper -eq "y" -or $installWhisper -eq "Y") {
        conda create -n whisper python=3.10 pip -y
        conda activate whisper
    } else {
        $condaFound = $false
        Write-Host "Checking for Python instead..."
    }
}

$python = "python"
if (-not ($condaFound)) {
    # Try Python instead
    # Check if Python returns anything (is installed - also between 3.9.9 & 3.10.10)
    Try {
        $pythonVersion = python --version 2>&1
        if ($pythonVersion -match 'Python (3.(8|9|10).\d*)') {
            Write-Host "Python version $($matches[1]) is installed." -ForegroundColor Green
        }
    }
    Catch {
        Write-Host "Python is not installed." -ForegroundColor Yellow
        Write-Host "`nInstalling Python 3.10.10." -ForegroundColor Cyan
        choco install python --version=3.10.10 -y
        Update-SessionEnvironment
    }

    # Verify Python install
    Try {
        $pythonVersion = &$python --version 2>&1
        if ($pythonVersion -match 'Python (3.(8|9|10).\d*)') {
            Write-Host "Python version $($matches[1]) is installed." -ForegroundColor Green
        }
        else {
            Write-Host "Python version is not between 3.8 and 3.10." -ForegroundColor Yellow
            Write-Host "Assuming you've installed the correct version, please enter the comand you use to access Python 3.8/3.10." -ForegroundColor Yellow
            Write-Host "Otherwise enter python to continue anyway." -ForegroundColor Yellow
        
            $pythonProgramName = Read-Host "Enter the Python program name (e.g. python, python3, python310)"
            $pythonVersion = &$pythonProgramName --version 2>&1
            if ($pythonVersion -match 'Python (3\.(8|9|10)\.\d*)') {
                Write-Host "Python version $($matches[1]) is installed."
                $python = $pythonProgramName
            } else {
                if ($pythonProgramName -eq "python") {
                    Write-Host "`n`"python`" entered. Ignoring version and attempting to continue anyway." -ForegroundColor Yellow
                } else {
                    Write-Host "Python version is not between 3.8 and 3.10."
                    Write-Host "Alternatively, follow this guide for manual installation: https://hub.tcno.co/ai/whisper/install/" -ForegroundColor Red
                    Read-Host "Process can try to continue, but will likely fail. Press Enter to continue..."
                }
            }
        }
    }
    Catch {
        Write-Host "Python version is not between 3.8 and 3.10."
        Write-Host "Alternatively, follow this guide for manual installation: https://hub.tcno.co/ai/whisper/install/" -ForegroundColor Red
        Read-Host "Process can try to continue, but will likely fail. Press Enter to continue..."
    }
}

# 3. Install FFMPEG with Choco if not already installed.
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host "`nFFMPEG is not installed. Installing..." -ForegroundColor Cyan

    choco install ffmpeg -y
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

# 4. Install CUDA using Choco if not already installed.
try {
    $nvidiaSmiOutput = & nvidia-smi
    if ($LASTEXITCODE -eq 0) {
        if ($nvidiaSmiOutput -match "NVIDIA-SMI") {
            # Nvidia CUDA can be installed.

            # Check if CUDA is already installed
            if (-not (Get-Command nvcc -ErrorAction SilentlyContinue)) {
                Write-Host "`nCUDA is not installed. Installing..." -ForegroundColor Cyan
            
                choco install cuda -y
                Update-SessionEnvironment
            }
        }
    }
}
catch {
    Write-Host "An error occurred while checking for NVIDIA graphics card." -ForegroundColor Red
}

if (Get-Command nvcc -ErrorAction SilentlyContinue) {
    Write-Host "Nvidia CUDA installed." -ForegroundColor Green

    # 5. Install Pytorch if not already installed, or update.
    Write-Host "`nInstalling or updating PyTorch (With GPU support)..." -ForegroundColor Cyan
    if ($condaFound){
        conda install pytorch torchvision torchaudio pytorch-cuda=11.8 -c pytorch -c nvidia -y
    } else {
        &$python -m pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
    }
}
else {
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
} else {
    &$python -m pip install -U openai-whisper
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
    } else {
        &$python -m pip install -U setuptools-rust
        &$python -m pip install -U --no-deps --force-reinstall git+https://github.com/openai/whisper.git
    }

    if (Get-Command whisper -ErrorAction SilentlyContinue) {
        Write-Host "`n`nWhisper is installed!" -ForegroundColor Green
        Write-Host "You can now use whisper --help for more information in this PowerShell window, CMD or another program!" -ForegroundColor Green
    } else {
        Write-Host "`n`nWhisper is not installed. Please follow this guide for manual installation: https://hub.tcno.co/ai/whisper/install/" -ForegroundColor Red
        Read-Host "Process can not continue. The program will exit when you press Enter to continue..."
    }
}
