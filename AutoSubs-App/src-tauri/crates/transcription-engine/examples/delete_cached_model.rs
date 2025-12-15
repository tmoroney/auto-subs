use transcription_engine::{list_cached_models, delete_cached_model};
use std::path::Path;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cache_dir = Path::new("./cache");
    
    println!("Checking for cached Whisper models in: {}", cache_dir.display());
    
    // List models before deletion
    let models_before = list_cached_models(cache_dir)?;
    if models_before.is_empty() {
        println!("No cached Whisper models found.");
        return Ok(());
    }
    
    println!("Found {} cached Whisper model(s):", models_before.len());
    for model in &models_before {
        println!("  - {}", model);
    }
    
    // Example: delete the first model (if any exist)
    if let Some(model_to_delete) = models_before.first() {
        println!("\nAttempting to delete model: {}", model_to_delete);
        
        let deleted = delete_cached_model(cache_dir, model_to_delete);
        
        if deleted {
            println!("Successfully deleted model: {}", model_to_delete);
        } else {
            println!("Failed to delete model: {} (model may not exist or deletion failed)", model_to_delete);
        }
        
        // List models after deletion
        println!("\nChecking models after deletion:");
        let models_after = list_cached_models(cache_dir)?;
        if models_after.is_empty() {
            println!("No cached Whisper models found.");
        } else {
            println!("Found {} cached Whisper model(s):", models_after.len());
            for model in &models_after {
                println!("  - {}", model);
            }
        }
    }
    
    Ok(())
}
