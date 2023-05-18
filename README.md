# Davinci Resolve AI Subtitles
Uses AI to generate Text+ subtitles with custom styling - works with both the **Free and Studio versions** of Resolve. This python script uses OpenAI Whisper to transcribe the current timeline, and then uses the Davinci Resolve and Fusion APIs to add each subtitle to the timeline in a Fusion Text+ object at the correct time. The script is run through the `Scripts` menu within Resolve.

UI Preview             |  Subtitle Example
:-------------------------:|:-------------------------:
![image](https://github.com/tmoroney/auto-subs/assets/72154813/03186165-73c2-476f-b0a2-56c01b601660) |  <img alt="Subtitle Example" src="https://github.com/tmoroney/auto-subs/assets/72154813/28553dc3-bd4f-4866-9083-1df5cd21aeaf" width="650">


## Running the Script

Click `Workspace` in the top menu bar. Then click `Scripts` and select `auto-subs` from the list.

## Setup

#### Important Notes:
- Python version `3.10` or less is necessary for Auto Subs to work. Anything above this is not currently supported by [`OpenAI Whisper`](https://github.com/openai/whisper). Version `3.10.11` works for me.
- The powershell script below will ensure that the correct python version is installed. However, if you are installing Python yourself using the Python installer on Windows, make sure to tick `set envirement variables` during installation so that Davinci Resolve knows where to find the python interpreter.
- Verify that Resolve detects the python installation by opening the Console and clicking `py3` at the top.

### Step 1: Installing Whisper (on Windows)
Download this script [`whisper.ps1`](https://github.com/tmoroney/auto-subs/blob/main/whisper.ps1) by clicking **Download Raw File** in the top right (This [video](https://youtu.be/R5pZPpIIUzA) explains what it does). Open powershell in administrator mode and run the following command. This installs [`OpenAI Whisper`](https://github.com/openai/whisper) and all of it's dependencies.

    iex (irm whisper.tc.ht)

### Step 1: Installing Whisper (on Mac and Linux)
Make sure that you have [Python](https://www.python.org/downloads/release/python-31011/) version `3.10` or less installed. Then you need to follow this [installation guide](https://github.com/openai/whisper/tree/main#readme) to install Whisper and it's dependencies.

### Step 2: Install Stable-TS
[`Stable-TS`](https://github.com/jianfch/stable-ts) modifies Whisper for more accurate timestamps

    pip install -U git+https://github.com/jianfch/stable-ts.git

### Step 3: Fix audio backend
    
    # on Windows
    pip install soundfile 
    
    # on Linux
    pip install sox
    
### Step 4: Script Download + Setup
Download the [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) file (**download raw file**) and drag it into the `Utility` folder within the Fusion `Scripts` folder. There may be multiple fusion scripts folders, but any of them will do. The directory will look like this:
  
    ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility

### Step 5: Running the Script
You can now run the script by clicking `Workspace` in the top menu bar, then `Scripts`, and you should see `auto-subs` in the list here.
    
    Workspace -> Scripts -> auto-subs

## Help
If you have any issues installing Whisper, [this video](https://youtu.be/ABFqbY_rmEk) may help you (Only the first 6 minutes is necessary).

If you want to make your own python script for Davinci Resolve, DON'T. It's not worth it, the documentation is literally hell.
