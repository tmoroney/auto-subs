use tauri::{AppHandle, Runtime, Manager};

/// Gets the cache directory for whisper-diarize-rs models
pub fn get_cache_dir<R: Runtime>(app: AppHandle<R>) -> Result<std::path::PathBuf, String> {
    let model_dir = app
        .path()
        .app_cache_dir()
        .map_err(|_| "Failed to get cache directory".to_string())?
        .join("models");

    std::fs::create_dir_all(&model_dir)
        .map_err(|e| format!("Failed to create model cache directory: {}", e))?;

    Ok(model_dir)
}

/// Lists all downloaded Whisper models from the whisper-diarize-rs cache
#[tauri::command]
pub fn get_downloaded_models<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, String> {
    let model_dir = get_cache_dir(app)?;
    
    let models = whisper_diarize_rs::list_cached_models(&model_dir)
    .map_err(|e| format!("Failed to list cached models: {}", e))?;
    
    Ok(models)
}

/// Deletes a specific Whisper model from the whisper-diarize-rs cache
#[tauri::command]
pub fn delete_model<R: Runtime>(model: &str, app: AppHandle<R>) -> Result<(), String> {
    let model_dir = get_cache_dir(app)?;
    
    let deleted = whisper_diarize_rs::delete_cached_model(&model_dir, model);
    if deleted {
        Ok(())
    } else {
        Err(format!("Failed to delete model '{}' (model may not exist)", model))
    }
}
