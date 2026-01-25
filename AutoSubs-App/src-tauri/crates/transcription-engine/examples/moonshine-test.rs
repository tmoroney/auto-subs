use transcription_engine::{Callbacks, Engine, EngineConfig, FormattingOverrides, ProgressType, Segment, TranscribeOptions};
use eyre::Result;

#[tokio::main]
async fn main() -> Result<(), eyre::Report> {
    let audio_path = std::env::args().nth(1).expect("Please specify audio file");
    let mut engine = Engine::new(EngineConfig::default());

    let mut options = TranscribeOptions::default();
    options.model = "moonshine-tiny".into();
    options.lang = Some("auto".into());
    options.enable_vad = Some(true);
    options.enable_diarize = Some(true);
    //options.translate_target = Some("en".into());
    //options.whisper_to_english = Some(true);

    fn on_new_segment(segment: &Segment) {
        println!("new segment: {}", segment.text);
    }

    fn on_progress(p: i32, progress_type: ProgressType, label: &str) {
        match progress_type {
            ProgressType::Download => print!("📥 "),
            ProgressType::Transcribe => print!("🎵 "),
            ProgressType::Translate => print!("🌍 "),
        }
        println!("{}: {}%", label, p);
    }

    let callbacks = Callbacks {
        progress: Some(&on_progress),
        new_segment_callback: Some(&on_new_segment),
        is_cancelled: None,
    };

    let overrides = FormattingOverrides {
        max_chars_per_line: Some(20),
        max_lines: Some(2),
        ..Default::default()
    };

    let segments = engine
        .transcribe_audio(&audio_path, options, Some(overrides), Some(callbacks))
        .await?;

    println!("Transcribed {} segments", segments.len());

    let json = serde_json::to_string_pretty(&segments)?;
    std::fs::write("moonshine-segments.json", json)?;

    Ok(())
}
