use clap::Parser;
use std::fs;
use std::path::PathBuf;
use tokio::process::Command;
use transcription_engine::{
    Callbacks, ContentFormatting, Engine, EngineConfig, ProgressType, TextCase, TextDensity,
    TranscribeOptions,
};

fn validate_model(s: &str) -> Result<String, String> {
    let valid_whisper = [
        "tiny", "tiny.en", "base", "base.en", "small", "small.en",
        "medium", "medium.en", "large-v3-turbo", "large-v3",
    ];
    let lower = s.to_lowercase();
    if valid_whisper.contains(&lower.as_str()) {
        return Ok(s.to_string());
    }
    if lower.starts_with("moonshine-") {
        return Ok(s.to_string());
    }
    if lower == "parakeet" {
        return Ok(s.to_string());
    }
    Err(format!(
        "unknown model '{}'. Valid values: {}, parakeet, or moonshine-*",
        s,
        valid_whisper.join(", ")
    ))
}

fn validate_output_type(s: &str) -> Result<String, String> {
    match s.to_lowercase().as_str() {
        "srt" | "mkv" | "json" => Ok(s.to_string()),
        other => Err(format!("unknown output type '{}'. Valid values: srt, mkv, json", other)),
    }
}

#[derive(Parser)]
#[command(
    name = "autosubs",
    about = "Generate subtitles from video/audio files"
)]
struct Cli {
    /// Input video or audio file
    input: PathBuf,

    /// Output SRT file path (default: input name with .srt extension; also used to derive --output-type output path)
    #[arg(short = 'o', long)]
    output: Option<PathBuf>,

    /// Output file type: srt (default), json, or mkv (creates MKV with embedded SRT subtitles)
    #[arg(short = 'O', long, default_value = "srt", value_parser = validate_output_type)]
    output_type: String,

    /// Whisper model name (tiny, tiny.en, base, base.en, small, small.en,
    /// medium, medium.en, large-v3-turbo, large-v3, parakeet, moonshine-tiny, moonshine-base)
    #[arg(short = 'm', long, default_value = "base", value_parser = validate_model)]
    model: String,

    /// Source language code (e.g. "en", "fr", "auto" for auto-detect)
    #[arg(short = 'l', long, default_value = "auto")]
    language: String,

    /// Enable translation after transcription
    #[arg(long)]
    translate: bool,

    /// Target language for translation (e.g. "en", "fr", "es")
    #[arg(long)]
    target_language: Option<String>,

    /// Disable GPU acceleration
    #[arg(long)]
    no_gpu: bool,

    /// Disable Dynamic Time Warping for word timestamps
    #[arg(long)]
    no_dtw: bool,

    /// Enable speaker diarization (identifies who speaks when)
    #[arg(long)]
    diarize: bool,

    /// Maximum number of speakers for diarization
    #[arg(long)]
    max_speakers: Option<usize>,

    /// Text density: less, standard, more, single, custom
    #[arg(long, default_value = "standard")]
    text_density: String,

    /// Max lines per subtitle cue (default: 1)
    #[arg(long)]
    max_lines: Option<usize>,

    /// Custom max characters per line (only used with density=custom)
    #[arg(long)]
    custom_max_chars: Option<usize>,

    /// Text case transform: none, lowercase, uppercase, titlecase
    #[arg(long, default_value = "none")]
    text_case: String,

    /// Remove punctuation from subtitle text
    #[arg(long)]
    remove_punctuation: bool,

    /// Comma-separated list of words to censor
    #[arg(long)]
    censor_words: Option<String>,

    /// Initial prompt for the Whisper model
    #[arg(long)]
    prompt: Option<String>,

    /// Cache directory for models and normalized audio (default: ~/.cache/autosubs)
    #[arg(long)]
    cache_dir: Option<PathBuf>,

    /// Store normalized audio cache in the same directory as the input file
    #[arg(long)]
    audio_cache_same_dir: bool,

    /// Preserve file timestamps (accessed, modified) from input on output files
    #[arg(long)]
    preserve_metadata: bool,

    /// Path to mkvmerge binary (default: "mkvmerge" on PATH)
    #[arg(long)]
    mkvmerge_path: Option<PathBuf>,

    /// Delete input file after successfully creating MKV output
    #[arg(long)]
    delete_input_after_mkv_output: bool,
}

fn main() -> eyre::Result<()> {
    // Route whisper.cpp native logs through Rust's tracing system
    transcription_engine::install_logging_hooks();
    let filter = tracing_subscriber::EnvFilter::builder()
        .with_default_directive(tracing::level_filters::LevelFilter::INFO.into())
        .from_env_lossy()
        .add_directive("whisper_rs=warn".parse().unwrap())
        .add_directive("transcription_engine=warn".parse().unwrap());
    tracing_subscriber::fmt().with_env_filter(filter).init();

    let cli = Cli::parse();

    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(run(cli))
}

async fn run(cli: Cli) -> eyre::Result<()> {
    let input = cli.input.canonicalize().map_err(|e| {
        eyre::eyre!("Input file not found: {} ({})", cli.input.display(), e)
    })?;

    let had_output = cli.output.is_some();
    let output = cli.output.unwrap_or_else(|| {
        let mut p = input.clone();
        let ext = match cli.output_type.as_str() {
            "json" => "json",
            _ => "srt",
        };
        p.set_extension(ext);
        p
    });

    tracing::info!("Input: {}", input.display());
    tracing::info!("Output: {}", output.display());
    tracing::info!("Model: {}", cli.model);
    tracing::info!("Language: {}", cli.language);

    // --- 1. Normalize audio to mono 16kHz WAV ---
    let base_cache = cli.cache_dir.unwrap_or_else(|| {
        dirs::cache_dir()
            .unwrap_or_else(|| std::env::temp_dir())
            .join("autosubs")
    });
    let audio_cache = if cli.audio_cache_same_dir {
        input.parent().unwrap_or(&input).to_path_buf()
    } else {
        base_cache.join("audio")
    };
    let model_cache = base_cache.join("models");
    fs::create_dir_all(&audio_cache)?;
    fs::create_dir_all(&model_cache)?;

    let hash = {
        fn stable_hash(s: &str, len: u64, mtime: u64) -> String {
            let mut h: u64 = 14695981039346656037;
            for b in s.bytes() {
                h ^= b as u64;
                h = h.wrapping_mul(1099511628211);
            }
            for b in len.to_le_bytes() { h ^= b as u64; h = h.wrapping_mul(1099511628211); }
            for b in mtime.to_le_bytes() { h ^= b as u64; h = h.wrapping_mul(1099511628211); }
            format!("{:016x}", h)
        }
        let md = std::fs::metadata(&input).ok();
        let len = md.as_ref().map(|m| m.len()).unwrap_or(0);
        let mtime = md.and_then(|m| m.modified().ok())
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0))
            .unwrap_or(0);
        stable_hash(&input.to_string_lossy(), len, mtime)
    };
    let normalized = audio_cache.join(format!("autosubs-normalized-{}.wav", hash));
    tracing::info!("Normalizing audio...");
    normalize_audio(&input, &normalized).await?;
    tracing::info!("Audio normalized to: {}", normalized.display());

    // --- 2. Create engine and transcribe ---
    let engine_config = EngineConfig {
        cache_dir: model_cache,
        enable_dtw: Some(!cli.no_dtw),
        enable_flash_attn: Some(true),
        use_gpu: Some(!cli.no_gpu),
        gpu_device: None,
        vad_model_path: None,
        diarize_segment_model_path: None,
        diarize_embedding_model_path: None,
    };

    let mut engine = Engine::new(engine_config);

    let mut transcribe_options = TranscribeOptions::default();
    transcribe_options.model = cli.model.clone();
    transcribe_options.lang = Some(cli.language.clone());
    transcribe_options.enable_vad = Some(true);
    transcribe_options.enable_diarize = if cli.diarize { Some(true) } else { None };
    transcribe_options.max_speakers = cli.max_speakers;

    if cli.translate {
        if let Some(target) = &cli.target_language {
            if target == "en" {
                transcribe_options.whisper_to_english = Some(true);
                transcribe_options.translate_target = None;
            } else {
                transcribe_options.whisper_to_english = Some(false);
                transcribe_options.translate_target = Some(target.clone());
            }
        } else {
            transcribe_options.whisper_to_english = Some(true);
            transcribe_options.translate_target = None;
        }
    } else {
        transcribe_options.whisper_to_english = Some(false);
        transcribe_options.translate_target = None;
    }

    if let Some(prompt) = cli.prompt.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        transcribe_options
            .advanced
            .get_or_insert_with(Default::default)
            .init_prompt = Some(prompt.to_string());
    }

    // Parse text density
    let density = match cli.text_density.to_lowercase().as_str() {
        "less" => Some(TextDensity::Less),
        "more" => Some(TextDensity::More),
        "single" => Some(TextDensity::Single),
        "custom" => Some(TextDensity::Custom),
        _ => Some(TextDensity::Standard),
    };

    // Parse text case
    let text_case = match cli.text_case.to_lowercase().as_str() {
        "lowercase" => TextCase::Lowercase,
        "uppercase" => TextCase::Uppercase,
        "titlecase" => TextCase::Titlecase,
        _ => TextCase::None,
    };

    // Parse censored words
    let censored_words: Vec<String> = cli
        .censor_words
        .as_deref()
        .map(|s| s.split(',').map(|w| w.trim().to_string()).collect())
        .unwrap_or_default();

    let content_formatting = ContentFormatting {
        text_case,
        remove_punctuation: cli.remove_punctuation,
        censored_words,
    };

    let progress_callback = |percent: i32, progress_type: ProgressType, _label: &str| {
        let stage = match progress_type {
            ProgressType::Download => "downloading",
            ProgressType::Diarize => "diarizing",
            ProgressType::Transcribe => "transcribing",
            ProgressType::Translate => "translating",
        };
        eprint!("\r\x1b[K{}: {}%", stage, percent);
        if percent == 100 {
            eprintln!();
        }
    };

    let callbacks = Callbacks {
        progress: Some(&progress_callback),
        new_segment_callback: None,
        is_cancelled: None,
    };

    tracing::info!("Starting transcription...");
    let start = std::time::Instant::now();
    let (_raw_segments, formatted_segments, output_language) = engine
        .transcribe_audio(
            &normalized.to_string_lossy(),
            transcribe_options,
            cli.max_lines,
            density,
            cli.custom_max_chars,
            Some(content_formatting),
            Some(callbacks),
        )
        .await
        .map_err(|e| eyre::eyre!("Transcription failed: {}", e))?;
    let elapsed = start.elapsed();

    tracing::info!(
        "Transcription complete: {} segments, language: {} ({:.1}s)",
        formatted_segments.len(),
        output_language,
        elapsed.as_secs_f64()
    );

    match cli.output_type.as_str() {
        "json" => {
            let transcript = generate_json(&formatted_segments, &output_language, elapsed);
            let json_content = serde_json::to_string_pretty(&transcript)
                .map_err(|e| eyre::eyre!("JSON serialization failed: {}", e))?;
            fs::write(&output, &json_content)?;
            tracing::info!("JSON transcript written to: {}", output.display());
        }
        _ => {
            // --- SRT output (used directly or as intermediate for MKV) ---
            let srt_content = generate_srt(&formatted_segments);
            fs::write(&output, &srt_content)?;
            tracing::info!("SRT written to: {}", output.display());

            if cli.preserve_metadata {
                tracing::info!("Preserving file timestamps from input on SRT");
                if let (Ok(input_md), Ok(srt_file)) = (
                    std::fs::metadata(&input),
                    std::fs::File::options().write(true).open(&output),
                ) {
                    let mut times = std::fs::FileTimes::new();
                    if let Ok(atime) = input_md.accessed() {
                        times = times.set_accessed(atime);
                    }
                    if let Ok(mtime) = input_md.modified() {
                        times = times.set_modified(mtime);
                    }
                    let _ = srt_file.set_times(times);
                }
            }

            // --- Create output file with embedded subtitles (optional) ---
            if cli.output_type == "mkv" {
                let mkv_path = if had_output {
                    let mut p = output.clone();
                    p.set_extension("mkv");
                    p
                } else {
                    input.with_extension("mkv")
                };
                create_mkv(&input, &output, &mkv_path, cli.mkvmerge_path.as_ref(), cli.preserve_metadata).await?;
                fs::remove_file(&output)?;
                tracing::info!("Removed intermediate SRT: {}", output.display());
                if cli.delete_input_after_mkv_output {
                    fs::remove_file(&input)?;
                    tracing::info!("Removed input file: {}", input.display());
                }
            }
        }
    }

    // Clean up normalized audio
    let _ = fs::remove_file(&normalized);
    tracing::info!("Cleaned up normalized audio");

    Ok(())
}

/// Normalize audio to mono 16kHz 16-bit PCM WAV using ffmpeg.
async fn normalize_audio(input: &PathBuf, output: &PathBuf) -> eyre::Result<()> {
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }

    let status = Command::new("ffmpeg")
        .args([
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-vn",
            "-sn",
            "-dn",
            "-i",
            &input.to_string_lossy(),
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            "-map_metadata",
            "-1",
            "-f",
            "wav",
            "-nostats",
            "-y",
            &output.to_string_lossy(),
        ])
        .output()
        .await
        .map_err(|e| eyre::eyre!("Failed to run ffmpeg: {}. Is ffmpeg installed?", e))?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        return Err(eyre::eyre!("ffmpeg failed: {}", stderr));
    }

    if !output.exists() {
        return Err(eyre::eyre!("ffmpeg succeeded but output file was not created"));
    }

    Ok(())
}

/// Format seconds to SRT timecode format (HH:MM:SS,mmm)
fn format_timecode(seconds: f64) -> String {
    let total = seconds.max(0.0);
    let ms = ((total % 1.0) * 1000.0).round() as u32;
    let total_secs = total as u32;
    let s = total_secs % 60;
    let m = (total_secs / 60) % 60;
    let h = total_secs / 3600;
    format!("{:02}:{:02}:{:02},{:03}", h, m, s, ms)
}

/// Mux the SRT subtitles into the input file to create an MKV.
async fn create_mkv(
    input: &PathBuf,
    srt: &PathBuf,
    mkv_output: &PathBuf,
    mkvmerge_path: Option<&PathBuf>,
    preserve_metadata: bool,
) -> eyre::Result<()> {
    if let Some(parent) = mkv_output.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    tracing::info!("Creating MKV with embedded subtitles: {}", mkv_output.display());
    tracing::info!(
        "Running: mkvmerge -o {} {} {}",
        mkv_output.display(),
        input.display(),
        srt.display()
    );

    let mkvmerge_bin = mkvmerge_path
        .map(|p| p.as_path())
        .unwrap_or(std::path::Path::new("mkvmerge"));

    let mut child = Command::new(mkvmerge_bin)
        .args([
            "-o",
            &mkv_output.to_string_lossy(),
            &input.to_string_lossy(),
            &srt.to_string_lossy(),
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| eyre::eyre!("Failed to run mkvmerge: {}. Is mkvtoolnix installed?", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let stdout_handle = tokio::spawn(async move {
        let reader = tokio::io::BufReader::new(stdout);
        let mut lines = tokio::io::AsyncBufReadExt::lines(reader);
        let mut output = Vec::new();
        while let Ok(Some(line)) = lines.next_line().await {
            println!("{}", line);
            output.push(line);
        }
        output
    });

    let stderr_handle = tokio::spawn(async move {
        let reader = tokio::io::BufReader::new(stderr);
        let mut lines = tokio::io::AsyncBufReadExt::lines(reader);
        let mut output = Vec::new();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("{}", line);
            output.push(line);
        }
        output
    });

    let status = child.wait().await.map_err(|e| {
        eyre::eyre!("Failed to wait for mkvmerge process: {}", e)
    })?;
    let stdout_lines = stdout_handle.await.unwrap_or_default();
    let stderr_lines = stderr_handle.await.unwrap_or_default();

    let all_output: Vec<_> = stdout_lines.iter().chain(stderr_lines.iter()).collect();

    let multiplexed = all_output.iter().any(|l| l.contains("Multiplexing took"));

    if !status.success() && !multiplexed {
        return Err(eyre::eyre!(
            "mkvmerge failed with exit code {:?}",
            status.code()
        ));
    }

    if !multiplexed {
        return Err(eyre::eyre!(
            "mkvmerge did not indicate successful completion (expected 'Multiplexing took')"
        ));
    }

    if !mkv_output.exists() {
        return Err(eyre::eyre!("mkvmerge succeeded but mkv output was not created"));
    }

    // Preserve file timestamps from input
    if preserve_metadata {
        tracing::info!("Preserving file timestamps from input");
        if let (Ok(input_md), Ok(output_file)) = (
            std::fs::metadata(input),
            std::fs::File::options().write(true).open(mkv_output),
        ) {
            let mut times = std::fs::FileTimes::new();
            if let Ok(atime) = input_md.accessed() {
                times = times.set_accessed(atime);
            }
            if let Ok(mtime) = input_md.modified() {
                times = times.set_modified(mtime);
            }
            let _ = output_file.set_times(times);
        }
    }

    tracing::info!("MKV created: {}", mkv_output.display());
    Ok(())
}

/// Generate SRT content from segments, matching the frontend's format.
fn generate_srt(segments: &[transcription_engine::Segment]) -> String {
    if segments.is_empty() {
        return String::new();
    }

    let min_duration = 0.4;
    let n = segments.len();

    let mut segs: Vec<transcription_engine::Segment> = segments
        .iter()
        .map(|s| transcription_engine::Segment {
            start: s.start,
            end: s.end,
            text: s.text.clone(),
            words: s.words.clone(),
            speaker_id: s.speaker_id.clone(),
        })
        .collect();

    for i in 0..n {
        let mut start = segs[i].start;
        let mut end = segs[i].end;

        let dur = end - start;
        if dur < min_duration {
            let mut needed = min_duration - dur;

            if i > 0 {
                let prev_end = segs[i - 1].end;
                if start > prev_end {
                    let expand = (start - prev_end).min(needed);
                    start -= expand;
                    needed -= expand;
                }
            }

            if needed > 0.0 {
                let next_start = if i < n - 1 {
                    segs[i + 1].start
                } else {
                    end + needed
                };
                if next_start > end {
                    end += (next_start - end).min(needed);
                }
            }
        }

        if i > 0 {
            let prev_end = segs[i - 1].end;
            if start <= prev_end {
                start = prev_end + 0.001;
                if end < start {
                    end = start + min_duration;
                }
            }
        }

        segs[i].start = start;
        segs[i].end = end;
    }

    segs.iter()
        .enumerate()
        .filter_map(|(i, seg)| {
            let text = seg.text.trim();
            if text.is_empty() {
                return None;
            }
            Some(format!(
                "{}\n{} --> {}\n{}\n",
                i + 1,
                format_timecode(seg.start),
                format_timecode(seg.end),
                text
            ))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

// --- JSON transcript types (mirrors transcript_types.rs for standalone CLI) ---

#[derive(serde::Serialize)]
struct JsonTranscript {
    processing_time_sec: u64,
    language: String,
    segments: Vec<JsonSegment>,
    speakers: Vec<JsonSpeaker>,
}

#[derive(serde::Serialize)]
struct JsonSegment {
    start: f64,
    end: f64,
    text: String,
    speaker_id: Option<String>,
}

#[derive(serde::Serialize)]
struct JsonSample {
    start: f64,
    end: f64,
}

#[derive(serde::Serialize)]
struct JsonColorModifier {
    enabled: bool,
    color: String,
}

impl Default for JsonColorModifier {
    fn default() -> Self {
        JsonColorModifier {
            enabled: false,
            color: String::new(),
        }
    }
}

#[derive(serde::Serialize)]
struct JsonSpeaker {
    name: String,
    fill: JsonColorModifier,
    outline: JsonColorModifier,
    border: JsonColorModifier,
    sample: JsonSample,
}

/// Generate JSON transcript content, aggregating speakers when diarization data is present.
fn generate_json(
    segments: &[transcription_engine::Segment],
    language: &str,
    elapsed: std::time::Duration,
) -> JsonTranscript {
    let segs: Vec<JsonSegment> = segments
        .iter()
        .map(|s| JsonSegment {
            start: s.start,
            end: s.end,
            text: s.text.clone(),
            speaker_id: s.speaker_id.clone(),
        })
        .collect();

    let speakers = aggregate_speakers_from_segments(segments);

    JsonTranscript {
        processing_time_sec: elapsed.as_secs(),
        language: language.to_string(),
        segments: segs,
        speakers,
    }
}

/// Aggregates speakers from transcript segments, matching the logic in the Tauri backend
/// (transcription_api.rs).  Deduplicates speakers by their normalised speaker_id and assigns
/// a sequential index.  Returns a Vec<JsonSpeaker> suitable for the JSON transcript output.
fn aggregate_speakers_from_segments(segments: &[transcription_engine::Segment]) -> Vec<JsonSpeaker> {
    use std::collections::HashMap;

    let mut speaker_info: HashMap<String, (usize, f64, f64)> = HashMap::new();
    let mut next_index: usize = 0;

    for segment in segments.iter() {
        if let Some(ref speaker_id) = segment.speaker_id {
            let trimmed = speaker_id.trim();
            if trimmed.is_empty() || trimmed == "?" {
                continue;
            }

            let raw_id = if let Some(rest) = trimmed.strip_prefix("Speaker ") {
                rest.trim().to_string()
            } else {
                trimmed.to_string()
            };

            if !speaker_info.contains_key(&raw_id) {
                speaker_info.insert(raw_id, (next_index, segment.start, segment.end));
                next_index += 1;
            }
        }
    }

    let mut speakers = Vec::new();
    let mut speaker_list: Vec<(String, (usize, f64, f64))> = speaker_info.into_iter().collect();
    speaker_list.sort_by_key(|(_, (index, _, _))| *index);

    for (raw_id, (_, start, end)) in speaker_list {
        speakers.push(JsonSpeaker {
            name: format!("Speaker {}", raw_id),
            sample: JsonSample { start, end },
            fill: JsonColorModifier::default(),
            outline: JsonColorModifier::default(),
            border: JsonColorModifier::default(),
        });
    }

    speakers
}
