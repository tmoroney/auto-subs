# Davinci Resolve AI Subtitles
Uses AI to generate Text+ subtitles with custom styling - works with both the **Free and Studio versions** of Resolve. This python script uses OpenAI Whisper to transcribe the current timeline, and then uses the Davinci Resolve and Fusion APIs to add each subtitle to the timeline in a Fusion Text+ object at the correct time. The script is run through the `Scripts` menu within Resolve.

UI Preview             |  Subtitle Example
:-------------------------:|:-------------------------:
![image](https://github.com/tmoroney/auto-subs/assets/72154813/03186165-73c2-476f-b0a2-56c01b601660) |  <img alt="Subtitle Example" src="https://github.com/tmoroney/auto-subs/assets/72154813/28553dc3-bd4f-4866-9083-1df5cd21aeaf" width="650">


## Running the Script

Click `Workspace` in the top menu bar. Then click `Scripts` and select `auto-subs` from the list.

## Prerequisites
- Python version `3.10` or less installed **(3.11 is not currently supported by Whisper)**
- Check Davinci Console that Python is working (click py3 button in console)
- If python is not working in Resolve, check that the system environment variables for python are set correctly so that Resolve knows where to find the python interpreter.

## Setup

**Step 1:** Download this script [`whisper.ps1`](https://github.com/TCNOco/TcNo-TCHT/blob/main/PowerShell/AI/whisper.ps1) by clicking **Download Raw File** in the top right. This [video](https://youtu.be/R5pZPpIIUzA) explains what it does.

**Step 2:** Open powershell in administrator mode and run the following command. This installs [`OpenAI Whisper`](https://github.com/openai/whisper) and all of it's dependencies. For Mac and Linux, you will need to follow the [Whisper installation guide](https://github.com/openai/whisper/tree/main#readme) to set it up.

    iex (irm whisper.tc.ht)

**Step 3:** Install [`Stable-TS`](https://github.com/jianfch/stable-ts) (modifies Whisper for more accurate timestamps)

    pip install -U git+https://github.com/jianfch/stable-ts.git

**Step 4:** Fix audio backend
    
    # on Windows
    pip install soundfile 
    
    # on Linux
    pip install sox
    
**Step 5:** Download the [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) file (**download raw file**) and drag it into the `Utility` folder within the Fusion `Scripts` folder. There may be multiple fusion scripts folders, but any of them will do. The directory will look like this:
  
    ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility

Once the python script has been placed in the correct directory, it should show up in the `scripts` menu within the `Workspace` dropdown in the top menu of Resolve.
   
