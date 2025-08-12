# AutoSubs – Subtitles Made Simple
Create high‑quality subtitles with **one click**. AutoSubs delivers **fast, accurate, and fully customisable** subtitles in a sleek, intuitive interface. Now works with Davinci Resolve and standalone.

### 📥 One-Click Installer: [Windows ](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-windows-x86_64.exe) ✨ [MacOS (ARM)](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-ARM.pkg) ✨ [MacOS (Intel)](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-Intel.pkg)
**💡 100,000+ downloads so far!**

<a href="https://www.buymeacoffee.com/tmoroney"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=☕&slug=tmoroney&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" /></a>

## 🚀 What’s New in V3
- **Complete UI Overhaul** — Cleaner, more consistent, and more discoverable controls.
- **Performance Improvements** — Faster speaker diarization/labeling with negligible added time; ~3× lower idle memory via the Rust backend.
- **Expanded Model Management** — More model options, easy in‑UI deletion, clearer status indicators.
- **Timing Fixes** — Correct subtitle timing for variable frame rates and drop‑frame scenarios.
- **Rust Backend (replaces Python)** — Faster, leaner, and more reliable foundation for future features.
- **Standalone Mode** — Use AutoSubs on any audio/video file without DaVinci Resolve.
- **New Subtitle Editor** — Modern, responsive editor with a resizable caption viewer.
- **Advanced Speaker Editor** — Per‑speaker styles (fill/outline/border) with live preview; choose different output track per speaker.
- **Multi‑line Subtitles** — Pick how many lines to show per subtitle.
- **Resizable Subtitle Viewer** — Desktop layout supports side‑by‑side editing and review.

## ⭐ Core Capabilities
- **Blazing Fast Transcription** in many languages.
- **Speaker Diarization & Labeling** with automatic color coding.
- **English Translation** (more languages coming soon).
- **Modern, Creator‑Focused UI** with thoughtful defaults and power‑user controls.

Generate Subtitles & Label Speakers |  Advanced Settings
:-------------------------:|:-------------------------:
<img width="550" alt="Transcription Page" src="https://github.com/user-attachments/assets/59803d26-cda0-4b44-ac54-3eb46438f7a6"> | <img width="600" alt="Advanced Settings" src="https://github.com/user-attachments/assets/d136f300-89be-4f0c-a330-57372fd71041">

## Quick Start
### 1) Download & Install
- Use the installer links above for your OS.
- Open the installer and follow the prompts.

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

Watch the tutorial to get started: [Watch Now](https://www.youtube.com/watch?v=U36KbpoAPxM)

# AutoSubs V1 (Legacy Version)
If your OS isn’t supported by the latest version, you can try **AutoSubs V1** using manual installation. This requires basic Python/terminal experience and is no longer supported.
>[!Warning]
If using the free version of Resolve, you must be on **Resolve 19.0.3 or earlier**, as Blackmagic removed the built‑in UI manager in v19.1.

### [AutoSubs V1 Install Guide](https://github.com/tmoroney/auto-subs/blob/a695224b66e46c62dc716f5336582795e7174f17/V1_README.md)

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
4. For Resolve integration during development, copy the Lua script from `AutoSubs-App/src-tauri/resources/` into your Resolve scripts folder so Resolve can launch/connect to the dev app:
   - Windows: `%appdata%/Blackmagic Design/DaVinci Resolve/Support/Fusion/Scripts/Utility`
   - macOS: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility`
   Then open it from Resolve via **Workspace → Scripts → AutoSubs**.

If you’re contributing to the backend, the Rust code lives under `AutoSubs-App/src-tauri/`.
