# Davinci Resolve AI Subtitles
Automatically generates Text+ subtitles (in your style) for any video using AI. Works on both the Free and Studio versions of Davinci Resolve. This python script uses OpenAI Whisper to generate the SRT subtitles file, and then the Davinci Resolve API and Fusion API to add each line to the timeline in a Fusion Text+ object. The script is run through the scripts button within Resolve.

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
    
**Step 4:** Place the `auto-subs.py` file inside the Utility folder of one of the Fusion Script folder locations
  
    ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility
   
