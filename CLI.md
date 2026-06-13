# AutoSubs Command Line Interface

AutoSubs can run from the terminal without opening a window, so AI agents and terminal-heavy users can transcribe files directly. Given a file argument the app runs headlessly, prints the result, and exits with a status code (`0` success, `1` on a runtime error, `2` on a usage error). With **no** arguments it launches the normal desktop interface.

## Basic Usage

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

## Model Selection

`--model` accepts any AutoSubs model — Whisper sizes (`tiny`…`large-v3`), `parakeet`, or a `moonshine-*` variant. Run `autosubs --list-models` for the full list.

## Additional Options

**Subtitle formatting:**
- `--density` - Text density: `less`, `standard`, `more`, `single`, or `custom`
- `--max-lines` - Maximum lines per subtitle
- `--max-chars-per-line` - Custom max characters per line (use with `--density custom`)
- `--text-case` - Text case: `none`, `lowercase`, `uppercase`, or `titlecase`
- `--remove-punctuation` - Strip punctuation from transcript

**Translation:**
- `--translate` - Translate transcript to English
- `--target-language` - Target language code for translation

**Performance:**
- `--gpu` / `--no-gpu` - Force GPU on/off (default: auto-detect)

**Advanced:**
- `--prompt` - Custom prompt to guide transcription

## Output Formats

| Format | Contents |
|---|---|
| `text` *(default)* | Readable transcript — `[HH:MM:SS] Speaker N: …`, one paragraph per speaker turn (no word-level timings) |
| `srt` | SubRip subtitles (one short cue per segment) |
| `vtt` | WebVTT subtitles (one short cue per segment) |
| `json` | Full structured transcript including word-level timestamps |

If `--format` is omitted, the format is inferred from the `-o` file extension (`.srt`, `.vtt`, `.json`, `.txt`), otherwise it defaults to `text`.

## Output Behavior

**stdout** carries only the rendered output, so `autosubs file.mp4 -f srt > out.srt` is clean and pipe-safe. Progress and errors go to **stderr**: in an interactive terminal you get a live progress bar with the current stage (downloading model / transcribing / diarizing / translating); when stderr is piped or captured, it falls back to one line per stage. On failure a `{ "error": "..." }` object is printed to stderr and the exit code is non-zero. Models are downloaded automatically on first use to the [model cache](AutoSubs-App/README.md#model-cache-location).

> On Windows, release builds attach to the parent console at startup so output is visible. As with any Tauri CLI app, the shell prompt may return before output finishes printing.

## Getting the `autosubs` command on your PATH

The CLI is the same binary as the desktop app, so it needs to be reachable from your shell:

- **Linux** — already done. The `.deb`/`.rpm` installs `/usr/bin/autosubs`, which is on `PATH`. Just run `autosubs <file> ...`.
- **macOS / Windows** — open **Settings → Command line** in the app and click **Install**. This symlinks the command into `/usr/local/bin` (macOS, prompts for your password) or adds the install folder to your user `PATH` (Windows). **Remove** reverses it. The button reports the current state on each platform.

During development the headless binary is at `src-tauri/target/debug/autosubs` (run `cargo build` in `src-tauri` first); symlink it yourself with `ln -s "$(pwd)/src-tauri/target/debug/autosubs" /usr/local/bin/autosubs`.

## Exit Codes

- `0` - Success
- `1` - Runtime error
- `2` - Usage error (invalid arguments)

## Related Documentation

- [Main README](README.md) - Installation and general usage
- [Contributing Guide](CONTRIBUTING.md) - Development setup
- [AutoSubs-App README](AutoSubs-App/README.md) - Technical architecture
- [Resolve Integration](Resolve-Integration/README.md) - DaVinci Resolve integration details
