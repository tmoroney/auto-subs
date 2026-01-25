use transcription_engine::{Engine, EngineConfig, Callbacks, ProgressType};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Simple callback that handles both progress types differently
    let callbacks = Callbacks {
        progress: Some(&|percent: i32, progress_type: ProgressType, label: &str| {
            match progress_type {
                ProgressType::Download => {
                    // Show download progress with a spinner emoji
                    print!("📥 {}%: {}\r", percent, label);
                }
                ProgressType::Transcribe => {
                    // Show transcription progress with a sound emoji
                    print!("🎵 {}%: {}\r", percent, label);
                }
                ProgressType::Translate => {
                    // Show translation progress with a globe emoji
                    print!("🌍 {}%: {}\r", percent, label);
                }
            }
            std::io::Write::flush(&mut std::io::stdout()).ok();
        }),
        new_segment_callback: None,
        is_cancelled: None,
    };
    
    // Create engine
    let config = EngineConfig::default();
    let mut engine = Engine::new(config);
    
    println!("Starting simple progress example...");
    println!("Downloads will use 📥 emoji, transcription will use 🎵 emoji, translation will use 🌍 emoji");
    println!();
    
    // Transcribe with the new progress type system
    let _segments = engine.transcribe_audio(
        "example.wav",
        transcription_engine::TranscribeOptions {
            model: "tiny.en".to_string(),
            lang: Some("en".to_string()),
            ..Default::default()
        },
        None,
        Some(callbacks),
    ).await?;
    
    println!("\n✅ Transcription complete!");
    
    Ok(())
}
