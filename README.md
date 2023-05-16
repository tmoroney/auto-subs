# Davinci Resolve AI Subtitles
Uses AI to generate Text+ subtitles with custom styling - works with both the **Free and Studio versions** of Davinci Resolve. This python script uses OpenAI Whisper to transcribe the video and then the Davinci Resolve API and Fusion API to add each subtitle to the timeline in a Fusion Text+ object at the correct time. This script is run through the `Scripts` menu within Resolve.

![image](https://github.com/tmoroney/auto-subs/assets/72154813/a792207b-ad88-434f-8f88-8869259b7031)

## Running the Script

Click `Workspace` in the top menu bar. Then click `Scripts` and select `auto-subs` from the list.

## Prerequisites
- Python version `3.10` or less installed **(3.11 is not currently supported by Whisper)**
- Check Davinci Console that Python is working (click py3 button in console)
- If python is not working in Resolve, check that the system environment variables for python are set correctly so that Resolve knows where to find the python interpreter.

## Setup

**Step 1:** Install `Stable-TS` (a fork of OpenAI Whisper)

    pip install -U git+https://github.com/jianfch/stable-ts.git

**Step 2:** Install `FFMPEG`

    choco install ffmpeg

**Step 3 (Windows):** Fix audio backend

    pip install soundfile 
    
**Step 3 (Linux):** Fix audio backend
  
    pip install sox
    
**Step 4:** Download the `auto-subs.py` file and drag it into the `Utility` folder of one of the Fusion Scripting folders like this address
  
    ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility

Once the python file has been placed here, it should show up in the scripts menu within Resolve.
   
