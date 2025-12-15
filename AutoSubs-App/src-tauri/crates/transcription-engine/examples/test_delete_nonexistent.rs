use transcription_engine::delete_cached_model;
use std::path::Path;

fn main() {
    let cache_dir = Path::new("./cache");
    
    println!("Testing deletion of non-existent model...");
    
    let deleted = delete_cached_model(cache_dir, "high.en");
    
    if deleted {
        println!("Unexpected: Successfully deleted non-existent model");
    } else {
        println!("Expected: Failed to delete non-existent model (returned false)");
    }
}
