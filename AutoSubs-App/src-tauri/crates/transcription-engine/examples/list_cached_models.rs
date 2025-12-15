use transcription_engine::list_cached_models;
use std::path::Path;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Use default cache directory "./cache"
    let cache_dir = Path::new("./cache");
    
    println!("Checking for cached Whisper models in: {}", cache_dir.display());
    
    let models = list_cached_models(cache_dir)?;
    
    if models.is_empty() {
        println!("No cached Whisper models found.");
    } else {
        println!("Found {} cached Whisper model(s):", models.len());
        for model in models {
            println!("  - {}", model);
        }
    }
    
    Ok(())
}
