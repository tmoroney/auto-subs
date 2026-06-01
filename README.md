# AutoSubs

AutoSubs generates accurate, timestamped subtitles from any audio or video file. AI transcription runs locally — no cloud, no subscription.

- Transcribes speech in many languages, with optional translation
- Identifies and labels multiple speakers automatically
- Exports to SRT, plain text, DaVinci Resolve, Premiere Pro, or After Effects
- Works standalone, with DaVinci Resolve, or with Adobe apps through the bundled CEP extension

[![Downloads](https://img.shields.io/endpoint?url=https://tom-moroney.com/release-tracker/data/badge-downloads.json)](https://tom-moroney.com/release-tracker/)
[![Weekly App Opens](https://img.shields.io/endpoint?url=https://tom-moroney.com/release-tracker/data/badge-weekly-users.json&style=flat)](https://tom-moroney.com/release-tracker/)
[![New Downloads / Week](https://img.shields.io/endpoint?url=https://tom-moroney.com/release-tracker/data/badge-weekly-downloads.json)](https://tom-moroney.com/release-tracker/)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tmoroney/auto-subs)

<img width="600" alt="AutoSubs UI" src="https://github.com/user-attachments/assets/5a95ef0c-43c7-426c-9d7b-ed3af4974a5c" />

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

> [!TIP]
> macOS users can also install AutoSubs with Homebrew:
> ```bash
> brew install --cask auto-subs
> ```

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

#### Adobe Premiere Pro / After Effects Mode
1. Launch AutoSubs and open the bundled AutoSubs CEP extension in Premiere Pro or After Effects.
2. Select the Adobe integration from AutoSubs.
3. Export timeline audio for transcription or import generated subtitles back into the host app.
4. In Premiere Pro, subtitles are imported as caption tracks; in After Effects, SRT entries are created as text layers.

> [!WARNING]
> AutoSubs will not work with the Mac App Store version of DaVinci Resolve. Re-install from the [official website](https://www.blackmagicdesign.com/products/davinciresolve/) if needed.

### Command Line Interface

Transcribe files straight from the terminal — handy for scripting and AI agents. Pass a file and AutoSubs runs without a window, prints the result, and exits; run it with no arguments to open the desktop app as usual.

**1. Add `autosubs` to your PATH** (one-time setup):

- **Linux** — already done; the `.deb`/`.rpm` installs `/usr/bin/autosubs`.
- **macOS / Windows** — in the app, go to **Settings → Command line** and click **Install** (**Remove** reverses it).

**2. Run it:**

```bash
autosubs interview.mp4 --model small                             # transcript to the console
autosubs interview.mp4 --model small --diarize --max-speakers 2  # label speakers
autosubs interview.mp4 --model small -o subs.srt                 # write a file (format from extension)
autosubs interview.mp4 --model small -f json                     # or set the format explicitly
autosubs --help                                                  # all options
```

`--model` accepts any AutoSubs model — Whisper sizes (`tiny`…`large-v3`), `parakeet`, or a `moonshine-*` variant. Run `autosubs --list-models` for the full list.

**Output formats** (`-f` / `--format`, or inferred from the `-o` extension; defaults to `text`):

| Format | Contents |
|---|---|
| `text` *(default)* | Readable transcript — `[HH:MM:SS] Speaker N: …`, one paragraph per speaker turn |
| `srt` / `vtt` | Subtitle cues (SubRip / WebVTT) |
| `json` | Full structured transcript with word-level timestamps |

Only the result goes to stdout (so `> out.srt` is clean); progress and errors go to stderr. Exit code is `0` on success, `1` on a runtime error, `2` on a usage error. Models download automatically on first use.

---

## Integrations

AutoSubs can run as a standalone subtitle generator, connect directly to DaVinci Resolve, or communicate with Adobe Premiere Pro and After Effects through the bundled CEP extension.

Select a Preset Style |  Or create your own
:-------------------------:|:-------------------------:
<img width="800" alt="Transcription Page" src="https://github.com/user-attachments/assets/f5338833-cdbb-4aae-9480-0aa8cbffda60"> | <img width="500" alt="Advanced Settings" src="https://github.com/user-attachments/assets/9d2680ce-e80a-408f-a36f-54387a16f53c">

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
