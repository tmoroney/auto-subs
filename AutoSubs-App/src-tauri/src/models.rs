use hf_hub::{api::sync::Api, Cache};
use std::io::copy;
use std::path::PathBuf;
use tauri::command;
use zip::ZipArchive;

/// Returns the path to the app's model cache directory, creating it if it doesn't exist.
fn get_model_cache_dir() -> Result<PathBuf, String> {
    let cache_dir = dirs::cache_dir().ok_or_else(|| "Failed to get cache directory".to_string())?;
    let model_dir = cache_dir.join("AutoSubs").join("models");
    if !model_dir.exists() {
        std::fs::create_dir_all(&model_dir)
            .map_err(|e| format!("Failed to create model cache directory: {}", e))?;
    }
    Ok(model_dir)
}

fn get_filename(model: &str, lang: &Option<String>) -> String {
    let model_name = if model == "large" { "large-v3" } else { model };
    let is_en = lang.as_deref().map_or(true, |l| l.eq_ignore_ascii_case("en"));
    if is_en && model_name != "large-v3" {
        format!("ggml-{}.en.bin", model_name)
    } else {
        format!("ggml-{}.bin", model_name)
    }
}

/// Checks if a model exists in the cache, and if not, downloads it from the Hugging Face Hub.
/// Returns the path to the model file in the cache.
pub fn download_model_if_needed(model: &str, lang: &Option<String>) -> Result<PathBuf, String> {
    let filename = get_filename(model, lang);
    let model_cache = get_model_cache_dir()?;

    println!("Checking for model '{}' in cache...", filename);

    let api = hf_hub::api::sync::ApiBuilder::new()
        .with_cache_dir(model_cache.clone())
        .build()
        .map_err(|e| e.to_string())?;
    let repo = api.model("ggerganov/whisper.cpp".to_string());

    let model_path = repo.get(&filename).map_err(|e| e.to_string())?;

    // If on mac, also download the corresponding coreml encoder if it exists
    #[cfg(target_os = "macos")]
    {
        let is_en = lang.as_deref().map_or(true, |l| l.eq_ignore_ascii_case("en"));
        let model_name = if model == "large" { "large-v3" } else { model };
        // Only attempt for models that have coreml encoders (usually not "large")
        if model_name != "large-v3" {
            let coreml_file = if is_en {
                format!("ggml-{}.en-encoder.mlmodelc.zip", model_name)
            } else {
                format!("ggml-{}-encoder.mlmodelc.zip", model_name)
            };
            // Reuse the same repo since it's the same repository
            let coreml_zip_path = repo.get(&coreml_file).map_err(|e| e.to_string())?;
            println!("CoreML encoder zip path is: {:?}", coreml_zip_path);
            
            // Extract the zip file to the same directory
            let extract_dir = coreml_zip_path.parent().ok_or("Failed to get parent directory")?;
            let coreml_extracted_name = coreml_file.trim_end_matches(".zip");
            let coreml_extracted_path = extract_dir.join(coreml_extracted_name);
            
            // Only extract if not already extracted
            if !coreml_extracted_path.exists() {
                println!("Extracting CoreML encoder to: {:?}", coreml_extracted_path);
                let file = std::fs::File::open(&coreml_zip_path).map_err(|e| e.to_string())?;
                let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
                archive.extract(extract_dir).map_err(|e| e.to_string())?;
                println!("CoreML encoder extracted successfully");
            } else {
                println!("CoreML encoder already extracted at: {:?}", coreml_extracted_path);
            }
        }
    }

    println!("Model path is: {:?}", model_path);
    Ok(model_path)
}

#[command]
pub fn get_downloaded_models() -> Result<Vec<String>, String> {
    use std::fs;
    let model_cache = get_model_cache_dir()?;
    let snapshots_dir = model_cache.join("models--ggerganov--whisper.cpp").join("snapshots");
    let mut models = Vec::new();
    for entry in fs::read_dir(&snapshots_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            for file in fs::read_dir(entry.path()).map_err(|e| e.to_string())? {
                let file = file.map_err(|e| e.to_string())?;
                // Use symlink_metadata to detect both symlinks and files
                let metadata = fs::symlink_metadata(file.path()).map_err(|e| e.to_string())?;
                if metadata.is_file() || metadata.file_type().is_symlink() {
                    let file_name = file.file_name();
                    if let Some(name) = file_name.to_str() {
                        if name.ends_with(".bin") {
                            models.push(name.to_string());
                        }
                    }
                }
            }
        }
    }
    Ok(models)
}

/// Returns the path to the app's diarize model cache directory, creating it if it doesn't exist.
fn get_diarize_model_cache_dir() -> Result<PathBuf, String> {
    let cache_dir = dirs::cache_dir().ok_or_else(|| "Failed to get cache directory".to_string())?;
    let model_dir = cache_dir.join("AutoSubs").join("models");
    if !model_dir.exists() {
        std::fs::create_dir_all(&model_dir)
            .map_err(|e| format!("Failed to create diarize model cache directory: {}", e))?;
    }
    Ok(model_dir)
}

/// Downloads a file from a URL to a local cache if it doesn't already exist.
pub async fn download_diarize_model_if_needed(file_name: &str, url: &str) -> Result<PathBuf, String> {
    let cache_dir = get_diarize_model_cache_dir()?;
    let local_path = cache_dir.join(file_name);

    if local_path.exists() {
        println!("Diarize model '{}' found locally.", file_name);
        return Ok(local_path);
    }

    println!("Diarize model '{}' not found. Downloading from {}...", file_name, url);

    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to download diarize model '{}': {}", file_name, e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download diarize model '{}': received status {}",
            file_name,
            response.status()
        ));
    }

    let mut dest = std::fs::File::create(&local_path)
        .map_err(|e| format!("Failed to create file for diarize model: {}", e))?;
    let content = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read downloaded diarize model bytes: {}", e))?;

    copy(&mut content.as_ref(), &mut dest)
        .map_err(|e| format!("Failed to write diarize model to file: {}", e))?;

    println!(
        "Diarize model '{}' downloaded successfully to {:?}.",
        file_name,
        local_path
    );
    Ok(local_path)
}
