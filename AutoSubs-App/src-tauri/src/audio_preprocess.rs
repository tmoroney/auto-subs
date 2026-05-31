use eyre::{bail, Result};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Runtime};
use tauri_plugin_shell::ShellExt;
use tokio::process::Command as TokioCommand;

/// Extract audio peaks efficiently using ffmpeg without full decoding.
/// Uses ffmpeg to decode audio at a very low sample rate and streams raw PCM to stdout,
/// then computes peak values for waveform visualization. No temporary files needed.
/// Returns normalized peaks (0.0-1.0) for the requested number of bars.
#[tauri::command]
pub async fn extract_audio_peaks(
    app: AppHandle,
    input: String,
    count: usize,
) -> Result<Vec<f32>, String> {
    let count = count.clamp(10, 2000);
    let input_path = expand_tilde(&input);
    
    let args = build_ffmpeg_args(&input_path);
    let (success, _code, stdout, stderr) = run_ffmpeg(&app, &args).await
        .map_err(|e| format!("ffmpeg execution failed: {}", e))?;
    
    if !success {
        let stderr_str = String::from_utf8_lossy(&stderr);
        return Err(format!("ffmpeg failed: {}", stderr_str));
    }
    
    let samples = convert_pcm_to_f32(&stdout);
    if samples.is_empty() {
        return Ok(vec![0.0; count]);
    }
    
    let peaks = compute_peaks(&samples, count);
    Ok(normalize_peaks(peaks))
}

fn build_ffmpeg_args(input_path: &str) -> Vec<String> {
    vec![
        "-nostdin".to_string(),
        "-hide_banner".to_string(),
        "-loglevel".to_string(),
        "error".to_string(),
        "-i".to_string(),
        input_path.to_string(),
        "-vn".to_string(),
        "-sn".to_string(),
        "-dn".to_string(),
        "-ar".to_string(),
        "4000".to_string(),
        "-ac".to_string(),
        "1".to_string(),
        "-c:a".to_string(),
        "pcm_s16le".to_string(),
        "-f".to_string(),
        "s16le".to_string(),
        "-".to_string(),
    ]
}

fn convert_pcm_to_f32(pcm_data: &[u8]) -> Vec<f32> {
    pcm_data
        .chunks_exact(2)
        .map(|chunk| {
            let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
            sample as f32 / i16::MAX as f32
        })
        .collect()
}

fn compute_peaks(samples: &[f32], count: usize) -> Vec<f32> {
    let bin_size = (samples.len() / count).max(1);
    let mut peaks = Vec::with_capacity(count);

    for i in 0..count {
        let start = i * bin_size;
        let end = ((i + 1) * bin_size).min(samples.len());
        let bin = &samples[start..end];
        let rms = (bin.iter().map(|&v| v * v).sum::<f32>() / bin.len() as f32).sqrt();
        peaks.push(rms);
    }

    peaks
}

fn normalize_peaks(mut peaks: Vec<f32>) -> Vec<f32> {
    let global_max = peaks.iter().cloned().fold(0.0_f32, f32::max);
    if global_max > 0.0 {
        for peak in peaks.iter_mut() {
            *peak /= global_max;
        }
    }
    peaks
}

/// Expand a leading `~` in a file path to the user's home directory.
/// Windows does not expand `~` natively; Rust's PathBuf does not either.
fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix('~') {
        if let Some(home) = dirs::home_dir() {
            let rest = rest.trim_start_matches('/').trim_start_matches('\\');
            return home.join(rest).to_string_lossy().into_owned();
        }
    }
    path.to_string()
}

/// Parse the source channel count out of FFmpeg's
/// "Rematrix is needed between N channels and mono ..." error.
///
/// The auto-aresample filter prints this when asked to downmix audio whose
/// `channel_layout` is unknown and whose channel count is > 2 — a typical
/// shape for multi-track DAW exports (e.g. a 60-track DaVinci Resolve
/// timeline rendered as one WAV — see issue #500). The phrasing has been
/// stable across FFmpeg 6.x / 7.x / 8.x.
fn parse_rematrix_channel_count(stderr: &str) -> Option<u32> {
    const PREFIX: &str = "Rematrix is needed between ";
    const SUFFIX: &str = " channels and mono";

    let after_prefix = stderr.find(PREFIX)?;
    let tail = &stderr[after_prefix + PREFIX.len()..];
    let digit_end = tail.find(|c: char| !c.is_ascii_digit())?;
    if digit_end == 0 {
        return None;
    }
    if !tail[digit_end..].starts_with(SUFFIX) {
        return None;
    }
    let n: u32 = tail[..digit_end].parse().ok()?;
    if n > 0 { Some(n) } else { None }
}

/// Build a pan filter that mixes all `channels` source channels equally
/// into a single mono channel. e.g. for 3 channels:
/// `pan=mono|c0=0.333333*c0+0.333333*c1+0.333333*c2`.
fn build_equal_mix_pan_filter(channels: u32) -> String {
    let weight = 1.0_f64 / channels as f64;
    let mut expr = String::with_capacity(channels as usize * 16);
    expr.push_str("pan=mono|c0=");
    for i in 0..channels {
        if i > 0 {
            expr.push('+');
        }
        expr.push_str(&format!("{:.6}*c{}", weight, i));
    }
    expr
}

pub fn build_args(
    input_lossy: &str,
    output_lossy: &str,
    downmix_filter: Option<&str>,
    additional_ffmpeg_args: Option<&Vec<String>>,
) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-nostdin".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-vn".into(),
        "-sn".into(),
        "-dn".into(),
        "-i".into(),
        input_lossy.into(),
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
    if let Some(filter) = downmix_filter {
        args.push("-af".into());
        args.push(filter.into());
    }
    if let Some(extra) = additional_ffmpeg_args {
        args.extend(extra.clone());
    }
    args.push("-y".into());
    args.push(output_lossy.into());
    args
}

pub async fn run_ffmpeg<R: Runtime>(
    app: &AppHandle<R>,
    args: &[String],
) -> Result<(bool, Option<i32>, Vec<u8>, Vec<u8>)> {
    let sidecar_command = app.shell().sidecar("ffmpeg");
    let result = match sidecar_command {
        Ok(cmd) => match cmd.args(args.to_vec()).output().await {
            Ok(o) => {
                let stderr_str = String::from_utf8_lossy(&o.stderr);
                if !o.status.success() && stderr_str.contains("shim file") {
                    tracing::warn!("ffmpeg sidecar shim error, falling back to system ffmpeg");
                    let sys = TokioCommand::new("ffmpeg").args(args).output().await?;
                    (sys.status.success(), sys.status.code(), sys.stdout, sys.stderr)
                } else {
                    (o.status.success(), o.status.code(), o.stdout, o.stderr)
                }
            }
            Err(_) => {
                tracing::warn!("ffmpeg sidecar unavailable, falling back to system ffmpeg");
                let sys = TokioCommand::new("ffmpeg").args(args).output().await?;
                (sys.status.success(), sys.status.code(), sys.stdout, sys.stderr)
            }
        },
        Err(e) => {
            tracing::warn!("ffmpeg sidecar init error: {}. Falling back to system ffmpeg", e);
            let sys = TokioCommand::new("ffmpeg").args(args).output().await?;
            (sys.status.success(), sys.status.code(), sys.stdout, sys.stderr)
        }
    };
    Ok(result)
}

/// Converts audio/video files to mono 16kHz 16-bit PCM WAV using FFmpeg.
/// This is the only preprocessing step needed before passing audio to whisper-diarize-rs.
/// Handles both audio files and video files (extracts audio stream only).
///
/// If the first invocation fails with `Rematrix is needed between N channels
/// and mono` — which happens when the input has >2 channels and an unknown
/// channel layout — we retry once with an explicit `pan` filter that mixes
/// all source channels equally into mono (issue #500).
pub async fn normalize<R: Runtime>(
    app: AppHandle<R>,
    input: PathBuf,
    output: PathBuf,
    additional_ffmpeg_args: Option<Vec<String>>,
) -> std::result::Result<(), String> {
    async fn normalize_inner<R: Runtime>(
        app: &AppHandle<R>,
        input: PathBuf,
        output: PathBuf,
        additional_ffmpeg_args: Option<Vec<String>>,
    ) -> Result<()> {
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }

        tracing::info!(
            "audio normalization: converting to mono 16kHz PCM16 WAV ({} -> {})",
            input.display(),
            output.display()
        );

        let input_lossy = input.to_string_lossy().into_owned();
        let output_lossy = output.to_string_lossy().into_owned();

        // Expand ~ to home directory (Windows doesn't expand tilde natively)
        let input_lossy = expand_tilde(&input_lossy);
        let output_lossy = expand_tilde(&output_lossy);

        // First attempt: let FFmpeg auto-downmix. This handles mono, stereo,
        // 5.1, 7.1, and any other input whose channel_layout is known.
        let args = build_args(
            &input_lossy,
            &output_lossy,
            None,
            additional_ffmpeg_args.as_ref(),
        );
        tracing::debug!("Running ffmpeg with args: {:?}", args);
        let (success, code, stdout, stderr) = run_ffmpeg(app, &args).await?;

        if !stdout.is_empty() {
            tracing::debug!("ffmpeg stdout: {}", String::from_utf8_lossy(&stdout));
        }
        if !stderr.is_empty() {
            tracing::debug!("ffmpeg stderr: {}", String::from_utf8_lossy(&stderr));
        }

        if !success {
            let stderr_str = String::from_utf8_lossy(&stderr);
            // The auto-aresample path fails on multi-channel inputs with
            // unknown layout. Recover the channel count from the error
            // and retry with an explicit equal-mix pan filter.
            if let Some(channels) = parse_rematrix_channel_count(&stderr_str) {
                tracing::warn!(
                    "audio normalization: ffmpeg could not auto-downmix \
                     {} channels with unknown layout; retrying with \
                     explicit pan filter (#500)",
                    channels
                );
                let filter = build_equal_mix_pan_filter(channels);
                let retry_args = build_args(
                    &input_lossy,
                    &output_lossy,
                    Some(&filter),
                    additional_ffmpeg_args.as_ref(),
                );
                tracing::debug!("Running ffmpeg (retry) with args: {:?}", retry_args);
                let (retry_success, retry_code, _retry_stdout, retry_stderr) =
                    run_ffmpeg(app, &retry_args).await?;
                if !retry_success {
                    bail!(
                        "ffmpeg failed (after pan-filter retry for {} channels) \
                         with exit code: {:?}\nStderr: {}",
                        channels,
                        retry_code,
                        String::from_utf8_lossy(&retry_stderr)
                    );
                }
            } else {
                bail!(
                    "ffmpeg failed with exit code: {:?}\nStderr: {}",
                    code,
                    stderr_str
                );
            }
        }

        if !output.exists() {
            bail!("ffmpeg succeeded but output file was not created");
        }

        let out_meta = fs::metadata(&output)?;
        if out_meta.len() <= 44 {
            bail!(
                "ffmpeg produced an empty WAV file ({} bytes): {}",
                out_meta.len(),
                output.display()
            );
        }

        tracing::info!("audio normalization: success -> {}", output.display());
        Ok(())
    }

    normalize_inner(&app, input, output, additional_ffmpeg_args)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_rematrix_60_channels_from_real_log() {
        // Verbatim shape from issue #500.
        let stderr = "[auto_aresample_0 @ 000002455e2a1000] [SWR @ 000002455e2a1140] \
            Rematrix is needed between 60 channels and mono but there is not \
            enough information to do it\n\
            [auto_aresample_0 @ 000002455e2a1000] Failed to configure output pad";
        assert_eq!(parse_rematrix_channel_count(stderr), Some(60));
    }

    #[test]
    fn parse_rematrix_various_channel_counts() {
        let mk = |n: u32| format!("Rematrix is needed between {} channels and mono ...", n);
        assert_eq!(parse_rematrix_channel_count(&mk(3)), Some(3));
        assert_eq!(parse_rematrix_channel_count(&mk(8)), Some(8));
        assert_eq!(parse_rematrix_channel_count(&mk(128)), Some(128));
    }

    #[test]
    fn parse_rematrix_no_match() {
        assert_eq!(parse_rematrix_channel_count(""), None);
        assert_eq!(parse_rematrix_channel_count("some other ffmpeg error"), None);
        // Wrong direction — output to surround, not mono.
        assert_eq!(
            parse_rematrix_channel_count("Rematrix is needed between 2 channels and 5.1"),
            None
        );
    }

    #[test]
    fn build_pan_filter_three_channels() {
        assert_eq!(
            build_equal_mix_pan_filter(3),
            "pan=mono|c0=0.333333*c0+0.333333*c1+0.333333*c2"
        );
    }

    #[test]
    fn build_pan_filter_60_channels_shape() {
        let f = build_equal_mix_pan_filter(60);
        assert!(f.starts_with("pan=mono|c0=0.016667*c0+0.016667*c1+"));
        assert!(f.ends_with("+0.016667*c59"));
        assert_eq!(f.matches('+').count(), 59);
        assert_eq!(f.matches('*').count(), 60);
    }

    #[test]
    fn build_args_without_filter_has_no_af() {
        let args = build_args("/in.wav", "/out.wav", None, None);
        assert!(args.iter().any(|s| s == "-i"));
        assert!(args.iter().any(|s| s == "/in.wav"));
        assert!(args.iter().any(|s| s == "/out.wav"));
        assert!(!args.iter().any(|s| s == "-af"));
        assert!(args.iter().any(|s| s == "-y"));
    }

    #[test]
    fn build_args_with_filter_inserts_af_before_extras() {
        let extras = vec!["-threads".to_string(), "2".to_string()];
        let args = build_args(
            "/in.wav",
            "/out.wav",
            Some("pan=mono|c0=c0"),
            Some(&extras),
        );
        let af_idx = args.iter().position(|s| s == "-af").expect("-af present");
        assert_eq!(args[af_idx + 1], "pan=mono|c0=c0");
        let threads_idx = args.iter().position(|s| s == "-threads").unwrap();
        let y_idx = args.iter().position(|s| s == "-y").unwrap();
        assert!(af_idx < threads_idx, "-af must come before user extras");
        assert!(threads_idx < y_idx, "extras must come before -y");
    }
}
