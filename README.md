# Davinci Resolve AI Subtitles
Automatically transcribes your editing timeline using [`OpenAI Whisper`](https://openai.com/research/whisper) and [`Stable-TS`](https://github.com/jianfch/stable-ts) for extreme accuracy.
- Generate subtitles in your own **custom style**.
- **Completely free** and runs locally within Davinci Resolve.
- Works on Mac, Linux, and Windows.
- Supported on both **Free** and **Studio** versions of Resolve.
- Jump to positions on the timeline using the Subtitle Navigator.
- **NEW!! - Translate from any language to English.**

> [!TIP]
> **Setup and Usage Guides: [AutoSubs Video Tutorial](https://youtu.be/Q-Ud4ZAWH6o?si=EbS32gBrZt6uDF1a) or
> [Spanish Tutorial](https://youtu.be/cBllp0xjAck?si=KoX7OLGIa6b4lBjh)**

### Support AutoSubs development:
[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/tmoroney)

## Table of Contents
#### 1. [📋 Usage Guide](#usage-guide)
#### 2. [📡 Automatic Setup (Windows Only - Recommended)](#automatic-setup)
#### 3. [🛠️ Manual Setup (Mac, Linux, Windows)](#manual-setup)
#### 4. [📜 Light Version (requires an SRT file)](#light-version)
#### 5. [☕ Contact / Support](#contact-and-support)
#### 6. [❓ FAQ](#faq)

<br/>

Transcription Settings + Subtitle Navigator             |  Subtitle Example
:-------------------------:|:-------------------------:
<img alt="Subtitle Example" src="https://github.com/tmoroney/auto-subs/assets/72154813/074f8207-5e05-4011-b87b-780857da701f" width="1400">  |  <img alt="Subtitle Example" src="https://github.com/tmoroney/auto-subs/assets/72154813/a2b06385-672b-400d-9c14-ba0a4def1625" width="650">

![auto subs (6)-modified](https://github.com/tmoroney/auto-subs/assets/72154813/67cafbbd-d3e3-4984-8ba3-800df76e0a54)


## Usage Guide
### Step 1: Open Auto-Subs
Click on `Workspace` in Resolve's top menu bar, then within `Scripts` select `auto-subs` from the list.

    Workspace -> Scripts -> auto-subs

### Step 2: Create your Template
Add a `Text+` to the timeline, customise it to your liking, then drag it into the `Media Pool`. This will be used as the template for your subtitles.

### Step 3: Select an area to add subtitles
Mark the beginning ("In") and end ("Out") of the area to subtitle using the `I` and `O` keys on your keyboard.

### Step 4: Transcribe
Click **`"Generate Subtitles"`** to transcribe the selected timeline area.

## Automatic Setup
> [!NOTE] 
> **Automatic setup only works on Windows**<br>
> The command below executes a [PowerShell script](https://github.com/tmoroney/auto-subs/blob/7e204b75b61081fb33168d5a50cb96e1a353ccc1/install-script.ps1) which installs all the dependencies and places `auto-subs.py` in the Fusion scripts folder.

1. Download [Python 3.12](https://www.python.org/downloads/) and run the installer. Make sure to tick `"Add python.exe to PATH"` during installation. <br><br> <img alt="Python Installer" src="https://github.com/tmoroney/auto-subs/assets/72154813/0a47e465-f1d6-4955-90d5-dfa211d9ba01" width="500">
2. Open PowerShell in **Administrator Mode**.
3. Copy this command into Powershell + Run it by hitting the enter key.

       Invoke-Expression (Invoke-WebRequest -Uri "https://raw.githubusercontent.com/tmoroney/auto-subs/main/install-script.ps1").Content

## Manual Setup
### Summary:
1. Install [`Python 3.8 - 3.12`](https://www.python.org/downloads/)
2. Install [`OpenAI Whisper`](https://github.com/openai/whisper)
3. Install [`FFMPEG`](https://ffmpeg.org/) (used by Whisper for audio processing)
4. Install [`Stable-TS`](https://github.com/jianfch/stable-ts) (improves subtitles)
5. Download + copy [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) to Fusion Scripts folder.

### Setup Guides:
<details>
<summary>Windows Setup</summary>
       
### Step 1: Install Python
Download [Python 3.12](https://www.python.org/downloads/) (or any version > 3.8) and run the installer. Make sure to tick `"Add python.exe to PATH"` during installation. <br><br> <img alt="Python Installer" src="https://github.com/tmoroney/auto-subs/assets/72154813/0a47e465-f1d6-4955-90d5-dfa211d9ba01" width="500">

### Step 2: Install Whisper
From the [Whisper setup guide](https://github.com/openai/whisper/tree/main#readme) - Run the following command to install OpenAI Whisper for your OS.
    
    pip install -U openai-whisper

### Step 3: Install FFMPEG

Install [FFMPEG](https://ffmpeg.org/) (for audio processing). I recommend using a package manager as it makes the install process less confusing.

    # on Windows using Chocolatey (https://chocolatey.org/install)
    choco install ffmpeg

    # on Windows using Scoop (https://scoop.sh/)
    scoop install ffmpeg

### Step 4: Install Stable-TS
Install Stable-TS by running this command in the terminal:

    pip install -U stable-ts

### Step 5: Download the Python Script
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
   > ⚠️ **Possible Error:** `<urlopen error [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: self-signed certificate in certificate chain (_ssl.c:1006)>` <br>
   > ✔️ **Solution:** Run this command in the terminal `/Applications/Python\ 3.11/Install\ Certificates.command` (replace the Python directory with wherever Python is installed on your computer).

4. Install [FFMPEG](https://ffmpeg.org/) (used by Whisper for audio processing):

       brew install ffmpeg

5. Install OpenAI Whisper:

       pip install -U openai-whisper
   
       # if previous command does not work
       pip3 install -U openai-whisper

7. Install Stable-TS:

       pip install -U stable-ts
   
       # if previous command does not work
       pip3 install -U stable-ts

9. Download [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) (click **"Download Raw File"**) and copy it to `Fusion` -> `Scripts` -> **`Utility`**.
The directory should look like this:
  
       ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility

</details>

<details>
<summary>Linux Setup</summary>

### Install the following:
1. Python
       
       # on Ubuntu or Debian
       sudo apt-get install python3.11

       # on Arch Linux
       sudo pacman -S python3.11

2. FFMPEG

       # on Ubuntu or Debian
       sudo apt update && sudo apt install ffmpeg

       # on Arch Linux
       sudo pacman -S ffmpeg

3. OpenAI Whisper

       pip install -U openai-whisper

5. Stable-TS

       pip install -U stable-ts

6. Download [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) (click **"Download Raw File"**) and copy it to `Fusion` -> `Scripts` -> **`Utility`**.
The directory should look like this:
  
       ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility

      

</details>

## Light Version
> [!NOTE]
> **Audio transcription has been removed on this version**. This means less setup, but a subtitles (SRT) file is required as input. Use this if you already have a way of transcribing video (such as Davinci Resolve Studio's built-in subtitles feature, or CapCut subtitles) and you just want subtitles with a custom theme.

#### Creates themed subtitles from an SRT file.
### Step 1
Install any version of [Python](https://www.python.org/downloads/) (tick `"Add python.exe to PATH"` during installation)
### Step 2
Download **[`auto-subs-light.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs-light.py)** and place it in the `Utility` folder of the Fusion Scripts folder.

    ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility


## Contact and Support
- Check out the [Youtube Video Tutorial](https://youtu.be/Q-Ud4ZAWH6o?si=EbS32gBrZt6uDF1a) 📺
- Thanks to everyone who has supported this project ❤️
- If you have any issues, get in touch on my [Discord server](https://discord.com/invite/TBFUfGWegm) for support 📲

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/tmoroney)

## FAQ
### 1. Auto-Subs not opening
Verify that Resolve detects your Python installation by opening the Console from the top menu/toolbar in Resolve and clicking `py3` at the top of the console.
Ensure that `Path` in your system environment variables contains the following:
- `C:\Users\<your-user-name>\AppData\Local\Programs\Python\Python312`
- `C:\Users\<your-user-name>\AppData\Local\Programs\Python\Python312\Scripts\`
### 2. Can't find Fusion folder
Use [Everything](https://www.voidtools.com/) to quickly search your computer for it (Windows only).
### 3. MacOS Error
    <urlopen error [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: self-signed certificate in certificate chain (_ssl.c:1006)>
**Solution:** Run this command in the terminal (replace the Python directory with wherever Python is installed on your computer).

    /Applications/Python\ 3.11/Install\ Certificates.command
### 4. Check Python version being used by Resolve
`import sys` + `print (sys.version)` in the Resolve console.
### 5. Issues during Whisper setup
[This video](https://youtu.be/ABFqbY_rmEk) may help you (Only the first 6 minutes are necessary).

## Future Features
1. "Improve Timestamps" button to refine subtitle timing.
2. Speaker Diarization (different coloured subtitles for different people speaking).
3. Auto-translation (generate subtitles in a different language to the one being spoken).
4. ChatGPT Integration

<br>
<br>
