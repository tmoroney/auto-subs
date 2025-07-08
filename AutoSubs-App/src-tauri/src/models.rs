use hf_hub::{api::sync::Api, Cache};
use std::io::copy;
use std::path::PathBuf;

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
        .with_cache_dir(model_cache)
        .build()
        .map_err(|e| e.to_string())?;
    let repo = api.model("ggerganov/whisper.cpp".to_string());

    let model_path = repo.get(&filename).map_err(|e| e.to_string())?;

    println!("Model path is: {:?}", model_path);
    Ok(model_path)
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
