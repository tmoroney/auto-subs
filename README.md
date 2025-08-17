# AutoSubs – Subtitles Made Simple
Create high‑quality subtitles with **one click**. AutoSubs delivers **fast, accurate, and fully customisable** subtitles in a sleek, intuitive interface. Now works with Davinci Resolve and standalone.

### 📥 One-Click Installer: [Windows ](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-windows-x86_64.exe) ✨ [MacOS (ARM)](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-ARM.pkg) ✨ [MacOS (Intel)](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-Intel.pkg) ✨ [Linux (.deb)](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-linux-x86_64.deb)
**💡 100,000+ downloads so far!**

<a href="https://www.buymeacoffee.com/tmoroney" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## 🚀 What’s New in V3
- **New, cleaner UI** — Easier to use and more consistent.
- **Faster + lighter** — Quicker diarization and ~3× lower idle memory on a new Rust backend.
- **Smarter models** — More choices, easy delete, and clear status badges.
- **Better timing** — Accurate with variable frame rates and drop‑frame.
- **Standalone mode** — Transcribe any audio/video file, no Resolve required.
- **Powerful editors** — Modern subtitle editor and advanced speaker styling (per‑speaker tracks, fill/outline/border).
- **Flexible viewing** — Multi‑line subtitles and a resizable desktop viewer.

## ⭐ Core Capabilities
- **Fast, accurate transcription** in many languages.
- **Speaker diarization & labels** with automatic colors.
- **English translation** (more languages coming soon).
- **Creator‑friendly UI** with smart defaults and pro controls.

Generate Subtitles & Label Speakers |  Advanced Settings
:-------------------------:|:-------------------------:
<img width="800" alt="Transcription Page" src="https://github.com/user-attachments/assets/ca00769b-93e2-4127-b604-a9108bf8451a"> | <img width="800" alt="Advanced Settings" src="https://github.com/user-attachments/assets/be1a111a-71c5-4d8d-ad8c-d9e889e3e7ab">


## Quick Start
### 1) Download & Install
- Use the installer links above for your OS.
- Open the installer and follow the prompts.

 - Linux (.deb): download and install from the latest release
   ```bash
   wget https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-linux-x86_64.deb
   sudo apt install ./AutoSubs-linux-x86_64.deb
   # or
   # sudo dpkg -i AutoSubs-linux-x86_64.deb && sudo apt -f install
   ```

### 2) Choose a Workflow
#### Standalone Mode (no Resolve required)
1. Launch AutoSubs.
2. Select an audio/video file.
3. Pick your model and language/translation options.

4. Click Transcribe. Edit speakers/subtitles as needed.
5. Export subtitles (e.g., to files) or copy text.

#### DaVinci Resolve Mode
1. Open **DaVinci Resolve**.
2. Go to **Workspace → Scripts → AutoSubs**.
3. In AutoSubs, select your timeline/audio source and settings.
4. Click Transcribe. Edit speakers/subtitles as needed.
5. Send styled subtitles back to Resolve.

# Contribute to AutoSubs
PRs are welcome!

## Dev Setup (brief)
1. Clone the repo.
2. Install prerequisites for a Tauri app (Node.js + Rust toolchain). See: https://tauri.app
3. Run the UI:
   ```bash
   cd AutoSubs-App
   npm install
   npm run tauri dev
   ```
4. For Resolve integration during development, copy the Lua (AutoSubs.lua) script from `AutoSubs-App/src-tauri/resources/` into your Resolve scripts folder so Resolve can launch/connect to the dev app. Open the lua script and set it to dev mode via the variable at the top, then set the location where the git repo was cloned:
   - Windows: `%appdata%/Blackmagic Design/DaVinci Resolve/Support/Fusion/Scripts/Utility`
   - macOS: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility`
   Then open it from Resolve via **Workspace → Scripts → AutoSubs**.

If you’re contributing to the backend, the Rust code lives under `AutoSubs-App/src-tauri/`.
