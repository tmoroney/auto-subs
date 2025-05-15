# AutoSubs V2 – Subtitles Made Simple
Create high-quality subtitles effortlessly with **one click**. AutoSubs delivers **fast, accurate, and fully customisable** subtitles in a sleek, intuitive interface.

### 📥 One-Click Installer: [Windows ](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Win-setup.exe) ✨ [MacOS (ARM)](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-ARM.pkg)
**💡 24,000+ downloads in under 3 months!**

<a href="https://www.buymeacoffee.com/tmoroney"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=tmoroney&button_colour=3562e3&font_colour=ffffff&font_family=Poppins&outline_colour=ffffff&coffee_colour=FFDD00" /></a>

## 🚀 Key Features
**⚡ Blazing Fast:** Lightning-fast transcription in nearly any language.

**🗣️ Speaker Diarization:** Detect different speakers & color-code subtitles automatically.

**🌏 English Translation:** Convert subtitles to English (more languages coming soon).

**🎨 Modern UI:** A clean, user-friendly designed for creators.

**📦 One-Click Installer:** One-click installer for Mac (ARM) & Windows. (Linux & Intel Mac support coming soon!)

Generate Subtitles & Label Speakers |  Advanced Settings
:-------------------------:|:-------------------------:
<img width="550" alt="Transcription Page" src="https://github.com/user-attachments/assets/59803d26-cda0-4b44-ac54-3eb46438f7a6"> | <img width="600" alt="Advanced Settings" src="https://github.com/user-attachments/assets/d136f300-89be-4f0c-a330-57372fd71041">

## Setup:
### 1. Download & Install
- Click the download link for your operating system above.
- Open the installer and follow the on-screen instructions.

### 2. Launch AutoSubs in DaVinci Resolve
- Open **DaVinci Resolve**. *(If you're using MacOS, make sure you aren't using the App Store version of DaVinci Resolve.)*
- In the top menu, go to **Workspace → Scripts → AutoSubs V2**.

You’re all set! 🚀 AutoSubs V2 is now ready to generate subtitles effortlessly.

Watch this helpful tutorial to get you started with AutoSubs: [Watch Now](https://www.youtube.com/watch?v=U36KbpoAPxM)

# AutoSubs V1 (Legacy Version)
If your OS isn’t supported by **AutoSubs V2**, you can try **AutoSubs V1** using manual installation. However, this requires basic experience with Python and the terminal, and this version is no longer supported so any errors you will have to fix yourself.
>[!Warning]
If using the **free version**, you must be on **Resolve 19.0.3 or earlier**, as Blackmagic removed the built-in UI manager in v19.1.

### [AutoSubs V1 Install Guide](https://github.com/tmoroney/auto-subs/blob/a695224b66e46c62dc716f5336582795e7174f17/V1_README.md)

# Contribute to AutoSubs
If you would like to contribute to the development of AutoSubs, follow the steps below.
## Set Up for Development
1. Clone this repository to whatever directory you wish.
2. Copy the `AutoSubs V2.lua` file from the following directory within the repo: `auto-subs/AutoSubs-App/src-tauri/resources`
4. Paste the `AutoSubs V2.lua` file inside one of the directories below so that Resolve can see it:
  - Windows: `%appdata%\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility`
  - Mac: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility`
3. Open `AutoSubs V2.lua` and set the variable `DEV_MODE` to true at the top of the file. Since we will be running the Tauri app in dev mode, we must turn on dev mode which will prevent the Lua server from opening the main Tauri application when the script it is started.

## Start Python Transcription Server
Open a new terminal in the repository and run the following commands to start the python transcription server. This python server is responsible for anything machine learning related such as Transcribing audio and Speaker Diarization.

### Mac (ARM)
```bash
cd Transcription-Server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-mac.txt
```
### Windows
```bash
cd Transcription-Server
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-win.txt
```
## Start LUA server
This LUA script is a server that runs in the background and waits to recieve a request from the frontend Tauri app. This script is responsable for any interaction with Resolve, such as adding Text+ subtitles to the timeline and exporting the timeline audio.
1. Open Resolve
2. Navigate to Scripts and open AutoSubs V2

## Start Tauri App (Frontend UI)
```bash
cd AutoSubs-App
npm install
npm run tauri dev
```

# Libraries Used
1. [Stable-TS](https://github.com/jianfch/stable-ts)
2. [MLX-Whisper](https://pypi.org/project/mlx-whisper/)
3. [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper)
