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

AutoSubs can run from the terminal without opening a window, so AI agents and terminal-heavy users can transcribe files directly. Given a file argument the app runs headlessly, prints the result, and exits with a status code (`0` success, `1` on a runtime error, `2` on a usage error). With **no** arguments it launches the normal desktop interface.

```bash
# Readable transcript to the console (default format)
autosubs interview.mp4 --model small

# Speaker diarization (adds "Speaker N:" labels)
autosubs interview.mp4 --diarize --max-speakers 2 --lang en

# Pick a format explicitly…
autosubs interview.mp4 -f srt
autosubs interview.mp4 -f json

# …or let the output file extension decide
autosubs interview.mp4 -o subs.srt
autosubs interview.mp4 -o transcript.json

# Full option list / version
autosubs --help
autosubs --version
```

**Output formats** (`-f` / `--format`):

| Format | Contents |
|---|---|
| `text` *(default)* | Readable transcript — `[HH:MM:SS] Speaker N: …`, one paragraph per speaker turn (no word-level timings) |
| `srt` | SubRip subtitles (one short cue per segment) |
| `vtt` | WebVTT subtitles (one short cue per segment) |
| `json` | Full structured transcript including word-level timestamps |

If `--format` is omitted, the format is inferred from the `-o` file extension (`.srt`, `.vtt`, `.json`, `.txt`), otherwise it defaults to `text`.

**stdout** carries only the rendered output, so `autosubs file.mp4 -f srt > out.srt` is clean and pipe-safe. Progress and errors go to **stderr**: in an interactive terminal you get a live progress bar with the current stage (downloading model / transcribing / diarizing / translating); when stderr is piped or captured, it falls back to one line per stage. On failure a `{ "error": "..." }` object is printed to stderr and the exit code is non-zero. Models are downloaded automatically on first use to the app's cache directory.

> On Windows, release builds attach to the parent console at startup so output is visible. As with any Tauri CLI app, the shell prompt may return before output finishes printing.

#### Getting the `autosubs` command on your PATH

The CLI is the same binary as the desktop app, so it needs to be reachable from your shell:

- **Linux** — already done. The `.deb`/`.rpm` installs `/usr/bin/autosubs`, which is on `PATH`. Just run `autosubs <file> ...`.
- **macOS / Windows** — open **Settings → Command line** in the app and click **Install**. This symlinks the command into `/usr/local/bin` (macOS, prompts for your password) or adds the install folder to your user `PATH` (Windows). **Remove** reverses it. The button reports the current state on each platform.

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
