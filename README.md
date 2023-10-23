# Davinci Resolve AI Subtitles
- Uses AI to generate Text+ subtitles with your own custom style.
- Works with both the **Free and Studio versions** of Resolve.
- Uses [`OpenAI Whisper`](https://openai.com/research/whisper) and [`Stable-TS`](https://github.com/jianfch/stable-ts) for **extremely accurate transcription**.
- This `Python` script transcribes your editing timeline using AI and uses the `Davinci Resolve API` + `Fusion API` to add each subtitle to the timeline in Text+ format with **custom styling**.
- The script is run through the `Scripts` menu within Resolve.

> :tv: **Video Tutorial:** https://youtu.be/--4vfAM9_tI <br>
> :tea: **Contact me here:** [https://discord.gg/hskJ593gk](https://discord.gg/qB3tTACW9)

UI Preview             |  Subtitle Example
:-------------------------:|:-------------------------:
![image](https://github.com/tmoroney/auto-subs/assets/72154813/2aa582c6-fa72-4392-9619-822d2fe6592e) |  <img alt="Subtitle Example" src="https://github.com/tmoroney/auto-subs/assets/72154813/28553dc3-bd4f-4866-9083-1df5cd21aeaf" width="650">

## Setup

### Step 1: Install Python + Whisper
Choose **one** of these options. Click here if you need help.
- **Automatic Install (only for Windows):** <br> 
Download this PowerShell script [`whisper.ps1`](https://github.com/tmoroney/auto-subs/blob/main/whisper.ps1) (Click **`Download Raw File`** in the top right). Open `Powershell` in **administrator mode** and run the command below - the location of the `whisper.ps1` file doesn't matter.
Running this command will install `Python` (if not already installed) + `OpenAI Whisper` and all of its dependencies ([video explainer](https://youtu.be/R5pZPpIIUzA)). 

        iex (irm whisper.tc.ht)

- **Manual Install (for Mac, Linux and Windows):** <br>
Install Python version `3.10` or less from [here](https://www.python.org/downloads/release/python-31011/). Make sure to tick `set environment variables` or `Add python.exe to PATH` during installation on Windows. Then you need to follow this [installation guide](https://github.com/openai/whisper/tree/main#readme) to install Whisper and its dependencies.
    > **Warning**
    Only compatible with Python 3.8 - 3.11

### Step 2: Install Stable-TS
Modifies OpenAI Whisper for more accurate timestamps.

    pip install -U git+https://github.com/jianfch/stable-ts.git

### Step 3: Fix audio backend (may not be needed)
    
    # on Windows
    pip install soundfile 
    
    # on Linux
    pip install sox
    
### Step 4: Download the Script
Download [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py), then add it to the `Utility` folder within the Fusion `Scripts` folder. The directory should look like this:
  
    ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility

### Step 5: Run the Script
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
