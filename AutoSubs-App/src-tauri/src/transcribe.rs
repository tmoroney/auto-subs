use crate::audio;
use crate::config::{DiarizeOptions, TranscribeOptions};
use crate::transcript::{ColorModifier, Sample, Segment, Speaker, Transcript, WordTimestamp};
use eyre::{bail, eyre, Context, OptionExt, Result};
use hound::WavReader;
use serde::Deserialize;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicI32, Ordering};
use std::time::Instant;
use std::time::SystemTime;
use std::time::Duration;
use tauri::{command, AppHandle, Emitter, Manager, Runtime};
use whisper_rs::DtwMode;
use whisper_rs::DtwModelPreset;
use whisper_rs::DtwParameters;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContextParameters, WhisperContext, WhisperSegment, WhisperVadContext, WhisperVadContextParams, WhisperVadParams};

type ProgressCallbackType = once_cell::sync::Lazy<Mutex<Option<Box<dyn Fn(i32) + Send + Sync>>>>;
static PROGRESS_CALLBACK: ProgressCallbackType = once_cell::sync::Lazy::new(|| Mutex::new(None));

// Global cancellation state
pub static SHOULD_CANCEL: once_cell::sync::Lazy<Mutex<bool>> =
    once_cell::sync::Lazy::new(|| Mutex::new(false));

// Latest progress values updated from hot compute loops (blocking threads)
// Emission to the frontend is throttled via a periodic Tokio task.
static LATEST_TRANSCRIBE_PROGRESS: AtomicI32 = AtomicI32::new(0);
static LATEST_DIARIZE_PROGRESS: AtomicI32 = AtomicI32::new(0);

// Utility function for rounding to n decimal places
fn round_to_places(val: f64, places: u32) -> f64 {
    let factor = 10f64.powi(places as i32);
    (val * factor).trunc() / factor
}

// --- Audio Segment for segment-based transcription ---
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioSegment {
    pub start: f64,           // Start time within audio file (seconds)
    pub end: f64,             // End time within audio file (seconds)
    pub timeline_offset: f64, // Offset to add for timeline placement (seconds)
}


const SAMPLE_RATE: usize = 16000; // 16kHz for Whisper

/// Extract audio samples for a single clip segment
/// Returns the samples for just that clip
fn extract_clip_samples(
    samples: &[f32],
    segment: &crate::config::TranscribeSegment,
) -> Option<Vec<f32>> {
    let start_sample = (segment.start * SAMPLE_RATE as f64) as usize;
    let end_sample = ((segment.end * SAMPLE_RATE as f64) as usize).min(samples.len());
    
    if start_sample >= samples.len() || start_sample >= end_sample {
        tracing::warn!("Skipping clip outside audio bounds: start={:.2}s end={:.2}s", 
            segment.start, segment.end);
        return None;
    }
    
    Some(samples[start_sample..end_sample].to_vec())
}

// --- Frontend Options Struct ---
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FrontendTranscribeOptions {
    pub audio_path: String,
    pub offset: Option<f64>,
    pub model: String, // e.g., "tiny", "base", "small", "medium", "large"
    pub lang: Option<String>,
    pub translate: Option<bool>,
    pub enable_dtw: Option<bool>,
    pub enable_gpu: Option<bool>,
    pub enable_diarize: Option<bool>,
    pub max_speakers: Option<usize>,
    pub segments: Option<Vec<AudioSegment>>,  // If provided, transcribe only these segments
}

#[command]
pub async fn cancel_transcription() -> Result<(), String> {
    tracing::info!("Transcription cancellation requested");
    if let Ok(mut should_cancel) = SHOULD_CANCEL.lock() {
        *should_cancel = true;
    } else {
        return Err("Failed to acquire cancellation lock".to_string());
    }
    Ok(())
}

#[command]
pub async fn transcribe_audio<R: Runtime>(
    app: AppHandle<R>,
    options: FrontendTranscribeOptions,
) -> Result<Transcript, String> {
    tracing::info!("whisper.cpp {}", whisper_rs::WHISPER_CPP_VERSION);
    let start_time = Instant::now();
    tracing::debug!("Starting transcription with options: {:?}", options);

    // Reset cancellation flag at the start of transcription
    if let Ok(mut should_cancel) = SHOULD_CANCEL.lock() {
        *should_cancel = false;
    }

    let model_path = crate::models::download_model_if_needed(app.clone(), &options.model)?;

    let audio_duration = crate::audio::get_audio_duration(app.clone(), options.audio_path.clone())
        .await
        .map_err(|e| format!("Failed to get audio duration: {}", e))?;

    // GPU policy: only Windows may disable; others forced ON
    let is_windows = tauri_plugin_os::platform() == "windows";
    let enable_gpu = if is_windows {
        // Default OFF on Windows if not provided
        options.enable_gpu.or(Some(false))
    } else {
        // Force ON on non-Windows
        Some(true)
    };

    // do this after reading audio instead so that we can calculate dtw mem size based on log mel size (no ffprobe needed)
    let ctx = create_context(
        model_path.as_path(),
        &options.model,
        None,
        enable_gpu,
        options.enable_dtw, // improved word timestamps
        Some(audio_duration),
    )
    .map_err(|e| format!("Failed to create Whisper context: {}", e))?;

    let vad_model_path = crate::models::get_vad_model_path(app.clone());

    // Convert frontend segments to config segments
    let config_segments = options.segments.as_ref().map(|segs| {
        segs.iter().map(|s| crate::config::TranscribeSegment {
            start: s.start,
            end: s.end,
            timeline_offset: s.timeline_offset,
        }).collect()
    });

    let transcribe_options = TranscribeOptions {
        path: options.audio_path.clone().into(),
        offset: options.offset,
        lang: options.lang.clone(),
        vad_model_path: vad_model_path,
        init_prompt: None,
        max_sentence_len: None,
        verbose: None,
        max_text_ctx: None,
        n_threads: None,
        temperature: None,
        translate: options.translate,
        enable_dtw: options.enable_dtw,
        sampling_bestof_or_beam_size: None,
        sampling_strategy: None,
        segments: config_segments,
    };

    let diarize_options = if let Some(true) = options.enable_diarize {
        tracing::debug!("Diarization enabled, checking for models...");
        let seg_url = "https://github.com/thewh1teagle/pyannote-rs/releases/download/v0.1.0/segmentation-3.0.onnx";
        let emb_url = "https://github.com/thewh1teagle/pyannote-rs/releases/download/v0.1.0/wespeaker_en_voxceleb_CAM++.onnx";

        let segment_model_path = crate::models::download_diarize_model_if_needed(
            app.clone(),
            "segmentation-3.0.onnx",
            seg_url,
        )
        .await?
        .to_string_lossy()
        .into_owned();
        let embedding_model_path = crate::models::download_diarize_model_if_needed(
            app.clone(),
            "wespeaker_en_voxceleb_CAM++.onnx",
            emb_url,
        )
        .await?
        .to_string_lossy()
        .into_owned();

        Some(DiarizeOptions {
            segment_model_path,
            embedding_model_path,
            threshold: 0.5,
            max_speakers: match options.max_speakers {
                Some(0) | None => usize::MAX,
                Some(n) => n,
            },
        })
    } else {
        None
    };

    // Reset progress atomics and set up a fixed-interval emitter task
    LATEST_TRANSCRIBE_PROGRESS.store(0, Ordering::Relaxed);
    LATEST_DIARIZE_PROGRESS.store(0, Ordering::Relaxed);

    let emit_app = app.clone();
    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
    let emitter_handle = tokio::spawn(async move {
        let mut last_t = -1;
        let mut last_d = -1;
        let mut interval = tokio::time::interval(Duration::from_millis(250));
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    let t = LATEST_TRANSCRIBE_PROGRESS.load(Ordering::Relaxed).clamp(0, 100);
                    if t != last_t {
                        let _ = emit_app.emit("transcription-progress", t);
                        last_t = t;
                    }
                    let d = LATEST_DIARIZE_PROGRESS.load(Ordering::Relaxed).clamp(0, 100);
                    if d != last_d {
                        let _ = emit_app.emit("diarization-progress", d);
                        last_d = d;
                    }
                }
                _ = &mut stop_rx => {
                    break;
                }
            }
        }
    });

    // Progress callback: update atomic from hot loop
    let progress_callback = Some(Box::new(move |progress: i32| {
        LATEST_TRANSCRIBE_PROGRESS.store(progress, Ordering::Relaxed);
    }) as Box<dyn Fn(i32) + Send + Sync>);

    // Abort callback: check cancellation flag
    let abort_callback = Some(Box::new(|| {
        if let Ok(should_cancel) = SHOULD_CANCEL.lock() {
            let cancelled = *should_cancel;
            if cancelled {
                tracing::info!("Transcription cancelled by user");
            }
            cancelled
        } else {
            false
        }
    }) as Box<dyn Fn() -> bool + Send>);

    // Await the async pipeline
    let res = run_transcription_pipeline(
        app.clone(),
        ctx,
        transcribe_options,
        progress_callback,
        None,
        abort_callback,
        diarize_options.clone(),
        None,
        options.enable_diarize,
    )
    .await;

    // Stop emitter and wait for it to finish
    let _ = stop_tx.send(());
    let _ = emitter_handle.await;

    match res {
        Ok(mut transcript) => {
            transcript.processing_time_sec = start_time.elapsed().as_secs();
            tracing::info!(
                "Transcription successful in {}s",
                transcript.processing_time_sec
            );
            Ok(transcript)
        }
        Err(e) => {
            tracing::error!("Error during transcription pipeline: {}", e);
            Err(format!("Transcription failed: {}", e))
        }
    }
}

/// Estimate a safe DTW working-set size (in bytes) for whisper.cpp DTW.
/// Pass the result to `DtwParameters { dtw_mem_size, .. }`.
fn calculate_dtw_mem_size(audio_duration_secs: f64) -> usize {
    // Frame geometry
    const FRAME_RATE: f64 = 100.0;      // 10 ms frames
    let num_frames = (audio_duration_secs * FRAME_RATE).ceil() as usize;

    // Memory model bits
    const BYTES_F32: usize = 4;
    const BYTES_I32: usize = 4;

    // Rolling buffers + auxiliaries (cost, prev, scratch, etc.)
    // Use 4 lanes to leave headroom on long segments/presets.
    const LANES: usize = 4;

    // Dynamic band: narrow for short audio, wider for long audio.
    // Keeps quality while bounding memory.
    let band_frames = match num_frames {
        0..=15_000 => 96,    // ≤150 s
        15_001..=45_000 => 128, // 150–450 s
        _ => 160,            // >450 s
    };

    // Core DP working set (float costs) plus an int32 backtrack-ish buffer
    let dp_bytes = num_frames
        .saturating_mul(band_frames)
        .saturating_mul(LANES)
        .saturating_mul(BYTES_F32);

    let bt_bytes = num_frames
        .saturating_mul(BYTES_I32); // rough backtrack/indices budget

    // Fixed baseline for internal scratch
    const BASELINE_MB: usize = 24;
    let base_bytes = BASELINE_MB * 1024 * 1024;

    // Total and clamps
    let total = base_bytes
        .saturating_add(dp_bytes)
        .saturating_add(bt_bytes);

    let min_bytes = 24 * 1024 * 1024;   // 24 MB floor
    let max_bytes = 768 * 1024 * 1024;  // 768 MB ceiling
    let clamped = total.clamp(min_bytes, max_bytes);

    // Align up to 8 MB so we never round *down* below requirement
    const ALIGN: usize = 8 * 1024 * 1024;
    (clamped + (ALIGN - 1)) & !(ALIGN - 1)
}

pub fn create_context(
    model_path: &Path,
    model: &str,
    gpu_device: Option<i32>,
    use_gpu: Option<bool>,
    enable_dtw: Option<bool>,
    audio_duration_secs: Option<f64>,
) -> Result<WhisperContext> {
    tracing::debug!("open model...");
    if !model_path.exists() {
        bail!("whisper file doesn't exist")
    }
    let mut ctx_params = WhisperContextParameters::default();
    // Resolve GPU usage (Windows default OFF, others forced ON upstream)
    let using_gpu = use_gpu.unwrap_or(false);
    ctx_params.use_gpu = using_gpu;
    // set GPU device number from preference
    if let Some(gpu_device) = gpu_device {
        ctx_params.gpu_device = gpu_device;
    }

    // set enable_dtw from preference
    if let Some(true) = enable_dtw {
        ctx_params.flash_attn(false); // DTW requires flash_attn off
        let model_preset = match model {
            "tiny.en" => DtwModelPreset::TinyEn,
            "tiny" => DtwModelPreset::Tiny,
            "base.en" => DtwModelPreset::BaseEn,
            "base" => DtwModelPreset::Base,
            "small.en" => DtwModelPreset::SmallEn,
            "small" => DtwModelPreset::Small,
            "medium.en" => DtwModelPreset::MediumEn,
            "medium" => DtwModelPreset::Medium,
            "large-v3" => DtwModelPreset::LargeV3,
            "large-v3-turbo" => DtwModelPreset::LargeV3Turbo,
            _ => DtwModelPreset::SmallEn, // Defaulting to SmallEn
        };

        let dtw_mem_size = calculate_dtw_mem_size(audio_duration_secs.unwrap_or(0.0));
        ctx_params.dtw_parameters(DtwParameters {
            mode: DtwMode::ModelPreset { model_preset },
            dtw_mem_size,
        });
    } else {
        // No DTW: allow flash-attn only on GPU
        if using_gpu {
            ctx_params.flash_attn(true);
        } else {
            ctx_params.flash_attn(false);
        }
    }

    // Print actual DTW state from ctx_params
    let dtw_enabled = enable_dtw.unwrap_or(false);
    tracing::debug!("GPU device: {:?}, use_gpu: {:?}, DTW: {}, flash_attn: {}", 
        ctx_params.gpu_device, ctx_params.use_gpu, dtw_enabled, ctx_params.flash_attn);
    let model_path = model_path
        .to_str()
        .ok_or_eyre("can't convert model option to str")?;
    tracing::debug!("creating whisper context with model path {}", model_path);
    let ctx_unwind_result = catch_unwind(AssertUnwindSafe(|| {
        WhisperContext::new_with_params(model_path, ctx_params).context("failed to open model")
    }));
    match ctx_unwind_result {
        Err(error) => {
            bail!("create whisper context crash: {:?}", error)
        }
        Ok(ctx_result) => {
            let ctx = ctx_result?;
            tracing::debug!("created context successfuly");
            Ok(ctx)
        }
    }
}

pub fn should_normalize(source: PathBuf) -> bool {
    if source.extension().unwrap_or_default() == "wav" {
        if let Ok(reader) = WavReader::open(source.clone()) {
            let spec = reader.spec();
            tracing::debug!(
                "Input WAV spec: channels={}, rate={}, bits={}, fmt={:?}",
                spec.channels, spec.sample_rate, spec.bits_per_sample, spec.sample_format
            );
            if spec.channels == 1 && spec.sample_rate == 16000 && spec.bits_per_sample == 16 {
                tracing::info!("Input is already mono 16kHz 16-bit PCM WAV; skipping normalization");
                return false;
            } else {
                tracing::info!(
                    "Normalization needed: channels={} (want 1), rate={} (want 16000), bits={} (want 16)",
                    spec.channels, spec.sample_rate, spec.bits_per_sample
                );
            }
        }
    } else {
        tracing::debug!(
            "Input extension is not WAV (ext={:?}); normalization will run",
            source.extension()
        );
    }
    true
}

fn generate_cache_key(source: &Path) -> u64 {
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);

    // Add file metadata (last modified time) to the hash
    if let Ok(metadata) = fs::metadata(source) {
        if let Ok(modified) = metadata.modified() {
            if let Ok(duration_since_epoch) = modified.duration_since(SystemTime::UNIX_EPOCH) {
                duration_since_epoch.as_secs().hash(&mut hasher);
                duration_since_epoch.subsec_nanos().hash(&mut hasher);
            }
        }
        // Optionally, you could also hash file size for even more robustness:
        metadata.len().hash(&mut hasher);
    }

    hasher.finish()
}

// This function must now be `async` because it calls the async `normalize` function.
pub async fn create_normalized_audio<R: Runtime>(
    app: AppHandle<R>,
    source: PathBuf,
    additional_ffmpeg_args: Option<Vec<String>>,
) -> Result<PathBuf> {
    tracing::debug!("normalize {:?}", source.display());

    let cache_key = generate_cache_key(&source);
    let path_resolver = app.path();
    let out_path = path_resolver
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join(format!("{:x}.wav", cache_key));

    // CACHING DISABLED: Always run normalization, ignore cache
    // if out_path.exists() {
    //     println!("Using cached normalized audio: {}", out_path.display());
    //     tracing::info!("Using cached normalized audio: {}", out_path.display());
    //     return Ok(out_path);
    // }

    audio::normalize(app, source, out_path.clone(), additional_ffmpeg_args)
        .await
        .map_err(|e| eyre::eyre!("Failed to normalize audio: {}", e))?;

    Ok(out_path)
}

fn setup_params(options: &TranscribeOptions) -> FullParams {
    // Determine the beam size or best_of value, defaulting to 5
    let mut beam_size_or_best_of = options.sampling_bestof_or_beam_size.unwrap_or(5).max(1);

    // Decide on the sampling strategy
    let sampling_strategy = match options.sampling_strategy.as_deref() {
        Some("greedy") => SamplingStrategy::Greedy {
            best_of: beam_size_or_best_of,
        },
        _ => SamplingStrategy::BeamSearch {
            beam_size: beam_size_or_best_of,
            patience: -1.0,
        },
    };
    tracing::debug!("sampling strategy: {:?}", sampling_strategy);

    let mut params = FullParams::new(sampling_strategy);

    // Basic config
    params.set_print_special(false);
    params.set_print_progress(true);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_token_timestamps(true);

    // Set input language
    if let Some(ref lang) = options.lang {
        params.set_language(Some(lang));
    }

    // Set translation options
    if options.translate.unwrap_or(false) {
        params.set_translate(true);
    }

    // Optional temperature (only greedy sampling supports temperature > 0)
    if options.sampling_strategy.as_deref() == Some("greedy") {
        if let Some(temp) = options.temperature {
            params.set_temperature(temp);
        }
    }

    // Optional max text context
    if let Some(ctx) = options.max_text_ctx {
        params.set_n_max_text_ctx(ctx);
    }

    // Optional initial prompt
    if let Some(ref prompt) = options.init_prompt {
        params.set_initial_prompt(prompt);
    }

    // Optional thread count
    if let Some(threads) = options.n_threads {
        params.set_n_threads(threads);
    }

    params
}

/// Aggregates speakers from transcript segments, similar to the frontend logic
fn aggregate_speakers_from_segments(segments: &[Segment]) -> (Vec<Speaker>, Vec<Segment>) {
    use std::collections::HashMap;

    // Build speaker map: speaker_name -> (index, start_time, end_time)
    let mut speaker_info: HashMap<String, (usize, f64, f64)> = HashMap::new();
    let mut speaker_counter = 0;

    // First pass: collect unique speakers and assign indices
    for segment in segments.iter() {
        if let Some(ref speaker_id) = segment.speaker_id {
            let speaker_name = format!("Speaker {}", speaker_id.trim());
            if !speaker_name.is_empty() {
                if !speaker_info.contains_key(&speaker_name) {
                    speaker_info.insert(
                        speaker_name.clone(),
                        (speaker_counter, segment.start, segment.end),
                    );
                    speaker_counter += 1;
                }
            }
        }
    }

    // Create updated segments with new speaker IDs
    let mut updated_segments = segments.to_vec();
    for segment in updated_segments.iter_mut() {
        if let Some(ref speaker_id) = segment.speaker_id {
            let speaker_name = format!("Speaker {}", speaker_id.trim());
            if let Some(&(index, _, _)) = speaker_info.get(&speaker_name) {
                segment.speaker_id = Some(index.to_string());
            }
        }
    }

    // Convert speaker info to speakers array, sorted by index
    let mut speakers = Vec::new();
    let mut speaker_list: Vec<(String, (usize, f64, f64))> = speaker_info.into_iter().collect();
    speaker_list.sort_by_key(|(_, (index, _, _))| *index);

    for (name, (_, start, end)) in speaker_list {
        speakers.push(Speaker {
            name,
            sample: Sample { start, end },
            fill: ColorModifier::default(),
            outline: ColorModifier::default(),
            border: ColorModifier::default(),
        });
    }

    (speakers, updated_segments)
}

// Processes diarization for transcript segments using an optimized diarization-first pipeline
fn process_diarization(
    segments: Vec<Segment>,
    original_samples: &[i16],
    diarize_options: &DiarizeOptions,
    progress_callback: Option<Box<dyn Fn(i32) + Send + Sync>>,
) -> Result<(Vec<Speaker>, Vec<Segment>), eyre::Report> {
    tracing::debug!("Diarize enabled {:?}", diarize_options);
    let mut embedding_manager = pyannote_rs::EmbeddingManager::new(diarize_options.max_speakers);
    let mut extractor = pyannote_rs::EmbeddingExtractor::new(&diarize_options.embedding_model_path)
        .map_err(|e| eyre!("{:?}", e))?;

    // Get speech segments as an iterator
    let diarize_segments_iter =
        pyannote_rs::get_segments(original_samples, 16000, &diarize_options.segment_model_path)
            .map_err(|e| eyre!("{:?}", e))?;

    // Process segments efficiently using iterator and pre-computed embeddings
    let aligned_segments = process_and_align_segments(
        segments,
        diarize_segments_iter,
        &mut embedding_manager,
        &mut extractor,
        diarize_options,
        progress_callback.as_ref(),
    )
    .context("Failed to process and align segments with diarization")?;

    // Aggregate speakers from segments
    let (speakers, segments) = aggregate_speakers_from_segments(&aligned_segments);

    Ok((speakers, segments))
}

/// Optimized function that processes diarization segments and aligns them with transcript segments
/// Uses iterator processing and caches embeddings to improve efficiency
fn process_and_align_segments(
    transcript_segments: Vec<Segment>,
    diarize_segments_iter: impl Iterator<Item = Result<pyannote_rs::Segment, eyre::Report>>,
    embedding_manager: &mut pyannote_rs::EmbeddingManager,
    extractor: &mut pyannote_rs::EmbeddingExtractor,
    diarize_options: &DiarizeOptions,
    progress_callback: Option<&Box<dyn Fn(i32) + Send + Sync>>,
) -> Result<Vec<Segment>> {
    use std::collections::HashMap;

    // Cache for computed embeddings to avoid recomputation
    let mut embedding_cache: HashMap<(u64, u64), (Vec<f32>, String)> = HashMap::new();

    // Process diarization segments and build a sorted list for efficient lookup
    let mut diarization_segments = Vec::new();

    // Collect segments first to track progress
    let diarize_segments_vec: Vec<_> = diarize_segments_iter.collect();
    let total_segments = diarize_segments_vec.len();

    // Emit initial progress
    if let Some(callback) = progress_callback {
        callback(0);
    }

    for (segment_index, diar_result) in diarize_segments_vec.into_iter().enumerate() {
        let diar_seg =
            diar_result.map_err(|e| eyre!("Error processing diarization segment: {:?}", e))?;

        // Create a cache key based on start/end times (rounded to avoid floating point issues)
        let cache_key = (
            (diar_seg.start * 1000.0) as u64,
            (diar_seg.end * 1000.0) as u64,
        );

        // Compute embedding for this segment
        let (embedding_vec, speaker_id) = match extractor.compute(&diar_seg.samples) {
            Ok(embedding_result) => {
                let embedding_vec: Vec<f32> = embedding_result.collect();

                // Find the speaker using the same logic as the original pipeline
                let speaker_id =
                    if embedding_manager.get_all_speakers().len() == diarize_options.max_speakers {
                        embedding_manager
                            .get_best_speaker_match(embedding_vec.clone())
                            .map(|r| r.to_string())
                            .unwrap_or_else(|_| "?".to_string())
                    } else {
                        embedding_manager
                            .search_speaker(embedding_vec.clone(), diarize_options.threshold)
                            .map(|r| r.to_string())
                            .unwrap_or_else(|| "?".to_string())
                    };

                (embedding_vec, speaker_id)
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to compute embedding for diarization segment: {:?}",
                    e
                );
                (Vec::new(), "?".to_string())
            }
        };

        // Cache the embedding and speaker ID
        embedding_cache.insert(cache_key, (embedding_vec, speaker_id.clone()));

        // Store segment with computed speaker ID
        diarization_segments.push((diar_seg, speaker_id));

        // Emit progress update
        if let Some(callback) = progress_callback {
            let progress = ((segment_index + 1) as f32 / total_segments as f32 * 80.0) as i32; // First 80% for diarization (embedding computation is heavy)
            callback(progress);
        }
    }

    // Sort diarization segments by start time for more efficient searching
    diarization_segments.sort_by(|a, b| {
        a.0.start
            .partial_cmp(&b.0.start)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut aligned_segments = Vec::with_capacity(transcript_segments.len());
    let total_transcript_segments = transcript_segments.len();

    // Process transcript segments and align with diarization
    for (transcript_index, mut transcript_seg) in transcript_segments.into_iter().enumerate() {
        let seg_start = transcript_seg.start;
        let seg_end = transcript_seg.end;
        let seg_midpoint = (seg_start + seg_end) / 2.0;

        let mut best_speaker_id = None;
        let mut best_overlap = 0.0;

        // Use binary search to find potential overlapping segments more efficiently
        let start_idx = diarization_segments
            .binary_search_by(|probe| {
                probe
                    .0
                    .end
                    .partial_cmp(&seg_start)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .unwrap_or_else(|idx| idx);

        // Only check segments that could potentially overlap
        for (diar_seg, speaker_id) in diarization_segments[start_idx..].iter() {
            let diar_start = diar_seg.start;
            let diar_end = diar_seg.end;

            // Early termination if we've passed all possible overlapping segments
            if diar_start > seg_end {
                break;
            }

            // Calculate overlap between transcript segment and diarization segment
            let overlap_start = seg_start.max(diar_start);
            let overlap_end = seg_end.min(diar_end);
            let overlap_duration = (overlap_end - overlap_start).max(0.0);

            // Also check if the midpoint falls within the diarization segment
            let midpoint_in_segment = seg_midpoint >= diar_start && seg_midpoint <= diar_end;

            // Prefer segments where midpoint is contained, otherwise use largest overlap
            let score = if midpoint_in_segment {
                overlap_duration + 1000.0 // Bonus for midpoint containment
            } else {
                overlap_duration
            };

            if score > best_overlap && overlap_duration > 0.1 {
                // Minimum 100ms overlap
                best_overlap = score;
                best_speaker_id = Some(speaker_id.clone());
            }
        }

        // Assign the speaker ID
        transcript_seg.speaker_id = best_speaker_id;
        aligned_segments.push(transcript_seg);

        // Emit progress update for alignment phase (80-100%)
        if let Some(callback) = progress_callback {
            let progress = 80
                + ((transcript_index + 1) as f32 / total_transcript_segments as f32 * 20.0) as i32;
            callback(progress);
        }
    }

    // Ensure we emit 100% completion
    if let Some(callback) = progress_callback {
        callback(100);
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    Ok(aligned_segments)
}


fn cs_to_s(cs: i64) -> f64 { (cs as f64) * 0.01 } // centiseconds → seconds

// Returns true if `s` is *only* a control marker like "[_BEG_]" or "[_TT_320]".
fn is_whole_control_token(s: &str) -> bool {
    let t = s.trim_matches('\0').trim();
    if !(t.starts_with("[_") && t.ends_with(']')) { return false; }
    // ensure inner is all A–Z / 0–9 / '_' (how whisper.cpp prints its markers)
    let inner = &t[2..t.len()-1];
    !inner.is_empty() && inner.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
}

// Strips *embedded* control markers anywhere in the string.
fn strip_embedded_control_markers(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(chars.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '[' && i + 2 < chars.len() && chars[i + 1] == '_' {
            // find the closing ']'
            if let Some(rel_end) = chars[i + 2..].iter().position(|&c| c == ']') {
                let end = i + 2 + rel_end;
                // validate inner
                let valid_inner = chars[i + 2..end]
                    .iter()
                    .all(|&c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_');
                if valid_inner {
                    i = end + 1; // skip whole marker
                    continue;
                }
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

pub fn get_word_timestamps_from_segment(seg: &WhisperSegment, enable_dtw: bool) -> Vec<WordTimestamp> {
    #[derive(Clone)]
    struct Tok {
        text: String,
        p: f32,
        t0: f64,
        t1: f64,
        anchor: Option<f64>,
    }

    // 1) Collect tokens, skipping whole control tokens and stripping embedded markers.
    let n = seg.n_tokens() as usize;
    let mut toks: Vec<Tok> = Vec::with_capacity(n);

    for i in 0..n {
        if let Some(tok) = seg.get_token(i as i32) {
            let raw = tok.to_str_lossy().map(|c| c.into_owned()).unwrap_or_default();

            // Skip if token is purely a control marker like "[_BEG_]" or "[_TT_320]"
            if is_whole_control_token(&raw) {
                continue;
            }

            // Remove any embedded markers that hitchhike inside printable tokens
            let clean = strip_embedded_control_markers(&raw);

            // Skip if nothing printable remains
            if clean.trim_matches('\0').trim().is_empty() {
                continue;
            }

            let td = tok.token_data();
            toks.push(Tok {
                text: clean,
                p: td.p,
                t0: cs_to_s(td.t0),
                t1: cs_to_s(td.t1),
                anchor: if enable_dtw && td.t_dtw > 0 { Some(cs_to_s(td.t_dtw)) } else { None },
            });
        }
    }

    if toks.is_empty() {
        return Vec::new();
    }

    // 2) Token bounds via DTW midpoints (safe neighbor lookups), fallback to t0/t1.
    let mut bounds = Vec::with_capacity(toks.len());
    for i in 0..toks.len() {
        let a_prev = i.checked_sub(1).and_then(|j| toks.get(j)).and_then(|t| t.anchor);
        let a_here = toks[i].anchor;
        let a_next = toks.get(i + 1).and_then(|t| t.anchor);

        let start = match (a_prev, a_here) { (Some(l), Some(c)) => 0.5 * (l + c), _ => toks[i].t0 };
        let end   = match (a_here, a_next) { (Some(c), Some(r)) => 0.5 * (c + r), _ => toks[i].t1 };
        bounds.push((start, end));
    }

    // 3) Group into words using "leading space/newline starts a new word".
    let mut words = Vec::<WordTimestamp>::new();
    let mut cur = String::new();
    let mut ps: Vec<f32> = Vec::new();
    let mut w_start = bounds[0].0;
    let mut w_end = bounds[0].1;
    let mut started = false;

    for (i, t) in toks.iter().enumerate() {
        let s = t.text.as_str();
        let new_word_boundary = s.starts_with(' ') || s.starts_with('\n');

        if new_word_boundary && started {
            let w = cur.trim();
            if !w.is_empty() {
                let p = (!ps.is_empty()).then(|| ps.iter().copied().sum::<f32>() / ps.len() as f32);
                words.push(WordTimestamp { word: w.to_string(), start: w_start, end: w_end, probability: p });
            }
            cur.clear();
            ps.clear();
            started = false;
        }

        if !started {
            w_start = bounds[i].0;
            started = true;
        }
        w_end = bounds[i].1;
        cur.push_str(s);
        ps.push(t.p);
    }

    if started {
        let w = cur.trim();
        if !w.is_empty() {
            let p = (!ps.is_empty()).then(|| ps.iter().copied().sum::<f32>() / ps.len() as f32);
            words.push(WordTimestamp { word: w.to_string(), start: w_start, end: w_end, probability: p });
        }
    }

    words
}

/// Detect speech segments with Silero VAD via whisper-rs.
/// `samples` must be mono f32 at 16_000 Hz in [-1.0, 1.0].
fn detect_speech_segments(vad_model: &str, samples: &[f32]) -> Result<Vec<(usize, usize)>> {
    // 1) Configure the VAD execution context (CPU is fine; GPU here means CUDA-only).
    let ctx = WhisperVadContextParams::new();

    // 2) Create the VAD context with the Silero model path
    let mut vad = WhisperVadContext::new(vad_model, ctx)?; // segments_from_samples needs &mut self.

    // 3) Tune VAD behavior (defaults are reasonable; adjust if needed)
    let vadp = WhisperVadParams::new();
    // Examples:
    // vadp.set_threshold(0.5);
    // vadp.set_min_speech_duration(250);    // ms
    // vadp.set_min_silence_duration(100);   // ms
    // vadp.set_speech_pad(30);              // ms
    // vadp.set_samples_overlap(0.10);       // seconds of overlap between segments
    // vadp.set_max_speech_duration(f32::MAX);
    // (See docs for meanings / defaults - https://docs.rs/whisper-rs/latest/x86_64-apple-darwin/whisper_rs/struct.WhisperVadParams.html)

    // 4) Run the whole pipeline
    let segs = vad.segments_from_samples(vadp, samples)?; // returns an iterator over segments (https://docs.rs/whisper-rs/latest/x86_64-apple-darwin/whisper_rs/struct.WhisperVadContext.html)

    // 5) Convert centiseconds → sample indices at 16 kHz, clamp, and drop degenerate ranges
    const SR: f32 = 16_000.0;
    let n = samples.len() as f32;

    let out: Vec<(usize, usize)> = segs
        .map(|s| {
            let start = ((s.start / 100.0) * SR).round().clamp(0.0, n) as usize;
            let end   = ((s.end   / 100.0) * SR).round().clamp(0.0, n) as usize;
            (start, end)
        })
        .filter(|(a, b)| b > a)
        .collect();

    Ok(out)
}

// Optional: sentence-case helper for segment text (and first word if you want).
fn sentence_case_first_alpha(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut done = false;
    for ch in s.chars() {
        if !done && ch.is_alphabetic() {
            for up in ch.to_uppercase() { out.push(up); }
            done = true;
        } else {
            out.push(ch);
        }
    }
    out
}

pub async fn run_transcription_pipeline<R: Runtime>(
    app: AppHandle<R>,
    ctx: WhisperContext,
    options: TranscribeOptions,
    progress_callback: Option<Box<dyn Fn(i32) + Send + Sync>>,
    new_segment_callback: Option<Box<dyn Fn(Segment) + Send>>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send>>,
    diarize_options: Option<DiarizeOptions>,
    additional_ffmpeg_args: Option<Vec<String>>,
    enable_diarize: Option<bool>,
) -> Result<Transcript> {
    tracing::debug!("Transcribe called with {:?}", options);

    if !PathBuf::from(options.path.clone()).exists() {
        bail!("audio file doesn't exist")
    }

    // --- Normalization (Async) ---
    // This part is async, so we await it directly.
    let out_path = if should_normalize(options.path.clone().into()) {
        create_normalized_audio(
            app.clone(),
            options.path.clone().into(),
            additional_ffmpeg_args,
        )
        .await?
    } else {
        tracing::debug!("Skip normalize");
        options.path.clone().into()
    };
    tracing::debug!("Audio path: {}", out_path.display());

    // Decode normalized WAV to mono 16k PCM16 samples with robust fallback (ffmpeg if needed)
    let original_samples = audio::decode_pcm_mono16k_from_wav(app.clone(), out_path.clone())
        .await
        .context("failed to decode normalized WAV to PCM samples")?;

    // --- Transcription (Blocking) ---
    // This is a CPU-intensive task. We run it on a blocking thread
    // to avoid freezing the UI.
    let transcript = tokio::task::spawn_blocking(move || {
        let mut state = ctx.create_state().context("failed to create state")?;
        let mut params = setup_params(&options);
        
        let st = std::time::Instant::now();

        // Only set up Whisper's internal progress callback when diarization is NOT enabled
        // When diarization is enabled, we handle progress manually in the diarization loop above
        if let Some(callback) = progress_callback {
            let mut guard = PROGRESS_CALLBACK.lock().map_err(|e| eyre!("{:?}", e))?;
            let internal_progress_callback = move |progress: i32| callback(progress);
            *guard = Some(Box::new(internal_progress_callback));
        }
        let mut full_samples = vec![0.0f32; original_samples.len()];

        whisper_rs::convert_integer_to_float_audio(&original_samples, &mut full_samples)?;

        if let Some(abort_callback) = abort_callback {
            params.set_abort_callback_safe(abort_callback);
        }

        if PROGRESS_CALLBACK
            .lock()
            .map_err(|e| eyre!("{:?}", e))?
            .as_ref()
            .is_some()
        {
            params.set_progress_callback_safe(|progress| {
                if let Ok(mut cb) = PROGRESS_CALLBACK.lock() {
                    if let Some(cb) = cb.as_mut() {
                        cb(progress);
                    }
                }
            });
        }

        // Determine if we need to transcribe multiple clips separately
        let audio_clips = options.segments.clone();
        let has_multiple_clips = audio_clips.as_ref().map(|c| c.len() > 0).unwrap_or(false);
        
        let mut segments_out: Vec<Segment> = Vec::new();
        let mut total_empty_segments = 0usize;
        let mut total_chars = 0usize;

        if has_multiple_clips {
            // SEPARATE CLIP TRANSCRIPTION: Process each clip independently
            // This ensures no segment can ever span across clips
            let clips = audio_clips.unwrap();
            tracing::info!("Transcribing {} clip(s) separately for accurate timing", clips.len());
            
            for (clip_idx, clip) in clips.iter().enumerate() {
                // Extract this clip's audio samples
                let clip_samples = match extract_clip_samples(&full_samples, clip) {
                    Some(s) => s,
                    None => {
                        tracing::warn!("Skipping empty clip {}", clip_idx);
                        continue;
                    }
                };
                
                // Create a fresh state for this clip
                let mut clip_state = ctx.create_state().context("failed to create state for clip")?;
                let clip_params = setup_params(&options);
                
                // Transcribe this clip
                clip_state.full(clip_params, &clip_samples).context("failed to transcribe clip")?;
                
                let num_clip_segments = clip_state.full_n_segments();
                tracing::debug!("Clip {} produced {} segments", clip_idx, num_clip_segments);
                
                // Extract segments from this clip and apply timeline offset
                for (seg_idx, seg) in clip_state.as_iter().enumerate() {
                    let mut text = seg.to_str_lossy().map(|c| c.into_owned()).unwrap_or_default();
                    text = text.trim_start().to_string();

                    if text == "[BLANK_AUDIO]" {
                        continue;
                    }

                    if seg_idx == 0 && segments_out.is_empty() {
                        text = sentence_case_first_alpha(&text);
                    }

                    total_chars += text.len();

                    let t0_frames = seg.start_timestamp();
                    let t1_frames = seg.end_timestamp();
                    let approx_start = cs_to_s(t0_frames);
                    let approx_end = cs_to_s(t1_frames);
                    
                    if text.trim().is_empty() {
                        total_empty_segments += 1;
                        continue;
                    }

                    // Get word timestamps
                    let mut word_timestamps = get_word_timestamps_from_segment(&seg, options.enable_dtw.unwrap_or(false));
                    let (seg_start, seg_end, words_opt) = if word_timestamps.is_empty() {
                        (approx_start, approx_end, None)
                    } else {
                        if seg_idx == 0 && segments_out.is_empty() {
                            word_timestamps.first_mut().unwrap().word = sentence_case_first_alpha(&word_timestamps.first().unwrap().word);
                        }
                        let s = word_timestamps.first().map(|w| w.start).unwrap_or(approx_start);
                        let e = word_timestamps.last().map(|w| w.end).unwrap_or(s);
                        (s, e, Some(word_timestamps))
                    };

                    // Apply timeline offset to this segment
                    let timeline_offset = clip.timeline_offset;
                    let final_start = round_to_places(seg_start + timeline_offset, 3);
                    let final_end = round_to_places(seg_end + timeline_offset, 3);
                    
                    // Apply offset to word timestamps too
                    let final_words = words_opt.map(|words| {
                        words.into_iter().map(|mut w| {
                            w.start = round_to_places(w.start + timeline_offset, 3);
                            w.end = round_to_places(w.end + timeline_offset, 3);
                            w
                        }).collect()
                    });

                    segments_out.push(Segment {
                        speaker_id: None,
                        start: final_start,
                        end: final_end,
                        text,
                        words: final_words,
                    });
                }
            }
            
            tracing::info!("Transcribed {} segments from {} clips", segments_out.len(), clips.len());
            
        } else {
            // SINGLE AUDIO TRANSCRIPTION: Original behavior
            state.full(params, &full_samples).context("failed to transcribe")?;
            
            let num_segments = state.full_n_segments();
            if num_segments == 0 {
                bail!("no segments found!")
            }
            tracing::debug!("found {} sentence segments", num_segments);

            for (seg_idx, seg) in state.as_iter().enumerate() {
                let mut text = seg.to_str_lossy().map(|c| c.into_owned()).unwrap_or_default();
                text = text.trim_start().to_string();

                if text == "[BLANK_AUDIO]" {
                    continue;
                }

                if seg_idx == 0 {
                    text = sentence_case_first_alpha(&text);
                }

                total_chars += text.len();

                let t0_frames = seg.start_timestamp();
                let t1_frames = seg.end_timestamp();
                let approx_start = cs_to_s(t0_frames);
                let approx_end = cs_to_s(t1_frames);
            
                if text.trim().is_empty() {
                    total_empty_segments += 1;
                    tracing::warn!(
                        "Seg {} has empty/whitespace text in [{:.2}-{:.2}]",
                        seg_idx, approx_start, approx_end
                    );
                }
            
                let mut word_timestamps = get_word_timestamps_from_segment(&seg, options.enable_dtw.unwrap_or(false));
                let (seg_start, seg_end, words_opt) = if word_timestamps.is_empty() {
                    (approx_start, approx_end, None)
                } else {
                    if seg_idx == 0 {
                        word_timestamps.first_mut().unwrap().word = sentence_case_first_alpha(&word_timestamps.first().unwrap().word);
                    }
                    let s = word_timestamps.first().map(|w| w.start).unwrap_or(approx_start);
                    let e = word_timestamps.last().map(|w| w.end).unwrap_or(s);
                    (s, e, Some(word_timestamps))
                };
            
                if let Some(last) = segments_out.last_mut() {
                    if last.end > seg_start {
                        last.end = seg_start;
                    }
                    if let Some(words) = &mut last.words {
                        if let Some(last_word) = words.last_mut() {
                            if last_word.end > last.end {
                                last_word.end = last.end;
                            }
                        }
                    }
                }
            
                segments_out.push(Segment {
                    speaker_id: None,
                    start: seg_start,
                    end: seg_end,
                    text,
                    words: words_opt,
                });
            }
        }

        tracing::info!(
            "Transcription summary: segments={}, empty_segments={}, total_chars={}",
            segments_out.len(), total_empty_segments, total_chars
        );
        if total_empty_segments == segments_out.len() {
            tracing::warn!("All segments are empty/whitespace. Upstream audio or decoding may be silent/corrupted.");
        }

        // Process with diarization if enabled
        let (mut speakers, mut segments) = if let Some(true) = enable_diarize {
            // Emit diarization start event
            let _ = app.emit("diarization-start", ());

            // Create diarization progress callback (atomic store; UI emission is periodic)
            let diarize_progress_callback = Some(Box::new(move |progress: i32| {
                LATEST_DIARIZE_PROGRESS.store(progress, Ordering::Relaxed);
            }) as Box<dyn Fn(i32) + Send + Sync>);

            let diarize_opts = match &diarize_options {
                Some(opts) => opts,
                None => {
                    return Err(eyre!(
                        "Diarization enabled but no diarization options provided"
                    ))
                }
            };
            let result = process_diarization(
                segments_out,
                &original_samples,
                diarize_opts,
                diarize_progress_callback,
            )?;

            // Emit diarization complete event
            let _ = app.emit("diarization-complete", ());

            result
        } else {
            // No speaker aggregation needed for non-diarized transcripts
            (Vec::new(), segments_out)
        };

        // Apply offset for single-audio mode (multi-clip mode already applied offsets above)
        if !has_multiple_clips {
            let offset = options.offset.unwrap_or(0.0);

            // Apply offset to each segment
            for segment in segments.iter_mut() {
                segment.start = round_to_places(segment.start + offset, 3);
                segment.end = round_to_places(segment.end + offset, 3);
                if let Some(words) = &mut segment.words {
                    for word in words.iter_mut() {
                        word.start = round_to_places(word.start + offset, 3);
                        word.end = round_to_places(word.end + offset, 3);
                    }
                }
            }

            // Apply offset to each speaker
            for speaker in speakers.iter_mut() {
                speaker.sample.start = round_to_places(speaker.sample.start + offset, 3);
                speaker.sample.end = round_to_places(speaker.sample.end + offset, 3);
            }
        }

        let transcript = Transcript {
            processing_time_sec: st.elapsed().as_secs(),
            segments,
            speakers,
        };
        return Ok(transcript);
    })
    .await??;
    Ok(transcript)
}
