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
    
    let models = transcription_engine::list_cached_models(&model_dir)
    .map_err(|e| format!("Failed to list cached models: {}", e))?;
    
    Ok(models)
}

/// Deletes a specific Whisper model from the whisper-diarize-rs cache
#[tauri::command]
pub fn delete_model<R: Runtime>(model: &str, app: AppHandle<R>) -> Result<(), String> {
    let model_dir = get_cache_dir(app)?;
    
    let deleted = transcription_engine::delete_cached_model(&model_dir, model);
    if deleted {
        Ok(())
    } else {
        Err(format!("Failed to delete model '{}' (model may not exist)", model))
    }
}

/// What the header of an imported Whisper model file says about it.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperModelInfo {
    /// Whether the model transcribes more than English.
    pub multilingual: bool,
    /// The whisper.cpp model it was built from, or `None` when the shape is
    /// unknown (word timing is then turned off for it).
    pub base_model: Option<String>,
}

/// Checks that `path` is a complete whisper.cpp GGML model and reads its
/// header. Errors are stable codes (`model_file_not_found`,
/// `model_file_not_ggml`, `model_file_incomplete`, `model_file_unreadable`)
/// that the frontend translates.
#[tauri::command]
pub async fn inspect_whisper_model(path: String) -> Result<WhisperModelInfo, String> {
    // Walking a large model's tensor table touches the disk; keep it off the
    // main thread.
    let header = tauri::async_runtime::spawn_blocking(move || {
        transcription_engine::ggml_header::WhisperHeader::inspect(std::path::Path::new(&path))
    })
    .await
    .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(WhisperModelInfo {
        multilingual: header.is_multilingual(),
        base_model: header.base_model().map(str::to_string),
    })
}
