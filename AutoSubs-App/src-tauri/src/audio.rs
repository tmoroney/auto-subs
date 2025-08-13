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

// Lightweight checksum over i16 samples using 64-bit FNV-1a
pub fn hash_samples(samples: &[i16], max_samples: usize) -> u64 {
    const FNV_OFFSET: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x100000001b3;
    let mut hash = FNV_OFFSET;
    let mut count = 0usize;
    for &s in samples.iter() {
        if count >= max_samples { break; }
        // feed as little-endian bytes to be stable across platforms
        let b0 = (s as u16 & 0x00FF) as u8;
        let b1 = ((s as u16 >> 8) & 0x00FF) as u8;
        hash ^= b0 as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
        hash ^= b1 as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
        count += 1;
    }
    hash
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

        // Log input file metadata for diagnostics
        if let Ok(meta) = fs::metadata(&input) {
            let modified = meta.modified().ok();
            tracing::info!(
                "Input file metadata: size={} bytes, modified={:?}",
                meta.len(),
                modified
            );
        }

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
        
        // Diagnostics: probe available audio streams and measure short RMS per stream (no behavior change)
        match list_audio_stream_indices(app, &input).await {
            Ok(idxs) => {
                tracing::info!("ffprobe audio streams detected: {:?}", idxs);
                for idx in idxs.iter().take(6) {
                    match measure_stream_energy(app, &input, *idx, 5).await {
                        Ok(r) => tracing::info!("stream a:{} rms={:.2}", idx, r),
                        Err(e) => tracing::debug!("stream a:{} rms probe failed: {}", idx, e),
                    }
                }
            }
            Err(e) => tracing::warn!("ffprobe stream probe failed: {}", e),
        }

        // --- Minimal conversion: mono 16kHz PCM16 WAV (simple mode enabled by default) ---
        // No explicit stream mapping; let ffmpeg choose the default audio stream.
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

        tracing::info!("Audio normalization: SIMPLE MODE active (mono 16kHz PCM16, no stream mapping, no normalization)");
        tracing::debug!("Running sidecar command: ffmpeg with args: {:?}", args);

        // --- Execution ---
        // The `.output()` call is async, so we must `.await" it to get the result.
        let output_result = sidecar_command.args(args).output().await?;

        // Log ffmpeg stdout/stderr for diagnostics even on success
        tracing::debug!(
            "ffmpeg completed: stdout_bytes={}, stderr_bytes={}",
            output_result.stdout.len(),
            output_result.stderr.len()
        );
        if !output_result.stdout.is_empty() {
            tracing::debug!("ffmpeg stdout: {}", String::from_utf8_lossy(&output_result.stdout));
        }
        if !output_result.stderr.is_empty() {
            tracing::debug!("ffmpeg stderr: {}", String::from_utf8_lossy(&output_result.stderr));
        }

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

        // Post-normalization WAV stats for diagnostics
        if let Ok(reader) = WavReader::open(&output) {
            let spec = reader.spec();
            tracing::info!(
                "Normalized WAV spec: channels={}, rate={}, bits_per_sample={}, sample_format={:?}",
                spec.channels,
                spec.sample_rate,
                spec.bits_per_sample,
                spec.sample_format
            );
            let samples: Vec<i16> = reader
                .into_samples::<i16>()
                .filter_map(|s| s.ok())
                .collect();
            let n = samples.len();
            let mut min_v: i32 = i16::MAX as i32;
            let mut max_v: i32 = i16::MIN as i32;
            let mut sum: f64 = 0.0;
            let mut sum_sq: f64 = 0.0;
            let mut zeros: usize = 0;
            for &s in &samples {
                let v = s as i32;
                if v < min_v { min_v = v; }
                if v > max_v { max_v = v; }
                sum += v as f64;
                sum_sq += (v as f64) * (v as f64);
                if v == 0 { zeros += 1; }
            }
            let mean = if n > 0 { sum / n as f64 } else { 0.0 };
            let rms = if n > 0 { (sum_sq / n as f64).sqrt() } else { 0.0 };
            let zero_frac = if n > 0 { zeros as f64 / n as f64 } else { 0.0 };
            let duration_sec = if spec.sample_rate > 0 { n as f64 / spec.sample_rate as f64 } else { 0.0 };
            // Compute checksum over first 5 seconds (or all samples)
            let max_hash_samples = if spec.sample_rate > 0 {
                usize::min(n, (spec.sample_rate as usize).saturating_mul(5))
            } else { n };
            let checksum = crate::audio::hash_samples(&samples, max_hash_samples);
            tracing::info!(
                "Normalized WAV stats: samples={}, dur={:.2}s, rms={:.2}, min={}, max={}, mean={:.2}, zero_frac={:.3}, checksum_5s=0x{:016x}",
                n, duration_sec, rms, min_v, max_v, mean, zero_frac, checksum
            );
            if n >= 10 {
                let preview: Vec<i16> = samples.iter().take(10).cloned().collect();
                tracing::debug!("First 10 samples: {:?}", preview);
            }
            if n == 0 || rms == 0.0 {
                tracing::warn!(
                    "Normalized WAV appears silent or empty (rms={:.2}, samples={})",
                    rms, n
                );
            }
        }

        // Simple mode: skip silence checks and stream-mapping fallbacks.
        // We intentionally do not probe or remap streams here to reduce variables during debugging.

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

// Robust decoder: use ffmpeg sidecar to decode any WAV to mono 16k PCM16 (s16le) and return samples.
// This serves as a fallback in case WAV headers/metadata or reader quirks cause silent or truncated audio.
pub async fn decode_pcm_mono16k_from_wav(
    app: tauri::AppHandle,
    path: PathBuf,
)
-> Result<Vec<i16>> {
    use tauri::Manager;

    // Try fast path via hound first
    let parsed = parse_wav_file(&path);
    if let Ok(samples) = parsed.as_ref() {
        let n = samples.len();
        let mut sum_sq: f64 = 0.0;
        let mut zeros: usize = 0;
        let mut min_v: i32 = i16::MAX as i32;
        let mut max_v: i32 = i16::MIN as i32;
        for &s in samples.iter() {
            let v = s as i32;
            if v < min_v { min_v = v; }
            if v > max_v { max_v = v; }
            sum_sq += (v as f64) * (v as f64);
            if v == 0 { zeros += 1; }
        }
        let rms = if n > 0 { (sum_sq / n as f64).sqrt() } else { 0.0 };
        let zero_frac = if n > 0 { zeros as f64 / n as f64 } else { 0.0 };
        let duration_sec = n as f64 / 16000.0;
        let checksum = hash_samples(samples, (16000usize).saturating_mul(5));
        tracing::info!(
            "Parsed WAV (hound) stats: samples={}, dur={:.2}s, rms={:.2}, min={}, max={}, zero_frac={:.3}, checksum_5s=0x{:016x}",
            n, duration_sec, rms, min_v, max_v, zero_frac, checksum
        );
        // If audio looks healthy, return immediately
        if n > 0 && rms > 0.5 && zero_frac < 0.98 {
            return Ok(samples.clone());
        } else {
            tracing::warn!(
                "Parsed WAV appears suspicious (rms={:.2}, zeros={:.3}). Falling back to ffmpeg raw decode for {:?}",
                rms, zero_frac, path
            );
        }
    } else if let Err(e) = parsed {
        tracing::warn!("Hound parse failed for {:?}: {}. Falling back to ffmpeg raw decode.", path, e);
    }

    // Fallback: decode via ffmpeg to raw s16le mono 16k
    let input_lossy = path.to_string_lossy().into_owned();
    let sidecar = app
        .shell()
        .sidecar("ffmpeg")
        .context("Failed to create sidecar command for 'ffmpeg' (fallback decode)")?;
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
        "-ar".into(),
        "16000".into(),
        "-ac".into(),
        "1".into(),
        "-f".into(),
        "s16le".into(),
        "-".into(),
    ];
    let out = sidecar
        .args(args)
        .output()
        .await
        .context("ffmpeg raw decode failed to run")?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        bail!("ffmpeg raw decode exited non-zero: {}", stderr);
    }
    let pcm = out.stdout;
    if pcm.len() < 2 {
        bail!("ffmpeg raw decode produced empty audio");
    }
    let mut samples = Vec::with_capacity(pcm.len() / 2);
    for chunk in pcm.chunks_exact(2) {
        samples.push(i16::from_le_bytes([chunk[0], chunk[1]]));
    }

    // Log stats/checksum for the ffmpeg-decoded samples
    let n = samples.len();
    let mut sum_sq: f64 = 0.0;
    let mut zeros: usize = 0;
    let mut min_v: i32 = i16::MAX as i32;
    let mut max_v: i32 = i16::MIN as i32;
    for &s in samples.iter() {
        let v = s as i32;
        if v < min_v { min_v = v; }
        if v > max_v { max_v = v; }
        sum_sq += (v as f64) * (v as f64);
        if v == 0 { zeros += 1; }
    }
    let rms = if n > 0 { (sum_sq / n as f64).sqrt() } else { 0.0 };
    let zero_frac = if n > 0 { zeros as f64 / n as f64 } else { 0.0 };
    let duration_sec = n as f64 / 16000.0;
    let checksum = hash_samples(&samples, (16000usize).saturating_mul(5));
    tracing::info!(
        "FFmpeg-decoded WAV stats: samples={}, dur={:.2}s, rms={:.2}, min={}, max={}, zero_frac={:.3}, checksum_5s=0x{:016x}",
        n, duration_sec, rms, min_v, max_v, zero_frac, checksum
    );

    Ok(samples)
}
