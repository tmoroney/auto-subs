# Transcription Engine

Whisper-rs, transcribe-rs ONNX engines, and AutoSubs' diarization/VAD pipeline with subtitle formatting.

## Quickstart

```rust
use transcription_engine::{
    Callbacks, ContentFormatting, Engine, EngineConfig, ProgressType, Segment, TextCase,
    TranscribeOptions,
};

#[tokio::main]
async fn main() -> eyre::Result<()> {
    whisper_rs::install_logging_hooks();

    let mut engine = Engine::new(EngineConfig::default());

    let options = TranscribeOptions {
        model: "base.en".into(),
        lang: Some("en".into()),
        enable_vad: Some(true),
        ..Default::default()
    };

    fn on_new_segment(seg: &Segment) {
        println!("{}", seg.text);
    }

    fn on_progress(percent: i32, ty: ProgressType, label: &str) {
        println!("{label}: {percent}% ({ty:?})");
    }

    let callbacks = Callbacks {
        progress: Some(&on_progress),
        new_segment_callback: Some(&on_new_segment),
        is_cancelled: None,
    };

    let (segments, formatted_segments, language) = engine
        .transcribe_audio(
            "./audio.wav",
            options,
            Some(2),
            None,
            None,
            Some(ContentFormatting {
                text_case: TextCase::None,
                remove_punctuation: false,
                censored_words: vec![],
            }),
            Some(callbacks),
        )
        .await?;

    println!("segments: {}, cues: {}, language: {}", segments.len(), formatted_segments.len(), language);
    Ok(())
}
```

## Formatting only

If you already have `Vec<Segment>`, call the formatter directly:

```rust
use transcription_engine::{process_segments, PostProcessConfig};

let cfg = PostProcessConfig::for_language("en");
let cues = process_segments(&segments, &cfg);
```

## Translation

Set `translate_target` on `TranscribeOptions`. The engine will use native translation when available and fall back to Google Translate otherwise.

## Notes

- `Engine::transcribe_audio` returns `(original_segments, formatted_segments, output_language)`.
- `ContentFormatting` controls text case, punctuation stripping, and censored words.
- `PostProcessConfig` can be tuned directly if you need custom line/length limits.
