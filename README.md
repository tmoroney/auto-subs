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

## How To Use
1. Open from Resolve toolbar: `Workspace -> Scripts -> auto-subs`.
2. Add a **`timeline marker`** (must be blue) at the **`start`** and **`end`** of the segment to subtitle.
3. Click the **`Generate Subtitles`** button.

## Setup

### Step 1: Install Dependencies (Python, Whisper, Stable-TS)
**Automatic Install (only for Windows):** <br> 
1. Download [`whisper.ps1`](https://github.com/tmoroney/auto-subs/blob/main/whisper.ps1) (top right - **Download Raw File** button).
2. Open `Powershell` in **administrator mode** and run the command below - the location of the `whisper.ps1` file doesn't matter. Running this command will install `Python` (if not already installed) + `OpenAI Whisper` and all of its dependencies ([video explainer](https://youtu.be/R5pZPpIIUzA)). 

        iex (irm whisper.tc.ht)

**Manual Install (for Mac, Linux and Windows):** <br>
1. Download `Python < 3.11` from [python.org](https://www.python.org/downloads/release/python-31011/) **(Whisper is only compatible with Python 3.8 - 3.11)**.
    > ⚠️ Ensure that **`Add python.exe to PATH`** or **`Set environment variables`** is selected during installation on Windows.
4. Install OpenAI Whisper by following the [short installation guide](https://github.com/openai/whisper/tree/main#readme).
5. Install Stable-TS by running this command in the terminal:

        pip install -U stable-ts
    
### Step 3: Download the Script
Download the [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) file. Copy to the `Utility` folder within the Fusion `Scripts` folder. The directory should look like this:
  
        ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility

### Step 4: Run the Script
Click `Workspace` in the top menu bar of Davinci Resolve, then click `Scripts`, and there you should see `auto-subs` in the list.
    
    Workspace -> Scripts -> auto-subs

## Light Version (standalone - no audio transcription)
- Simplified version with **no audio transcription** - no external libraries needed.
- Generates subtitles on the timeline in your own custom style - **given an SRT file**.
- **Skip steps 1-3 of the installation guide**.
- Download **[`auto-subs-light.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs-light.py)** instead of `auto-subs.py`.

## Help
1. You can verify that Resolve detects your Python installation by opening the Console from the top menu/toolbar in Resolve and clicking `py3` at the top of the console.
2. Video Tutorial: https://youtu.be/--4vfAM9_tI
3. Contact me here: https://discord.gg/hskJ593gk
4. If you encounter issues installing OpenAI Whisper, [this video](https://youtu.be/ABFqbY_rmEk) may help you (Only the first 6 minutes are necessary).

If you wish to create your own Python script for Davinci Resolve, **DON'T**. It's not worth it, the documentation is literally hell.

## Setup Overview
1. Install Python `3.10` + [`OpenAI Whisper`](https://github.com/openai/whisper) (single command using PowerShell script)
2. Install [`Stable-TS`](https://github.com/jianfch/stable-ts) (single command)
3. Fix audio backend (single command)
4. Download + copy [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) to Fusion Scripts folder.
5. Navigate to `Workspace -> Scripts -> auto-subs` in the top menu of Resolve.
