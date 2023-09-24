# Davinci Resolve AI Subtitles
- Uses AI to generate Text+ subtitles with your own custom style.
- Works with both the **Free and Studio versions** of Resolve.
- Uses [`OpenAI Whisper`](https://openai.com/research/whisper) and [`Stable-TS`](https://github.com/jianfch/stable-ts) for **extremely accurate transcription**.
- This is a `Python` script that transcribes the current timeline and uses the `Davinci Resolve API` and `Fusion API` to add each subtitle to the timeline in Fusion Text+ objects with custom styling.
- The script is run through the `Scripts` menu within Resolve.

#### Run the Script (top menu bar of Resolve): `Workspace -> Scripts -> auto-subs`
- **Video Tutorial:** https://youtu.be/--4vfAM9_tI
- **Contact me here:** https://discord.gg/hskJ593gk

## Setup Overview
1. Install Python `3.10` + [`OpenAI Whisper`](https://github.com/openai/whisper) (single command using PowerShell script)
2. Install [`Stable-TS`](https://github.com/jianfch/stable-ts) (single command)
3. Fix audio backend (single command)
4. Download + copy [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) to Fusion Scripts folder.
5. Navigate to `Workspace -> Scripts -> auto-subs` in the top menu of Resolve.

UI Preview             |  Subtitle Example
:-------------------------:|:-------------------------:
![image](https://github.com/tmoroney/auto-subs/assets/72154813/2aa582c6-fa72-4392-9619-822d2fe6592e) |  <img alt="Subtitle Example" src="https://github.com/tmoroney/auto-subs/assets/72154813/28553dc3-bd4f-4866-9083-1df5cd21aeaf" width="650">

## Light Version (standalone - no audio transcription)
- Simplified version with **no audio transcription** - no external libraries needed.
- Generates subtitles on the timeline in your own custom style - **given an SRT file**.
- **Skip steps 1-3 of the installation guide**.
- Download **[`auto-subs-light.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs-light.py)** instead of `auto-subs.py`.

## Important Notes
- **Only compatible with Python `3.8 - 3.11`** - verified working on `3.10.11`.
- Make sure to tick `set environment variables` or `Add python.exe to PATH` during manual Python installation on Windows so that Davinci Resolve can find the Python interpreter.
- The included Powershell script will set these environment variables automatically.
- Verify that Resolve detects the Python installation by opening the Console and clicking `py3` at the top.

## Installation Guide

### Step 1: Install Python + Whisper
#### `Automatic Install` only for Windows:
Download this script [`whisper.ps1`](https://github.com/tmoroney/auto-subs/blob/main/whisper.ps1) by clicking **Download Raw File** in the top right. This script will install Python (if not already installed) + [`OpenAI Whisper`](https://github.com/openai/whisper) and all of its dependencies. To run it, open Powershell in `administrator mode` and run the following command. **[About Script](https://youtu.be/R5pZPpIIUzA)**

    iex (irm whisper.tc.ht)

#### `Manual Install` for Mac, Linux and Windows:
Install [Python](https://www.python.org/downloads/release/python-31011/) version `3.10` or less - make sure to tick `set environment variables` or `Add python.exe to PATH` during installation on Windows. Then you need to follow this [installation guide](https://github.com/openai/whisper/tree/main#readme) to install Whisper and its dependencies.

### Step 2: Install Stable-TS
[`Stable-TS`](https://github.com/jianfch/stable-ts) modifies Whisper for more accurate timestamps.

    pip install -U git+https://github.com/jianfch/stable-ts.git

### Step 3: Fix audio backend (may not be needed)
    
    # on Windows
    pip install soundfile 
    
    # on Linux
    pip install sox
    
### Step 4: Download the Script
Download [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) (top right), and drag it into the `Utility` folder within the Fusion `Scripts` folder. The directory should look like this:
  
    ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility

### Step 5: Run the Script
Click `Workspace` in the top menu bar of Davinci Resolve, then click `Scripts`, and there you should see `auto-subs` in the list.
    
    Workspace -> Scripts -> auto-subs

## Help
#### Video Tutorial: https://youtu.be/--4vfAM9_tI
#### Contact me here: https://discord.gg/hskJ593gk
If you encounter issues installing OpenAI Whisper, [this video](https://youtu.be/ABFqbY_rmEk) may help you (Only the first 6 minutes are necessary).

If you want to make your own Python script for Davinci Resolve, **DON'T**. It's not worth it, the documentation is literally hell.
