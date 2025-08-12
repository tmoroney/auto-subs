use eyre::{bail, Context, Result};
use hound::{SampleFormat, WavReader};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt; // You need to bring the ShellExt trait into scope // Command is now accessed via the app handle

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// --- Helpers: stream probing and energy measurement ---
// List available audio stream indices using ffprobe.
async fn list_audio_stream_indices(app: &AppHandle, input: &PathBuf) -> eyre::Result<Vec<usize>> {
    let sidecar = app
        .shell()
        .sidecar("ffprobe")
        .context("Failed to create sidecar command for 'ffprobe'")?;
    let input_lossy = input.to_string_lossy().into_owned();
    let args = vec![
        "-v".into(),
        "error".into(),
        "-select_streams".into(),
        "a".into(),
        "-show_entries".into(),
        "stream=index".into(),
        "-of".into(),
        "csv=p=0".into(),
        input_lossy,
    ];
    let out = sidecar.args(args).output().await.context("ffprobe failed to run")?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        tracing::warn!("ffprobe stream list failed: {}", err);
        return Ok(vec![0]);
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut indices = Vec::new();
    for line in stdout.lines() {
        let t = line.trim();
        if t.is_empty() { continue; }
        if let Ok(idx) = t.parse::<usize>() { indices.push(idx); }
    }
    if indices.is_empty() { indices.push(0); }
    Ok(indices)
}

// Measure RMS energy of the first `seconds` of a specific audio stream by decoding to raw PCM via ffmpeg to stdout.
async fn measure_stream_energy(
    app: &AppHandle,
    input: &PathBuf,
    stream_idx: usize,
    seconds: u32,
) -> eyre::Result<f64> {
    let input_lossy = input.to_string_lossy().into_owned();
    let sidecar = app
        .shell()
        .sidecar("ffmpeg")
        .context("Failed to create sidecar command for 'ffmpeg'")?;
    let args = vec![
        "-nostdin".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-vn".into(),
        "-sn".into(),
        "-dn".into(),
        "-i".into(),
        input_lossy,
        "-map".into(),
        format!("a:{}", stream_idx),
        "-t".into(),
        seconds.to_string(),
        "-ac".into(),
        "1".into(),
        "-ar".into(),
        "16000".into(),
        "-f".into(),
        "s16le".into(),
        "-".into(),
    ];
    let out = sidecar.args(args).output().await.context("ffmpeg energy probe failed to run")?;
    if !out.status.success() {
        // Treat as unusable stream
        return Ok(0.0);
    }
    let pcm = &out.stdout; // little-endian i16 mono
    if pcm.len() < 2 {
        return Ok(0.0);
    }
    let mut sum_sq: f64 = 0.0;
    let mut count: usize = 0;
    for chunk in pcm.chunks_exact(2) {
        let val = i16::from_le_bytes([chunk[0], chunk[1]]) as i32;
        sum_sq += (val as f64) * (val as f64);
        count += 1;
    }
    if count == 0 { return Ok(0.0); }
    let rms = (sum_sq / count as f64).sqrt();
    Ok(rms)
}

// Pick the best audio stream index by comparing short-window RMS across all audio streams.
async fn pick_best_audio_stream(app: &AppHandle, input: &PathBuf) -> eyre::Result<Option<usize>> {
    let indices_res = list_audio_stream_indices(app, input).await;
    let indices = match indices_res {
        Ok(v) if v.len() > 1 => v,          // use reported list when multiple streams
        Ok(v) if v.len() == 1 => (0..8).collect(), // probe first 8 regardless
        _ => (0..8).collect(),               // ffprobe missing: brute-force first 8
    };
    let mut best_idx: Option<usize> = None;
    let mut best_rms: f64 = 0.0;
    for idx in indices.into_iter().take(8) { // limit to first 8 streams for performance
        let rms = measure_stream_energy(app, input, idx, 5).await.unwrap_or(0.0);
        tracing::debug!("Probe stream a:{} rms={:.2}", idx, rms);
        if rms > best_rms {
            best_rms = rms;
            best_idx = Some(idx);
        }
    }
    tracing::info!("Selected audio stream: {:?} (rms={:.2})", best_idx, best_rms);
    Ok(best_idx)
}

// This function is now an `async` Tauri command.
pub async fn normalize(
    app: AppHandle,
    input: PathBuf,
    output: PathBuf,
    additional_ffmpeg_args: Option<Vec<String>>,
) -> std::result::Result<(), String> {
    // We use a helper async function to keep using eyre's `Result` for cleaner error handling with `?`
    // and then map the final result to the `Result<(), String>` that Tauri expects for commands.
    async fn normalize_inner(
        app: &AppHandle,
        input: PathBuf,
        output: PathBuf,
        additional_ffmpeg_args: Option<Vec<String>>,
    ) -> Result<()> {
        // Ensure the output directory exists
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).context("failed to create output directory")?;
        }

        println!("Normalizing {:?} to {:?}", input, output);

        // Fast path: if input is already a 16kHz, mono, 16-bit PCM WAV, skip ffmpeg and just copy/no-op
        if input
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.eq_ignore_ascii_case("wav"))
            .unwrap_or(false)
        {
            if let Ok(reader) = WavReader::open(&input) {
                let spec = reader.spec();
                if spec.channels == 1
                    && spec.sample_format == SampleFormat::Int
                    && spec.sample_rate == 16000
                    && spec.bits_per_sample == 16
                {
                    if input == output {
                        println!("Input is already normalized WAV; skipping conversion.");
                        return Ok(());
                    } else {
                        // Ensure file handle is closed before copying
                        drop(reader);
                        fs::copy(&input, &output)
                            .context("failed to copy already-normalized WAV")?;
                        println!(
                            "Input is already normalized WAV; copied without re-encoding."
                        );
                        return Ok(());
                    }
                }
            }
        }

        // The `Command` is accessed through the `shell()` method on the app handle.
        let sidecar_command = app.shell().sidecar("ffmpeg").context(
            "Failed to create sidecar command for 'ffmpeg'. Is it configured in tauri.conf.json?",
        )?;

        let input_lossy = input.to_string_lossy().into_owned();
        let output_lossy = output.to_string_lossy().into_owned();

        // Probe for the best audio stream (highest short-window RMS)
        let best_stream = pick_best_audio_stream(app, &input).await.unwrap_or(Some(0));
        let map_arg = best_stream.map(|i| format!("a:{}", i)).unwrap_or_else(|| "a:0".into());

        // --- Argument Construction ---
        let mut args = vec![
            "-nostdin".into(),
            "-hide_banner".into(),
            "-loglevel".into(),
            "error".into(),
            "-vn".into(),
            "-sn".into(),
            "-dn".into(),
            "-i".into(),
            input_lossy,
            "-map".into(),
            map_arg,
            "-ar".into(),
            "16000".into(),
            "-ac".into(),
            "1".into(),
            "-c:a".into(),
            "pcm_s16le".into(),
            "-map_metadata".into(),
            "-1".into(),
            "-f".into(),
            "wav".into(),
            "-nostats".into(),
        ];
        // Place any extra arguments BEFORE the output path
        if let Some(ref additional_args) = additional_ffmpeg_args {
            args.extend(additional_args.clone());
        }
        // Finally, overwrite output (must come last)
        args.push("-y".into());
        args.push(output_lossy);

        tracing::debug!("Running sidecar command: ffmpeg with args: {:?}", args);

        // --- Execution ---
        // The `.output()` call is async, so we must `.await" it to get the result.
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

        // --- Post-conditions sanity checks ---
        // 1) File size must be greater than WAV header (44 bytes)
        let out_meta = fs::metadata(&output).context("failed to stat normalized output file")?;
        if out_meta.len() <= 44 {
            tracing::warn!("Normalized WAV is header-only (0 samples): {:?}", output);
        }

        // helper to open WAV and compute quick amplitude stats over multiple windows
        // Returns (is_silent_overall, total_samples_checked, max_rms_among_windows)
        fn wav_quick_silence_check(path: &PathBuf) -> eyre::Result<(bool, usize, f64)> {
            // Open once to validate and get duration
            let mut reader = WavReader::open(path)
                .context("failed to open normalized WAV for validation")?;
            let spec = reader.spec();
            // Ensure expected output format
            if !(spec.channels == 1
                && spec.sample_format == SampleFormat::Int
                && spec.sample_rate == 16000
                && spec.bits_per_sample == 16)
            {
                bail!("normalized WAV has unexpected format: {:?}", spec);
            }
            // hound::WavReader::duration() returns total samples per channel
            let total_samples = reader.duration() as usize;
            drop(reader);

            // Examine up to 3 windows: start, middle, end. Each up to 5s (80k samples)
            let window_len = (16000 * 5).min(total_samples);
            if window_len == 0 {
                return Ok((true, 0, 0.0));
            }

            let mut starts: Vec<usize> = Vec::new();
            // Start window
            starts.push(0usize);
            // Middle window
            let mid_start = total_samples.saturating_sub(window_len).min(
                total_samples.saturating_sub(window_len / 2),
            );
            let mid_start = (total_samples / 2).saturating_sub(window_len / 2).min(
                total_samples.saturating_sub(window_len),
            );
            if mid_start > 0 && mid_start + 1 < total_samples {
                starts.push(mid_start);
            }
            // End window
            let end_start = total_samples.saturating_sub(window_len);
            if end_start > 0 {
                starts.push(end_start);
            }

            // Deduplicate in case of tiny files where windows overlap
            starts.sort_unstable();
            starts.dedup();

            let mut total_checked = 0usize;
            let mut windows_silent = 0usize;
            let mut max_rms_overall = 0.0f64;

            for &start in &starts {
                let mut reader = WavReader::open(path)
                    .context("failed to reopen WAV for window scan")?;
                let mut count: usize = 0;
                let mut sum_sq: f64 = 0.0;
                let mut max_abs: i32 = 0;
                for s in reader
                    .samples::<i16>()
                    .skip(start)
                    .take(window_len)
                {
                    let v = s.context("sample")? as i32;
                    let abs = v.abs();
                    if abs > max_abs {
                        max_abs = abs;
                    }
                    sum_sq += (v as f64) * (v as f64);
                    count += 1;
                }
                total_checked += count;
                let rms = if count > 0 { (sum_sq / count as f64).sqrt() } else { 0.0 };
                if rms > max_rms_overall {
                    max_rms_overall = rms;
                }
                // Treat as (near) silence if max amplitude is extremely low and RMS very small
                // thresholds are conservative: ~1/1000 of full-scale 16-bit
                let is_window_silent = max_abs < 32 && rms < 10.0;
                if is_window_silent {
                    windows_silent += 1;
                }
            }

            // Consider overall silent only if all tested windows are silent
            let is_silent = windows_silent == starts.len();
            Ok((is_silent, total_checked, max_rms_overall))
        }

        let (is_silent, first_count, first_rms) = wav_quick_silence_check(&output)
            .unwrap_or_else(|e| {
                tracing::warn!("WAV validation failed: {}", e);
                // If we cannot validate, proceed to fallback attempt below.
                (false, 0, 0.0)
            });

        // If the output looks empty or (near) silent, attempt a fallback without '-map a:0'
        if out_meta.len() <= 44 || is_silent {
            tracing::warn!(
                "Normalized audio appears empty/silent (bytes={}, samples_checked={}, rms={:.3}). Retrying without explicit -map a:0",
                out_meta.len(),
                first_count,
                first_rms
            );

            // Re-run ffmpeg WITHOUT the strict stream mapping to let it pick the default/best audio stream.
            let input_lossy = input.to_string_lossy().into_owned();
            let output_lossy = output.to_string_lossy().into_owned();
            let mut args_fb = vec![
                "-nostdin".into(),
                "-hide_banner".into(),
                "-loglevel".into(),
                "error".into(),
                "-vn".into(),
                "-sn".into(),
                "-dn".into(),
                "-i".into(),
                input_lossy,
                "-ar".into(),
                "16000".into(),
                "-ac".into(),
                "1".into(),
                "-c:a".into(),
                "pcm_s16le".into(),
                "-map_metadata".into(),
                "-1".into(),
                "-f".into(),
                "wav".into(),
                "-nostats".into(),
            ];
            if let Some(additional_args) = additional_ffmpeg_args.clone() { args_fb.extend(additional_args); }
            args_fb.push("-y".into());
            args_fb.push(output_lossy);
            tracing::debug!("Fallback ffmpeg args (no -map a:0): {:?}", args_fb);
            let fb_out = app.shell().sidecar("ffmpeg")?.args(args_fb).output().await?;
            if !fb_out.status.success() {
                let err = String::from_utf8_lossy(&fb_out.stderr);
                bail!("ffmpeg fallback run failed: {}", err);
            }

            // Re-validate after fallback
            let out_meta2 = fs::metadata(&output).context("failed to stat fallback output file")?;
            let (is_silent2, count2, rms2) = wav_quick_silence_check(&output).unwrap_or((false, 0, 0.0));
            if out_meta2.len() <= 44 || is_silent2 {
                bail!(
                    "Audio normalization produced empty/silent audio even after fallback (bytes={}, samples_checked={}, rms={:.3}).",
                    out_meta2.len(),
                    count2,
                    rms2
                );
            }
        }

        println!("Normalization successful for {:?}", output);
        Ok(())
    }

    // Call the inner async function and map any error to a String for Tauri.
    normalize_inner(&app, input, output, additional_ffmpeg_args)
        .await
        .map_err(|e| e.to_string())
}

// Uses ffprobe to get duration of any audio/video file (async, Tauri sidecar)
pub async fn get_audio_duration(app: AppHandle, path: String) -> std::result::Result<f64, String> {
    use eyre::Context;
    // Prepare ffprobe sidecar
    let sidecar_command = app
        .shell()
        .sidecar("ffprobe")
        .context(
            "Failed to create sidecar command for 'ffprobe'. Is it configured in tauri.conf.json?",
        )
        .map_err(|e| e.to_string())?;

    let args = vec![
        "-v".to_string(),
        "error".to_string(),
        "-show_entries".to_string(),
        "format=duration".to_string(),
        "-of".to_string(),
        "default=noprint_wrappers=1:nokey=1".to_string(),
        path.clone(),
    ];

    let output_result = sidecar_command
        .args(args)
        .output()
        .await
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
    let duration = duration_str.parse::<f64>().map_err(|e| {
        format!(
            "Failed to parse ffprobe duration output '{}': {}",
            duration_str, e
        )
    })?;
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

    reader
        .into_samples::<i16>()
        .map(|x| x.context("sample"))
        .collect()
}
