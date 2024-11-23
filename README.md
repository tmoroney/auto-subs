# AutoSubs V2 - out now for MacOS 15! 🚀
**Experience faster transcription, a sleek new interface, and powerful new features:**
- ⚡ **Blazing Fast Speeds:** Transcribe audio over 2x faster (optimised for Mac and Windows).
- 🗣️ **Speaker Diarization:** Auto-detect speakers and color-code subtitles effortlessly.
- 🌏 **English Translation:** Speak in your native language and get subtitles in English (if enabled).
- 🎨 **Modern UI:** A stylish, streamlined interface for seamless workflows.
- 📦 **One-Click Installer:** Apple-approved for quick, hassle-free setup.

### ✨ **[Explore AutoSubs v2](https://github.com/tmoroney/auto-subs/releases/tag/V2.0)** ✨
Upgrade now and experience the future of fast, seamless transcription! 🎉

<a href="https://www.buymeacoffee.com/tmoroney"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=tmoroney&button_colour=3562e3&font_colour=ffffff&font_family=Poppins&outline_colour=ffffff&coffee_colour=FFDD00" /></a>

# AutoSubs V1
**Automatic transcription for your editing timeline using OpenAI Whisper (running locally).**
- 🎨 Generate subtitles in your own custom style
- 🌐 Translate from any language to English.
- 🕹️ Jump to positions on the timeline using the Subtitle Navigator.
- 🎁 Completely free and runs locally within Davinci Resolve.
- 💻 Works on Mac, Linux, and Windows.
- 🎥 Supported on both **Free** and **Studio** versions of Resolve.

>[!Caution]
>**AutoSubs V1 Broken on Resolve 19.1 Free -** Blackmagic has decided to remove the built in UI manager from the free version of Resolve. It is now required to have Resolve **19.0.3** or below, unless on Studio, so you may need to downgrade. (Resolve Studio is unaffected)

> [!TIP]
> **Video Tutorials: [English Tutorial](https://www.youtube.com/watch?v=ieur1BJc65k) or
> [Spanish Tutorial](https://youtu.be/cBllp0xjAck?si=KoX7OLGIa6b4lBjh)**</br></br>
> ![](https://dcbadge.limes.pink/api/server/https://discord.com/invite/TBFUfGWegm)

## Table of Contents
#### 1. [📋 Usage Guide](#usage-guide)
#### 2. [🛠️ Manual Setup (Mac, Linux, Windows)](#manual-setup)
#### 3. [✨ Update AutoSubs](#update-autosubs)
#### 4. [📜 Light Version (requires an SRT file)](#light-version)
#### 5. [☕ Contact / Support](#contact-and-support)
#### 6. [❓ FAQ](#faq)

<br/>

Transcription Settings + Subtitle Navigator             |  Subtitle Example
:-------------------------:|:-------------------------:
<img alt="Subtitle Example" src="https://github.com/tmoroney/auto-subs/assets/72154813/074f8207-5e05-4011-b87b-780857da701f" width="1400">  |  <img alt="Subtitle Example" src="https://github.com/tmoroney/auto-subs/assets/72154813/a2b06385-672b-400d-9c14-ba0a4def1625" width="650">

![auto subs (6)-modified](https://github.com/tmoroney/auto-subs/assets/72154813/67cafbbd-d3e3-4984-8ba3-800df76e0a54)

# Supported Languages
Afrikaans, Arabic, Armenian, Azerbaijani, Belarusian, Bosnian, Bulgarian, Catalan, Chinese, Croatian, Czech, Danish, Dutch, English, Estonian, Finnish, French, Galician, German, Greek, Hebrew, Hindi, Hungarian, Icelandic, Indonesian, Italian, Japanese, Kannada, Kazakh, Korean, Latvian, Lithuanian, Macedonian, Malay, Marathi, Maori, Nepali, Norwegian, Persian, Polish, Portuguese, Romanian, Russian, Serbian, Slovak, Slovenian, Spanish, Swahili, Swedish, Tagalog, Tamil, Thai, Turkish, Ukrainian, Urdu, Vietnamese, and Welsh.

# Usage Guide
### Step 1: Open Auto-Subs
Click on `Workspace` in Resolve's top menu bar, then within `Scripts` select `auto-subs` from the list.

    Workspace -> Scripts -> auto-subs

### Step 2: Create your Template
Add a `Text+` to the timeline, customise it to your liking, then drag it into the `Media Pool`. This will be used as the template for your subtitles.

### Step 3: Select an area to add subtitles
Mark the beginning ("In") and end ("Out") of the area to subtitle using the `I` and `O` keys on your keyboard.

### Step 4: Transcribe
Click **`"Generate Subtitles"`** to transcribe the selected timeline area.

# Automatic Setup
> [!NOTE] 
> **Temporarily removed until I have time to update it to work correctly**<br>

# Manual Setup
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
Download [Python 3.12](https://www.python.org/downloads/) (or any version between 3.8 and 3.12) and run the installer. Make sure to tick `"Add python.exe to PATH"` during installation. <br><br> <img alt="Python Installer" src="https://github.com/tmoroney/auto-subs/assets/72154813/0a47e465-f1d6-4955-90d5-dfa211d9ba01" width="500">

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
Run the following command in Powershell:
    
    Invoke-Expression (Invoke-WebRequest -Uri "https://raw.githubusercontent.com/tmoroney/auto-subs/main/update-script.ps1").Content
***OR***

Download **[`auto-subs-light.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs-light.py)** and place it in one of the following directories:
- All users: `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility`
- Specific user: `%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility`

<br>

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

9. Download **[`auto-subs-light.py`](https://github.com/tmoroney/auto-subs/blob/AutoSubsV1/auto-subs-light.py)** and place it in one of the following directories:
    - All users: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility`
    - Specific user: `/Users/<UserName>/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility`

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

6. Download **[`auto-subs-light.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs-light.py)** and place it in one of the following directories:
    - All users: `/opt/resolve/Fusion/Scripts/Utility`  (or `/home/resolve/Fusion/Scripts/Utility` depending on installation)
    - Specific user: `$HOME/.local/share/DaVinciResolve/Fusion/Scripts/Utility`

      

</details>


# Update AutoSubs

### Automatic (Windows Only):
Open PowerShell and run the following command:
    
    Invoke-Expression (Invoke-WebRequest -Uri "https://raw.githubusercontent.com/tmoroney/auto-subs/main/update-script.ps1").Content

### Manual (Windows, Mac, Linux)
Download the [`auto-subs.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs.py) file and add it to one of the following directories:

1. **Windows:**
    - All users: `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Fusion\Scripts`
    - Specific user: `%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts`

2. **Mac OS:**
    - All users: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility`
    - Specific user: `/Users/<UserName>/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility`

3. **Linux:**
    - All users: `/opt/resolve/Fusion/Scripts/Utility`  (or `/home/resolve/Fusion/Scripts/Utility` depending on installation)
    - Specific user: `$HOME/.local/share/DaVinciResolve/Fusion/Scripts/Utility`

## Light Version
> [!NOTE]
> **Audio transcription has been removed on this version**. This means less setup, but a subtitles (SRT) file is required as input. Use this if you already have a way of transcribing video (such as Davinci Resolve Studio's built-in subtitles feature, or CapCut subtitles) and you just want subtitles with a custom theme.

#### Creates themed subtitles from an SRT file.
### Step 1
Install any version of [Python](https://www.python.org/downloads/) (tick `"Add python.exe to PATH"` during installation)
### Step 2
Download **[`auto-subs-light.py`](https://github.com/tmoroney/auto-subs/blob/main/auto-subs-light.py)** and place it in the `Utility` folder of the Fusion Scripts folder.

    ...\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility


# Contact and Support
- Check out the [Youtube Video Tutorial](https://youtu.be/Q-Ud4ZAWH6o?si=EbS32gBrZt6uDF1a) 📺
- Thanks to everyone who has supported this project ❤️
- If you have any issues, get in touch on my [Discord server](https://discord.com/invite/TBFUfGWegm) for support 📲

<a href="https://www.buymeacoffee.com/tmoroney"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=tmoroney&button_colour=3562e3&font_colour=ffffff&font_family=Poppins&outline_colour=ffffff&coffee_colour=FFDD00" /></a>

# FAQ
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


