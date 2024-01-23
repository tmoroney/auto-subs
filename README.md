# Davinci Resolve AI Subtitles
- Generate subtitles in a **custom style**.
- Supports **Free** and **Studio** versions of Resolve.
- Automatically transcribes your editing timeline using a combination of [`OpenAI Whisper`](https://openai.com/research/whisper) and [`Stable-TS`](https://github.com/jianfch/stable-ts) for extreme accuracy.
- Easily run through the `Scripts` menu within Resolve.

> :tv: **Video Tutorial:** https://youtu.be/--4vfAM9_tI <br>
> :tea: **Contact me here:** [https://discord.gg/mNt4X6TrA3](https://discord.gg/mNt4X6TrA3)

UI Preview             |  Subtitle Example
:-------------------------:|:-------------------------:
![image](https://github.com/tmoroney/auto-subs/assets/72154813/2aa582c6-fa72-4392-9619-822d2fe6592e) |  <img alt="Subtitle Example" src="https://github.com/tmoroney/auto-subs/assets/72154813/28553dc3-bd4f-4866-9083-1df5cd21aeaf" width="650">

## Usage Guide
1. Open the `Workspace` menu within Resolve's top bar, then within the `Scripts` dropdown, select `auto-subs`.

       Workspace -> Scripts -> auto-subs
   
3. Add a timeline marker **(must be blue)** at the **`start`** and **`end`** of the segment to add subtitles.
4. Click **`Generate Subtitles`** in the script UI.

## Automatic Setup (Windows only)
Open PowerShell in **administrator mode**. Copy this command into Powershell + Run it by hitting the enter key.

    Invoke-Expression (Invoke-WebRequest -Uri "https://raw.githubusercontent.com/tmoroney/auto-subs/main/install-script.ps1").Content
> [!NOTE] 
> This will run a PowerShell script which installs Python (if not already installed), Whisper, FFMPEG, and Stable-TS (improves subtitles).
> It also places the auto-subs.py file in the Fusion scripts folder so it can be accessed within Resolve.

## Manual Setup (Mac, Linux, Windows)
### Step 1: Install Python
Download `Python 3.8-3.11` from the [python.org](https://www.python.org/downloads/release/python-31011/) website and run the installer.
> [!WARNING] 
> During installation on Windows, make sure to tick **`"Add python.exe to PATH"`** or **`"Set environment variables"`**. <br/>
> Whisper is only compatible with Python 3.8 - 3.11.
### Step 2: Install Whisper
From the [Whisper setup guide](https://github.com/openai/whisper/tree/main#readme) - Run the following command to install OpenAI Whisper for your OS.
    
    pip install -U openai-whisper

Then choose one of the following to install FFMPEG:

    # on Ubuntu or Debian
    sudo apt update && sudo apt install ffmpeg

    # on Arch Linux
    sudo pacman -S ffmpeg

    # on MacOS using Homebrew (https://brew.sh/)
    brew install ffmpeg

    # on Windows using Chocolatey (https://chocolatey.org/)
    choco install ffmpeg

    # on Windows using Scoop (https://scoop.sh/)
    scoop install ffmpeg

### Step 3: Install Stable-TS
Install Stable-TS by running this command in the terminal:

    pip install -U stable-ts

### Step 4: Download the Python Script
Download the [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) file. Copy to the `Utility` folder within the Fusion `Scripts` folder. The directory should look like this:
  
    ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility

## Light Version (standalone - no audio transcription)
- Simplified version with **no audio transcription** - no external libraries needed.
- Generates subtitles on the timeline in your own custom style - **given an SRT file**.
- **Skip step 1 of the installation guide** (no dependencies are needed).
- Download **[`auto-subs-light.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs-light.py)** instead of `auto-subs.py`.

## Help
1. You can verify that Resolve detects your Python installation by opening the Console from the top menu/toolbar in Resolve and clicking `py3` at the top of the console.
2. Video Tutorial: https://youtu.be/--4vfAM9_tI
3. Contact me here: https://discord.gg/hskJ593gk
4. If you encounter issues installing OpenAI Whisper, [this video](https://youtu.be/ABFqbY_rmEk) may help you (Only the first 6 minutes are necessary).

If you wish to create your own Python script for Davinci Resolve, **DON'T**. It's not worth it, the documentation is literally hell.

## Summary of Setup
1. Install Python `3.10` + [`OpenAI Whisper`](https://github.com/openai/whisper) (single command using PowerShell script)
2. Install [`Stable-TS`](https://github.com/jianfch/stable-ts) (single command)
3. Fix audio backend (single command)
4. Download + copy [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) to Fusion Scripts folder.
5. Navigate to `Workspace -> Scripts -> auto-subs` in the top menu of Resolve.
