# Davinci Resolve AI Subtitles
Uses AI to generate Text+ subtitles with custom styling - works with both the **Free and Studio versions** of Resolve. This python script uses OpenAI Whisper to transcribe the current timeline, and then uses the Davinci Resolve and Fusion APIs to add each subtitle to the timeline in a Fusion Text+ object at the correct time. The script is run through the `Scripts` menu within Resolve.

UI Preview             |  Subtitle Example
:-------------------------:|:-------------------------:
![image](https://github.com/tmoroney/auto-subs/assets/72154813/03186165-73c2-476f-b0a2-56c01b601660) |  <img alt="Subtitle Example" src="https://github.com/tmoroney/auto-subs/assets/72154813/28553dc3-bd4f-4866-9083-1df5cd21aeaf" width="650">

## Running the Script

Click `Workspace` in the top menu bar. Then click `Scripts` and select `auto-subs` from the list.

## Setup

#### Video Tutorial: https://youtu.be/--4vfAM9_tI
#### Contact me here: https://discord.gg/hskJ593gk

### Setup Overview:
1. Install Python `3.10` + OpenAI Whisper (download script + 1 line in terminal)
2. Install Stable-TS (1 line in terminal)
3. Fix audio backend (1 line in terminal)
4. Add `AutoSubs.py` file to Fusion Scripts folder (simple drag and drop)
5. Run the script by navigating to `Workspace -> Scripts -> auto-subs` in the top menu of Resolve.

#### Important Notes:
- **Only Python `3.10` or less supported** (Version `3.10.11` works for me - any later version is not supported by [`OpenAI Whisper`](https://github.com/openai/whisper)
- The included powershell script will ensure that the correct Python version is installed. If installing Python yourself, make sure to tick `set envirement variables` or `Add python.exe to PATH` during installation so that Davinci Resolve knows where to find the Python interpreter.
- **Verify that Resolve detects the python installation by opening the Console and clicking `py3` at the top.**

### Step 1 (automatic install - only Windows): Install Python + Whisper
Download this script [`whisper.ps1`](https://github.com/tmoroney/auto-subs/blob/main/whisper.ps1) by clicking **Download Raw File** in the top right (This [video](https://youtu.be/R5pZPpIIUzA) explains what it does). This script will install Python (if not already installed) and [`OpenAI Whisper`](https://github.com/openai/whisper) + all of it's dependencies. To run it, open Powershell in `administrator mode` and run the following command. Alternatively you can install Python and Whisper manually below.

    iex (irm whisper.tc.ht)

### Step 1 (manual install - Mac, Linux and Windows): Install Python + Whisper
Install [Python](https://www.python.org/downloads/release/python-31011/) version `3.10` or less. Then you need to follow this [installation guide](https://github.com/openai/whisper/tree/main#readme) to install Whisper and it's dependencies.

### Step 2: Install Stable-TS
[`Stable-TS`](https://github.com/jianfch/stable-ts) modifies Whisper for more accurate timestamps.

    pip install -U git+https://github.com/jianfch/stable-ts.git

### Step 3: Fix audio backend (may not be needed)
    
    # on Windows
    pip install soundfile 
    
    # on Linux
    pip install sox
    
### Step 4: Download the Script
Download [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) from the GitHub repo (**download raw file**) and drag it into the `Utility` folder within the Fusion `Scripts` folder. There may be multiple fusion scripts folders, but any of them will do. The directory will look like this:
  
    ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility

### Step 5: Run the Script
You can now run the script in Davinci Resolve by clicking `Workspace` in the top menu bar, then `Scripts`, and you should see `auto-subs` in the list here.
    
    Workspace -> Scripts -> auto-subs

## Help
If you have any issues installing Whisper, [this video](https://youtu.be/ABFqbY_rmEk) may help you (Only the first 6 minutes is necessary).

If you want to make your own python script for Davinci Resolve, DON'T. It's not worth it, the documentation is literally hell.
