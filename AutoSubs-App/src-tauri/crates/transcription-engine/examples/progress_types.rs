use transcription_engine::{Engine, EngineConfig, Callbacks, ProgressType};
use std::sync::atomic::{AtomicU32, Ordering};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Use static atomic counters for the callback
    static DOWNLOAD_COUNT: AtomicU32 = AtomicU32::new(0);
    static DIARIZE_COUNT: AtomicU32 = AtomicU32::new(0);
    static TRANSCRIBE_COUNT: AtomicU32 = AtomicU32::new(0);
    static TRANSLATE_COUNT: AtomicU32 = AtomicU32::new(0);
    
    let callbacks = Callbacks {
        progress: Some(&|percent: i32, progress_type: ProgressType, label: &str| {
            match progress_type {
                ProgressType::Download => {
                    let count = DOWNLOAD_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                    println!("[DOWNLOAD #{}] {}%: {}", count, percent, label);
                }
                ProgressType::Diarize => {
                    let count = DIARIZE_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                    println!("[DIARIZE #{}] {}%: {}", count, percent, label);
                }
                ProgressType::Transcribe => {
                    let count = TRANSCRIBE_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                    println!("[TRANSCRIBE #{}] {}%: {}", count, percent, label);
                }
                ProgressType::Translate => {
                    let count = TRANSLATE_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                    println!("[TRANSLATE #{}] {}%: {}", count, percent, label);
                }
            }
        }),
        new_segment_callback: None,
        is_cancelled: None,
    };
    
    // Create engine with default cache
    let config = EngineConfig::default();
    let mut engine = Engine::new(config);
    
    println!("Starting transcription with progress type tracking...");
    println!("Note: Models will be downloaded if not cached");
    
    // Transcribe the audio file (this will trigger downloads if needed)
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
    
    println!("\nProgress summary:");
    println!("Download progress updates: {}", DOWNLOAD_COUNT.load(Ordering::Relaxed));
    println!("Diarize progress updates: {}", DIARIZE_COUNT.load(Ordering::Relaxed));
    println!("Transcribe progress updates: {}", TRANSCRIBE_COUNT.load(Ordering::Relaxed));
    println!("Translate progress updates: {}", TRANSLATE_COUNT.load(Ordering::Relaxed));
    
    Ok(())
}
