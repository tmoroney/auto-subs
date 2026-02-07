use transcription_engine::{Engine, EngineConfig, Callbacks, ProgressType};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Install logging hooks to reduce noise
    whisper_rs::install_logging_hooks();
    
    let callbacks = Callbacks {
        progress: Some(&|percent: i32, progress_type: ProgressType, label: &str| {
            match progress_type {
                ProgressType::Download => {
                    println!("📥 Download: {}% - {}", percent, label);
                }
                ProgressType::Diarize => {
                    if percent == 100 || percent % 25 == 0 {
                        println!("🗣️ Diarize: {}% - {}", percent, label);
                    }
                }
                ProgressType::Transcribe => {
                    if percent == 100 || percent % 25 == 0 {
                        println!("🎵 Transcribe: {}% - {}", percent, label);
                    }
                }
                ProgressType::Translate => {
                    if percent == 100 || percent % 25 == 0 {
                        println!("🌍 Translate: {}% - {}", percent, label);
                    }
                }
            }
        }),
        new_segment_callback: Some(&|segment| {
            println!("📝 Original ( English): {}", segment.text);
        }),
        is_cancelled: None,
    };
    
    // Create engine
    let config = EngineConfig::default();
    let mut engine = Engine::new(config);
    
    println!("🎯 Testing transcription and translation of example.wav...");
    println!("📁 File: example.wav (English audio)");
    println!("🌐 Target language: Spanish");
    println!("📋 Model: tiny.en");
    println!();
    
    // Transcribe with translation to Spanish
    let segments = engine.transcribe_audio(
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
    
    println!();
    println!("✅ Transcription and translation complete!");
    println!();
    println!("📊 Results:");
    println!("   Total segments: {}", segments.len());
    
    for (i, segment) in segments.iter().enumerate() {
        println!();
        println!("🎬 Segment {} ({}s - {}s):", i + 1, segment.start, segment.end);
        println!("   🇪🇸 Spanish: {}", segment.text);
    }
    
    Ok(())
}
