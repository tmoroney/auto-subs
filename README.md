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

**Step 1:** Install [`Stable-TS`](https://github.com/jianfch/stable-ts) (a fork of [OpenAI Whisper](https://github.com/openai/whisper))

    pip install -U git+https://github.com/jianfch/stable-ts.git

**Step 2:** Install [`FFMPEG`](https://ffmpeg.org/)

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

**Step 3:** Fix audio backend
    
    # on Windows
    pip install soundfile 
    
    # on Linux
    pip install sox
    
**Step 4:** Download the `auto-subs.py` file and drag it into the `Utility` folder of one of the Fusion Scripting folders like this address
  
    ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility

Once the python file has been placed here, it should show up in the scripts menu within Resolve.
   
