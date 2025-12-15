use transcription_engine::{Engine, EngineConfig, Callbacks, ProgressType};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let callbacks = Callbacks {
        progress: Some(&|percent: i32, progress_type: ProgressType, label: &str| {
            match progress_type {
                ProgressType::Download => {
                    println!("📥 Download: {}% - {}", percent, label);
                }
                ProgressType::Transcribe => {
                    println!("🎵 Transcribe: {}% - {}", percent, label);
                }
                ProgressType::Translate => {
                    println!("🌍 Translate: {}% - {}", percent, label);
                }
            }
        }),
        new_segment_callback: None,
        is_cancelled: None,
    };
    
    // Create engine
    let config = EngineConfig::default();
    let mut engine = Engine::new(config);
    
    println!("Testing progress types with translation...");
    println!("Note: This example demonstrates all three progress types");
    println!();
    
    // Transcribe with translation to trigger Translate progress type
    let _segments = engine.transcribe_audio(
        "example.wav",
        transcription_engine::TranscribeOptions {
            model: "tiny.en".to_string(),
            lang: Some("en".to_string()),
            translate_target: Some("es".to_string()), // Translate to Spanish
            ..Default::default()
        },
        None,
        Some(callbacks),
    ).await?;
    
    println!("\n✅ Transcription with translation complete!");
    
    Ok(())
}
