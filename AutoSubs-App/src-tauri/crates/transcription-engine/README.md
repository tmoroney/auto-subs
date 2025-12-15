# Transcription Engine
Combines Whisper-rs and Pyannote-rs and adds accurate word-level timestamps with Dynamic Time Warping (DTW). Includes a subtitle formatter with language-aware presets, optional VAD, and simple override knobs for CPL/CPS.

## Features

- __Whisper transcription__ (via `whisper-rs`) with optional GPU and DTW word alignment
- __Speaker diarization__ (via `pyannote-rs`) or __VAD-only__ segmentation
- __Language detection__ when `options.lang = "auto"`
- __Subtitle post-processing__ with language/script presets and easy overrides (CPL/CPS/lines, etc.)
- __Word-level timestamps__ exported per cue for downstream formats (e.g., SRT, WebVTT)

## Quickstart: Transcribe with sensible defaults

```rust
use transcription_engine::{Engine, EngineConfig, TranscribeOptions, Callbacks, Segment, FormattingOverrides};

#[tokio::main]
async fn main() -> eyre::Result<()> {
    whisper_rs::install_logging_hooks();

    let audio_path = "./audio.wav"; // mono 16 kHz WAV recommended

    let mut engine = Engine::new(EngineConfig::default());

    let mut options = TranscribeOptions::default();
    options.model = "base.en".into();
    options.lang = Some("en".into()); // or Some("auto") for auto-detect
    options.enable_vad = Some(true);   // or diarization: options.enable_diarize = Some(true)

    fn on_new_segment(seg: &Segment) { println!("SEG: {}", seg.text); }
    fn on_progress(p: i32, progress_type: transcription_engine::ProgressType, label: &str) { println!("{}: {}% - {}", label, p, progress_type); }
    let callbacks = Callbacks { progress: Some(&on_progress), new_segment_callback: Some(&on_new_segment), is_cancelled: None };

    // Only override what you need; everything else comes from the detected (or specified) language preset
    let overrides = FormattingOverrides { max_chars_per_line: Some(38), max_lines: Some(2), ..Default::default() };

    let cues = engine
        .transcribe_audio(audio_path, options, Some(overrides), Some(callbacks))
        .await?;

    println!("Generated {} subtitle cues", cues.len());
    Ok(())
}
```

What happens under the hood:

- Engine builds a base post-process config from the effective language (detected or provided)
- Applies your `FormattingOverrides` on top
- Runs `process_segments` to split and line-break cues with CPS/CPL heuristics

## Translation (Google Translate)

This crate can translate your transcribed segments using Google Translate (via the built-in `translate` module). There are two ways to use it:

1) Engine-integrated (set a target language):

```rust
// Set a target language (e.g., French)
options.translate_target = Some("fr".into());

// The engine will translate segments after transcription. It uses the detected language
// (or your provided `options.lang`) as the source.
let cues = engine
    .transcribe_audio(audio_path, options, Some(overrides), Some(callbacks))
    .await?;
```

2) Manual translation (standalone):

```rust
use transcription_engine::translate;

// Translate plain text
let text = "Bonjour le monde!";
let translated = translate::translate_text(text, "fr", "en").await?;

// Translate already-produced segments in-place
translate::translate_segments(segments.as_mut_slice(), "en", "es", None).await?;
```

Notes:

- Translation changes the text and may desynchronize exact word-level timestamps from the translated words. The original timings remain attached to the source-language segmentation; use line-level timings for display if exact word timings post-translation are not required.
- If you only need English output, Whisper itself can translate to English (`options.whisper_to_english = Some(true)`), but that does not re-align word timestamps to the translated tokens.

## Formatting only (standalone)

If you already have `Vec<Segment>` (with `words` if available), you can call the formatter directly:

```rust
use transcription_engine::{process_segments, PostProcessConfig};

// Start from a language preset and tweak a few knobs
let mut cfg = PostProcessConfig::for_language("en");
cfg.max_lines = 2;
cfg.max_chars_per_line = 42;

let oracle = None; // or pass a &dyn SilenceOracle like VadMaskOracle for edge trims
let cues = process_segments(&segments, &cfg, oracle);
```

Notes:

- The formatter uses tiny (20 ms) VAD-aware trims at word edges if an oracle is provided.
- Grouping and cue splitting rely on punctuation and `split_gap_sec` (default 0.5 s) rather than the oracle.

## VAD and diarization

- __Diarization__: set `options.enable_diarize = Some(true)` and provide or auto-download the pyannote models.
- __VAD-only__: set `options.enable_vad = Some(true)` and provide or auto-download the Silero VAD model used by `whisper-rs`.
- The engine feeds a VAD oracle into formatting so word edges can snap more accurately.

## Language presets and overrides

Start from a preset and override only the parameters you care about:

- Presets: `PostProcessConfig::for_language("en")`, or `with_profile(ScriptProfile::CJK)`
- Common overrides:
  - `max_chars_per_line` (CPL)
  - `max_lines` (1–2)
  - `cps_cap` (characters per second cap)
  - `split_gap_sec` (long pause split)

Via engine: pass `FormattingOverrides`.

Via standalone: construct `PostProcessConfig` and tweak fields directly.

## Output

`process_segments` returns `Vec<Segment>` with:

- `start`, `end`: seconds
- `text`: up to `max_lines` lines of text broken up by line break
- `words`: per-word text and timestamps inside the cue
- `speaker_id`: if diarization or external speaker info was provided

You can convert these cues to SRT/WebVTT in your application layer.

## Convenience Functions

The crate provides convenience functions for model cache management:

```rust
use transcription_engine::{list_cached_models, delete_cached_model};

// List all cached models
let models = list_cached_models(&cache_dir)?;

// Delete a specific cached model
let deleted = delete_cached_model(&cache_dir, "base.en");
```

## Tips

- For CJK, use presets to disable spaces and enable simple kinsoku rules.
- If you see jittery edges with noisy audio, consider VAD params like `min_silence_duration = 100 ms`.
- If segments feel too short for Whisper context, keep VAD segment merging lenient (e.g., 200 ms) while keeping the formatter's VAD oracle tight.
