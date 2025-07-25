use eyre::{bail, Context, Result};
use hound::{SampleFormat, WavReader};
use std::fs;
use std::{path::PathBuf};
use tauri_plugin_shell::ShellExt; // You need to bring the ShellExt trait into scope
use tauri::AppHandle; // Command is now accessed via the app handle

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// This function is now an `async` Tauri command.
pub async fn normalize(app: AppHandle, input: PathBuf, output: PathBuf, additional_ffmpeg_args: Option<Vec<String>>) -> std::result::Result<(), String> {
    // We use a helper async function to keep using eyre's `Result` for cleaner error handling with `?`
    // and then map the final result to the `Result<(), String>` that Tauri expects for commands.
    async fn normalize_inner(app: &AppHandle, input: PathBuf, output: PathBuf, additional_ffmpeg_args: Option<Vec<String>>) -> Result<()> {
        // Ensure the output directory exists
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).context("failed to create output directory")?;
        }

        println!("Normalizing {:?} to {:?}", input, output);

        // The `Command` is accessed through the `shell()` method on the app handle.
        let sidecar_command = app.shell()
            .sidecar("ffmpeg")
            .context("Failed to create sidecar command for 'ffmpeg'. Is it configured in tauri.conf.json?")?;

        // --- Argument Construction ---
        let mut args = vec![
            "-i".to_string(),
            input.to_str().expect("Input path contains invalid UTF-8").to_string(),
            "-ar".to_string(),
            "16000".to_string(),
            "-ac".to_string(),
            "1".to_string(),
            "-c:a".to_string(),
            "pcm_s16le".to_string(),
            "-map_metadata".to_string(),
            "-1".to_string(),
        ];

        // Add any extra arguments if they exist
        if let Some(additional_args) = additional_ffmpeg_args {
            args.extend(additional_args);
        }

        // Add final arguments
        args.extend(vec![
            output.to_str().expect("Output path contains invalid UTF-8").to_string(),
            "-hide_banner".to_string(),
            "-y".to_string(),
            "-loglevel".to_string(),
            "error".to_string(),
        ]);

        tracing::debug!("Running sidecar command: ffmpeg with args: {:?}", args);

        // --- Execution ---
        // The `.output()` call is async, so we must `.await` it to get the result.
        let output_result = sidecar_command.args(args).output().await?;

        // --- Error Handling ---
        if !output_result.status.success() {
            let error_message = String::from_utf8_lossy(&output_result.stderr);
            bail!(
                "ffmpeg sidecar process failed with exit code: {:?}\nStderr: {}",
                output_result.status.code(),
                error_message
            );
        }

        // Final check to ensure the file was actually created
        if !output.exists() {
            bail!("ffmpeg seemed to succeed, but the output file was not created.");
        }

        println!("Normalization successful for {:?}", output);
        Ok(())
    }

    // Call the inner async function and map any error to a String for Tauri.
    normalize_inner(&app, input, output, additional_ffmpeg_args).await.map_err(|e| e.to_string())
}


// Uses ffprobe to get duration of any audio/video file (async, Tauri sidecar)
pub async fn get_audio_duration(app: AppHandle, path: String) -> std::result::Result<f64, String> {
    use eyre::Context;
    // Prepare ffprobe sidecar
    let sidecar_command = app.shell()
        .sidecar("ffprobe")
        .context("Failed to create sidecar command for 'ffprobe'. Is it configured in tauri.conf.json?")
        .map_err(|e| e.to_string())?;

    let args = vec![
        "-v".to_string(), "error".to_string(),
        "-show_entries".to_string(), "format=duration".to_string(),
        "-of".to_string(), "default=noprint_wrappers=1:nokey=1".to_string(),
        path.clone(),
    ];

    let output_result = sidecar_command.args(args).output().await
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output_result.status.success() {
        let error_message = String::from_utf8_lossy(&output_result.stderr);
        return Err(format!(
            "ffprobe failed with exit code: {:?}\nStderr: {}",
            output_result.status.code(),
            error_message
        ));
    }

    let stdout = String::from_utf8_lossy(&output_result.stdout);
    let duration_str = stdout.trim();
    let duration = duration_str.parse::<f64>().map_err(|e| format!(
        "Failed to parse ffprobe duration output '{}': {}", duration_str, e
    ))?;
    Ok(duration)
}


pub fn parse_wav_file(path: &PathBuf) -> Result<Vec<i16>> {
    tracing::debug!("wav reader read from {:?}", path);
    let reader = WavReader::open(path).context("failed to read file")?;
    tracing::debug!("parsing {}", path.display());

    let channels = reader.spec().channels;
    if reader.spec().channels != 1 {
        bail!("expected mono audio file and found {} channels!", channels);
    }
    if reader.spec().sample_format != SampleFormat::Int {
        bail!("expected integer sample format");
    }
    if reader.spec().sample_rate != 16000 {
        bail!("expected 16KHz sample rate");
    }
    if reader.spec().bits_per_sample != 16 {
        bail!("expected 16 bits per sample");
    }

    reader.into_samples::<i16>().map(|x| x.context("sample")).collect()
}