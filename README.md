# AutoSubs

AutoSubs generates accurate, timestamped subtitles from any audio or video file. AI transcription runs locally — no cloud, no subscription.

- Transcribes speech in many languages, with optional translation
- Identifies and labels multiple speakers automatically
- Exports to SRT, plain text, or directly into DaVinci Resolve
- Works standalone or as a DaVinci Resolve plugin

[![Downloads](https://img.shields.io/endpoint?url=https://tom-moroney.com/release-tracker/data/badge-downloads.json)](https://tom-moroney.com/release-tracker/)
[![Weekly Active Users](https://img.shields.io/endpoint?url=https://tom-moroney.com/release-tracker/data/badge-weekly-users.json)](https://tom-moroney.com/release-tracker/)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tmoroney/auto-subs)

---

Generate Subtitles with Speaker Labels |  Animated Captions
:-------------------------:|:-------------------------:
<img width="800" alt="Transcription Page" src="https://github.com/user-attachments/assets/fbdba848-46d5-451c-b671-06bf3237b08c"> | <img width="800" alt="Advanced Settings" src="https://github.com/user-attachments/assets/3a707940-7f2d-4052-990c-58cd913c185c">

---

## Download

| Platform | Installer |
|---|---|
| 🪟 Windows | [AutoSubs-windows-x86_64.exe](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-windows-x86_64.exe) |
| 🍎 macOS (Apple Silicon) | [AutoSubs-Mac-ARM.pkg](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-ARM.pkg) |
| 🍎 macOS (Intel) | [AutoSubs-Mac-Intel.pkg](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-Intel.pkg) |
| 🐧 Linux (Debian/Ubuntu) | [AutoSubs-linux-x86_64.deb](#linux-install) |
| 🐧 Linux (Fedora/openSUSE) | [AutoSubs-linux-x86_64.rpm](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-linux-x86_64.rpm) |

<a href="https://www.buymeacoffee.com/tmoroney" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 48px !important;width: 173px !important;" ></a>

---

## Quick Start

### Windows & macOS

Download the installer for your platform above and follow the prompts.

### Linux install

**Debian/Ubuntu (.deb):**
```bash
wget https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-linux-x86_64.deb
sudo apt install ./AutoSubs-linux-x86_64.deb
```

**Fedora/openSUSE (.rpm):**
Download [AutoSubs-linux-x86_64.rpm](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-linux-x86_64.rpm) and open it with your package manager.

### Workflows

#### Standalone Mode
1. Launch AutoSubs and select an audio or video file.
2. Pick your model and language/translation options.
3. Click **Transcribe**. Edit speakers and subtitles as needed.
4. Export as SRT, text, or copy to clipboard.

#### DaVinci Resolve Mode
1. Open DaVinci Resolve → **Workspace → Scripts → AutoSubs**.
2. Select your timeline/audio source and settings.
3. Click **Transcribe**. Edit speakers and subtitles as needed.
4. Send styled subtitles back to Resolve.

> [!WARNING]
> AutoSubs will not work with the Mac App Store version of DaVinci Resolve. Re-install from the [official website](https://www.blackmagicdesign.com/products/davinciresolve/) if needed.

---

## What's New in v3.5

### Transcription
- **Voice Activity Detection** — strips non-speech audio before transcription for cleaner, faster results
- **More models** — Whisper, Parakeet, and Moonshine supported, with easy download, switch, and delete
- **Better speaker labels** — upgraded diarization model for more accurate identification
- **Translation** — translate subtitles to other languages directly from the app

### Editing & UI
- **Free-text subtitle editing** — edit subtitles naturally; word timing adjusts automatically
- **Transcript history** — browse and reload past transcripts without re-running the pipeline
- **Localisation** — UI available in Korean, Spanish, German, French, Japanese, and Chinese
- **Custom titlebar** — sleeker look with better use of app space

### DaVinci Resolve
- **Animated caption macro** — create animated captions with per-word highlighting
- **Preset system** — build, share, and preview caption presets before applying
- **Marker-based word timing** — fine-tune timing directly on the Resolve timeline
- **Conflict detection** — track conflicts flagged the moment a track is selected

### Bug Fixes (v3.5.1)
- Custom max characters per line, Korean inter-word spacing, and Cyrillic formatting fixes
- Resolve export: corrected marker range calculation and cancellation handling
- Model Manager: graceful recovery from broken HuggingFace cache; fixed delete button
- Linux: install path fixes, double titlebar fix, and KDE crash fix

---

## Contributing

PRs are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started, including the dev setup and a full codebase walkthrough via **[AutoSubs DeepWiki](https://deepwiki.com/tmoroney/auto-subs)**.
