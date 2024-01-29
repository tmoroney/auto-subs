# Davinci Resolve AI Subtitles
Automatically transcribes your editing timeline using [`OpenAI Whisper`](https://openai.com/research/whisper) and [`Stable-TS`](https://github.com/jianfch/stable-ts) for extreme accuracy.
- Generate subtitles in your own **custom style**.
- **Completely free** and runs locally within Davinci Resolve.
- Works on Mac, Linux, and Windows.
- Supported on both **Free** and **Studio** versions of Resolve.
- **NEW!! -** Navigate through subtitles using the built-in viewer + jump to position on the timeline.

> :tv: **Video Tutorial:** [Youtube Video (slightly outdated)](https://youtu.be/--4vfAM9_tI) <br>
> :tea: **Contact me here:** [Join my Discord](https://discord.com/invite/TBFUfGWegm)


## Table of Contents
#### 1. [📋 Usage Guide](#usage-guide)
#### 2. [📡 Automatic Setup (Windows Only - Recommended)](#automatic-setup)
#### 3. [🛠️ Manual Setup (Mac, Linux, Windows)](#manual-setup)
#### 4. [📜 Light Version (just custom styled subtitles - No audio transcription)](#light-version)
#### 5. [❓ Help me](#help)

<br/>

Basic to Advanced Options + Subtitle Navigator             |  Subtitle Example
:-------------------------:|:-------------------------:
<img alt="Subtitle Example" src="https://github.com/tmoroney/auto-subs/assets/72154813/88cdfba8-b3b3-4e5c-b349-1be0edf08755" width="1400">  |  <img alt="Subtitle Example" src="https://github.com/tmoroney/auto-subs/assets/72154813/a2b06385-672b-400d-9c14-ba0a4def1625" width="650">

## Usage Guide
1. **Open Auto-Subs:** Click on `Workspace` in Resolve's top menu bar, then within `Scripts` select `auto-subs` from the list.

       Workspace -> Scripts -> auto-subs

2. **Create your Template:** Add a `Text+` to the timeline, customise to your liking, then drag it into the `Media Pool`. This will be used as the template for your subtitles.
3. **Select area to add subtitles:** Add a `Yellow` marker at the `Start` + `End` of the area to subtitle -> **`"Add In/Out Marker"`** button.
4. **Run:** Click **`"Generate Subtitles"`** to transcribe the selected timeline area.

## Automatic Setup
> [!NOTE] 
> **Automatic setup only works on Windows** - This will run a PowerShell script which installs Python (if not already installed), Whisper, FFMPEG, and Stable-TS.
> It also places the `auto-subs.py` file in the Fusion scripts folder so it can be accessed within Resolve.
1. Open PowerShell in **administrator mode**.
2. Copy this command into Powershell + Run it by hitting the enter key.

       Invoke-Expression (Invoke-WebRequest -Uri "https://raw.githubusercontent.com/tmoroney/auto-subs/main/install-script.ps1").Content
3. Once finished running, the setup is complete!

## Manual Setup
### Summary:
1. Install [`Python 3.8 - 3.11`](https://www.python.org/downloads/)
2. Install [`OpenAI Whisper`](https://github.com/openai/whisper) + [`FFMPEG`](https://ffmpeg.org/)
3. Install [`Stable-TS`](https://github.com/jianfch/stable-ts) (improves subtitles)
4. Download + copy [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) to Fusion Scripts folder.

### Setup Guides:
<details>
<summary>Windows Setup</summary>
       
### Step 1: Install Python
Download `Python 3.8 - 3.11` from [python.org](https://www.python.org/downloads/) and run the installer. Make sure to tick `"Add python.exe to PATH"` during installation.
> If you are having issues, ensure that `Path` in your system environment variables contains `C:\Python311\` and `C:\Python311\Scripts\`.

### Step 2: Install Whisper
From the [Whisper setup guide](https://github.com/openai/whisper/tree/main#readme) - Run the following command to install OpenAI Whisper for your OS.
    
    pip install -U openai-whisper

Then install [FFMPEG](https://ffmpeg.org/) using your preferred method (needed for audio processing). I recommend using a package manager to install FFMPEG as the process can be quite confusing otherwise:

    # on Windows using Chocolatey (https://chocolatey.org/install)
    choco install ffmpeg

    # on Windows using Scoop (https://scoop.sh/)
    scoop install ffmpeg

### Step 3: Install Stable-TS
Install Stable-TS by running this command in the terminal:

    pip install -U stable-ts

### Step 4: Download the Python Script
Download the [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) file. Copy this file to the `Utility` folder within the Fusion `Scripts` folder. The directory should look like this:
  
    ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility

This directory can usually be found inside `C:\ProgramData\`.
</details>

<details>
<summary>MacOS Setup</summary>

### Open the terminal and run the following commands...
1. Install [Homebrew](https://brew.sh/) package manager:

       /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

2. Install Python:

       brew install python

3. Install [FFMPEG](https://ffmpeg.org/) (used by Whisper for audio processing):

       brew install ffmpeg

4. Install OpenAI Whisper:

       pip install -U openai-whisper

5. Install Stable-TS:

       pip install -U stable-ts

6. Download [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) (click **"Download Raw File"**) and copy it to `Fusion` -> `Scripts` -> **`Utility`**.
The directory should look like this:
  
       ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility


</details>


## Light Version
> [!WARNING]
> Possibly broken - not updated in a long time. Will fix soon.

A simplified version with **no audio transcription**. No external libraries are needed. Generates subtitles on the timeline in your custom style from **a given SRT file**.
  1. Install any version of [Python](https://www.python.org/downloads/) (tick `"Add python.exe to PATH"` during install)
  2. Download **[`auto-subs-light.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs-light.py)** and place it in the `Utility` folder of the Fusion Scripts folder.

         ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility

## Help
1. **Auto-Subs not opening:** Verify that Resolve detects your Python installation by opening the Console from the top menu/toolbar in Resolve and clicking `py3` at the top of the console.
2. **Can't find Fusion folder:** Use [Everything](https://www.voidtools.com/) to quickly search your computer for it (Windows only).
3. Check Python version being used by Resolve: `import sys` + `print (sys.version)` in the Resolve console.
4. Video Tutorial: https://youtu.be/--4vfAM9_tI
5. Contact me here: https://discord.com/invite/TBFUfGWegm
6. If you encounter issues installing OpenAI Whisper, [this video](https://youtu.be/ABFqbY_rmEk) may help you (Only the first 6 minutes are necessary).

If you wish to create your own Python script for Davinci Resolve, **DON'T**. It's not worth it, the documentation is hell and I was literally working off scraps for this project.
