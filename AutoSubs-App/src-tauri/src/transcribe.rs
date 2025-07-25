use crate::config::TranscribeOptions;
use crate::transcript::{Segment, Transcript};
use crate::audio;
use eyre::{bail, eyre, Context, OptionExt, Result};
use hound::WavReader;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;
pub use whisper_rs::SegmentCallbackData;
pub use whisper_rs::WhisperContext;
pub use whisper_rs::WhisperState;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContextParameters};
use whisper_rs::DtwParameters;
use whisper_rs::DtwMode;
use whisper_rs::DtwModelPreset;
use serde::Deserialize;
use tauri::{AppHandle, Emitter, command, Manager};
use std::fs;
use std::time::SystemTime;

type ProgressCallbackType = once_cell::sync::Lazy<Mutex<Option<Box<dyn Fn(i32) + Send + Sync>>>>;
static PROGRESS_CALLBACK: ProgressCallbackType = once_cell::sync::Lazy::new(|| Mutex::new(None));

// Global cancellation state
static SHOULD_CANCEL: once_cell::sync::Lazy<Mutex<bool>> = once_cell::sync::Lazy::new(|| Mutex::new(false));

// --- Frontend Options Struct ---
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FrontendTranscribeOptions {
    pub audio_path: String,
    pub model: String, // e.g., "tiny", "base", "small", "medium", "large"
    pub lang: Option<String>,
    pub enable_diarize: bool,
    pub max_speakers: Option<usize>,
}

#[command]
pub async fn cancel_transcription() -> Result<(), String> {
    println!("Cancellation requested");
    if let Ok(mut should_cancel) = SHOULD_CANCEL.lock() {
        *should_cancel = true;
        println!("Cancellation flag set to true");
    } else {
        return Err("Failed to acquire cancellation lock".to_string());
    }
    Ok(())
}

#[command]
pub async fn transcribe_audio(app: AppHandle, options: FrontendTranscribeOptions) -> Result<Transcript, String> {
    let start_time = Instant::now();
    println!("Starting transcription with options: {:?}", options);
    
    // Reset cancellation flag at the start of transcription
    if let Ok(mut should_cancel) = SHOULD_CANCEL.lock() {
        *should_cancel = false;
        println!("Cancellation flag reset to false");
    }

    let enable_dtw = true;

    let model_path = crate::models::download_model_if_needed(app.clone(), &options.model, &options.lang)?;

    let audio_duration = crate::audio::get_audio_duration(app.clone(), options.audio_path.clone())
        .await
        .map_err(|e| format!("Failed to get audio duration: {}", e))?;

    let ctx = create_context(
        &PathBuf::from(model_path),
        &options.model,
        &options.lang,
        None,
        None,
        Some(enable_dtw),
        Some(audio_duration),
    )
    .map_err(|e| format!("Failed to create Whisper context: {}", e))?;

    let transcribe_options = TranscribeOptions {
        path: options.audio_path.clone().into(),
        lang: options.lang,
        init_prompt: None,
        max_sentence_len: None,
        verbose: None,
        max_text_ctx: None,
        n_threads: None,
        temperature: None,
        translate: None,
        word_timestamps: Some(true),
        sampling_bestof_or_beam_size: None,
        sampling_strategy: None,
    };

        let diarize_options = if options.enable_diarize {
        println!("Diarization enabled, checking for models...");
        let seg_url = "https://github.com/thewh1teagle/pyannote-rs/releases/download/v0.1.0/segmentation-3.0.onnx";
        let emb_url = "https://github.com/thewh1teagle/pyannote-rs/releases/download/v0.1.0/wespeaker_en_voxceleb_CAM++.onnx";

                let segment_model_path = crate::models::download_diarize_model_if_needed(app.clone(), "segmentation-3.0.onnx", seg_url).await?
            .to_string_lossy().into_owned();
        let embedding_model_path = crate::models::download_diarize_model_if_needed(app.clone(), "wespeaker_en_voxceleb_CAM++.onnx", emb_url).await?
            .to_string_lossy().into_owned();

        Some(DiarizeOptions {
            segment_model_path,
            embedding_model_path,
            threshold: 0.5,
            max_speakers: options.max_speakers.unwrap_or(usize::MAX),
        })
    } else {
        None
    };

    // Progress callback: emit to frontend
    let progress_app = app.clone();
    let progress_callback = Some(Box::new(move |progress: i32| {
        let _ = progress_app.emit("transcription-progress", progress);
    }) as Box<dyn Fn(i32) + Send + Sync>);

    // Abort callback: check cancellation flag
    let abort_callback = Some(Box::new(|| {
        if let Ok(should_cancel) = SHOULD_CANCEL.lock() {
            let cancelled = *should_cancel;
            if cancelled {
                println!("Transcription cancelled by user");
            }
            cancelled
        } else {
            false
        }
    }) as Box<dyn Fn() -> bool + Send>);

    // Await the async pipeline
    match run_transcription_pipeline(
        app,
        ctx,
        transcribe_options,
        progress_callback,
        None,
        abort_callback,
        diarize_options,
        None,
        enable_dtw,
        options.enable_diarize,
    ).await {
        Ok(mut transcript) => {
            transcript.processing_time_sec = start_time.elapsed().as_secs();
            println!("Transcription successful in {:.2}s", transcript.processing_time_sec);
            Ok(transcript)
        }
        Err(e) => {
            eprintln!("Error during transcription pipeline: {}", e);
            Err(format!("Transcription failed: {}", e))
        }
    }
}

fn calculate_dtw_mem_size(audio_duration_secs: f64) -> usize {
    // Base memory: 16MB (for very short audio)
    // Add ~4MB per second of audio
    let base_mb = 16.0;
    let mb_per_second = 4.0;
    let estimated_mb = (base_mb + (audio_duration_secs * mb_per_second)).ceil() as usize;
    
    // Ensure we have at least the minimum required
    let min_mb = 16;  // 16MB minimum
    let max_mb = 1024; // 1GB maximum to prevent excessive memory usage
    
    // Convert to bytes and ensure it's a multiple of 4MB (alignment)
    let bytes = (estimated_mb.max(min_mb).min(max_mb) * 1024 * 1024) & !0x3FFFFF;
    bytes
}

pub fn create_context(
    model_path: &Path,
    model: &str,
    lang: &Option<String>,
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
    if let Some(use_gpu) = use_gpu {
        ctx_params.use_gpu = use_gpu;
    }
    // set GPU device number from preference
    if let Some(gpu_device) = gpu_device {
        ctx_params.gpu_device = gpu_device;
    }
    if let Some(true) = enable_dtw {
        let dtw_mem_size = match audio_duration_secs {
            Some(duration) => {
                let mem_size = calculate_dtw_mem_size(duration);
                tracing::debug!(
                    "Audio duration: {:.2}s, Allocating DTW memory: {:.2}MB",
                    duration,
                    mem_size as f64 / (1024.0 * 1024.0)
                );
                mem_size
            }
            None => {
                // Fallback to default if duration is not provided
                let default_mb = 64;
                tracing::warn!(
                    "No audio duration provided, using default DTW memory: {}MB",
                    default_mb
                );
                default_mb * 1024 * 1024
            }
        };

        ctx_params.flash_attn(false);  // DTW requires flash_attn off
        let is_en = lang.as_deref().map_or(false, |l| l == "en");
        let model_preset = match (model, is_en) {
            ("tiny", true) => DtwModelPreset::TinyEn,
            ("tiny", false) => DtwModelPreset::Tiny,
            ("base", true) => DtwModelPreset::BaseEn,
            ("base", false) => DtwModelPreset::Base,
            ("small", true) => DtwModelPreset::SmallEn,
            ("small", false) => DtwModelPreset::Small,
            ("medium", true) => DtwModelPreset::MediumEn,
            ("medium", false) => DtwModelPreset::Medium,
            ("large", _) => DtwModelPreset::LargeV3,
            ("large-turbo", _) => DtwModelPreset::LargeV3Turbo,
            // Add a sensible default or handle other cases
            _ => DtwModelPreset::SmallEn, // Defaulting to SmallEn
        };

        ctx_params.dtw_parameters(DtwParameters {
            mode: DtwMode::ModelPreset { model_preset },
            dtw_mem_size,
        });
    }
    // Print actual DTW state from ctx_params
    let dtw_enabled = enable_dtw.unwrap_or(false);
    tracing::debug!("gpu device: {:?}", ctx_params.gpu_device);
    tracing::debug!("use gpu: {:?}", ctx_params.use_gpu);
    tracing::debug!("DTW enabled: {}", dtw_enabled);
    // print as well
    println!("gpu device: {:?}", ctx_params.gpu_device);
    println!("use gpu: {:?}", ctx_params.use_gpu);
    println!("DTW enabled: {}", dtw_enabled);
    let model_path = model_path.to_str().ok_or_eyre("can't convert model option to str")?;
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

// Check if necessary to normalise the audio
pub fn should_normalize(source: PathBuf) -> bool {
    if source.extension().unwrap_or_default() == "wav" {
        if let Ok(reader) = WavReader::open(source.clone()) {
            let spec = reader.spec();
            tracing::debug!("wav spec: {:?}", spec);
            if spec.channels == 1 && spec.sample_rate == 16000 && spec.bits_per_sample == 16 {
                return false;
            }
        }
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
pub async fn create_normalized_audio(
    app: AppHandle,
    source: PathBuf,
    additional_ffmpeg_args: Option<Vec<String>>,
) -> Result<PathBuf> {
    tracing::debug!("normalize {:?}", source.display());

    let cache_key = generate_cache_key(&source);
    let path_resolver = app.path();
    let out_path = path_resolver.app_cache_dir().unwrap_or_else(|_| std::env::temp_dir()).join(format!("{:x}.wav", cache_key));

    if out_path.exists() {
        println!("Using cached normalized audio: {}", out_path.display());
        tracing::info!("Using cached normalized audio: {}", out_path.display());
        return Ok(out_path);
    }

    audio::normalize(app, source, out_path.clone(), additional_ffmpeg_args)
        .await
        .map_err(|e| eyre::eyre!("Failed to normalize audio: {}", e))?;

    Ok(out_path)
}

fn setup_params(options: &TranscribeOptions) -> FullParams {
    let mut beam_size_or_best_of = options.sampling_bestof_or_beam_size.unwrap_or(5);
    if beam_size_or_best_of < 1 {
        beam_size_or_best_of = 5;
    }

    // Beam search by default
    let mut sampling_strategy = SamplingStrategy::BeamSearch {
        beam_size: beam_size_or_best_of,
        patience: -1.0,
    };
    // ^ Experimental, idk if it will be slower/faster/accurate https://github.com/ggml-org/whisper.cpp/blob/8b92060a10a89cd3e8ec6b4bb22cdc1af67c5667/src/whisper.cpp#L4867-L4882
    if options.sampling_strategy == Some("greedy".to_string()) {
        sampling_strategy = SamplingStrategy::Greedy {
            best_of: beam_size_or_best_of,
        };
    }
    tracing::debug!("sampling strategy: {:?}", sampling_strategy);

    let mut params = FullParams::new(sampling_strategy);
    tracing::debug!("set language to {:?}", options.lang);

    if let Some(true) = options.word_timestamps {
        params.set_token_timestamps(true);
        params.set_split_on_word(true);
        //params.set_max_len(options.max_sentence_len.unwrap_or(1));
    }

    if let Some(true) = options.translate {
        params.set_translate(true);
    }
    if options.lang.is_some() {
        params.set_language(options.lang.as_deref());
    }

    params.set_print_special(false);
    params.set_print_progress(true);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_token_timestamps(true);

    if let Some(temperature) = options.temperature {
        tracing::debug!("setting temperature to {temperature}");
        params.set_temperature(temperature);
    }

    if let Some(max_text_ctx) = options.max_text_ctx {
        tracing::debug!("setting n_max_text_ctx to {}", max_text_ctx);
        params.set_n_max_text_ctx(max_text_ctx)
    }

    // handle args
    if let Some(init_prompt) = options.init_prompt.to_owned() {
        tracing::debug!("setting init prompt to {init_prompt}");
        params.set_initial_prompt(&init_prompt);
    }

    if let Some(n_threads) = options.n_threads {
        tracing::debug!("setting n threads to {n_threads}");
        params.set_n_threads(n_threads);
    }
    params
}

fn get_word_timestamps(state: &WhisperState, seg: i32, enable_dtw: bool) -> Vec<crate::transcript::WordTimestamp> {
    let ntok = state.full_n_tokens(seg).unwrap() as usize;
    let mut word_timestamps = Vec::with_capacity(ntok);

    let start_of_segment = state.full_get_segment_t0(seg).unwrap_or(0);
    let end_of_segment = state.full_get_segment_t1(seg).unwrap_or(0);
    let mut prev_end_frame = start_of_segment;
    let mut current_word = String::new();
    let mut start_frame = start_of_segment;

    // Helper function to close the current word and add it to timestamps
    let close_current_word = |word: &mut String, timestamps: &mut Vec<crate::transcript::WordTimestamp>, 
                            _token_idx: i32, start: i64, end: i64, prob: f32| -> i64 {
        if !word.is_empty() {
            let end_frame = end.min(end_of_segment);
            timestamps.push(crate::transcript::WordTimestamp {
                word: word.clone(),
                start: (start as f64) * 0.01,
                end: (end_frame as f64) * 0.01,
                probability: Some(prob),
            });
            word.clear();
            end
        } else {
            start
        }
    };

    for i in 0..ntok {
        let token_text = state.full_get_token_text(seg, i as i32).unwrap();
        let data = state.full_get_token_data(seg, i as i32).unwrap();
        let is_special = token_text.starts_with('[') || token_text == "<|endoftext|>";
        let is_last = i == ntok - 1;

        // Handle special tokens
        if is_special {
            if is_last && !current_word.is_empty() {
                let prev_data = state.full_get_token_data(seg, (i - 1) as i32).unwrap();
                start_frame = close_current_word(&mut current_word, &mut word_timestamps, 
                                               i as i32, start_frame, prev_end_frame, prev_data.p);
            }
            continue;
        }

        // New word starts at tokens with leading space or if first token
        if token_text.starts_with(' ') && !current_word.is_empty() {
            let prev_data = state.full_get_token_data(seg, (i - 1) as i32).unwrap();
            start_frame = close_current_word(&mut current_word, &mut word_timestamps, 
                                           i as i32, start_frame, prev_end_frame, prev_data.p);
        }

        current_word.push_str(&token_text);
        prev_end_frame = if enable_dtw { data.t_dtw } else { data.t1 };

        // If last token, push the final word
        if is_last && !current_word.is_empty() {
            close_current_word(&mut current_word, &mut word_timestamps, 
                             i as i32, start_frame, prev_end_frame, data.p);
        }
    }

    word_timestamps
}

#[derive(Debug, Clone)]
pub struct DiarizeOptions {
    pub segment_model_path: String,
    pub embedding_model_path: String,
    pub threshold: f32,
    pub max_speakers: usize,
}

pub async fn run_transcription_pipeline(
    app: AppHandle,
    ctx: WhisperContext,
    options: TranscribeOptions,
    progress_callback: Option<Box<dyn Fn(i32) + Send + Sync>>,
    new_segment_callback: Option<Box<dyn Fn(Segment) + Send>>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send>>,
    diarize_options: Option<DiarizeOptions>,
    additional_ffmpeg_args: Option<Vec<String>>,
    enable_dtw: bool,
    enable_diarize: bool,
) -> Result<Transcript> {
    tracing::debug!("Transcribe called with {:?}", options);

    if !PathBuf::from(options.path.clone()).exists() {
        bail!("audio file doesn't exist")
    }

    // --- Normalization (Async) ---
    // This part is async, so we await it directly.
    let out_path = if should_normalize(options.path.clone().into()) {
        create_normalized_audio(app, options.path.clone().into(), additional_ffmpeg_args).await?
    } else {
        println!("Skip normalize");
        tracing::debug!("Skip normalize");
        options.path.clone().into()
    };
    println!("out path is {}", out_path.display());
    tracing::debug!("out path is {}", out_path.display());

    // --- Transcription (Blocking) ---
    // This is a CPU-intensive task. We run it on a blocking thread
    // to avoid freezing the UI.
    let transcript = tokio::task::spawn_blocking(move || {
        let original_samples = audio::parse_wav_file(&out_path)?;
        let mut state = ctx.create_state().context("failed to create key")?;
        let mut params = setup_params(&options);
        let st = std::time::Instant::now();
        let mut segments: Vec<Segment> = Vec::new();
    
        // Enable word timestamps if requested
        if options.word_timestamps.unwrap_or(false) {
            params.set_token_timestamps(true);
        } else {
            // Ensure word timestamps are enabled if we're in DTW mode
            if enable_dtw {
                params.set_token_timestamps(true);
            }
        }
        // Process with diarization if enabled
        if enable_diarize {
            let diarize_options = match diarize_options {
                Some(opts) => opts,
                None => return Err(eyre!("Diarization enabled but no diarization options provided")),
            };
            
            // Clear the global progress callback to prevent double progress reporting
            // We'll handle progress manually in the diarization loop
            {
                let mut guard = PROGRESS_CALLBACK.lock().map_err(|e| eyre!("{:?}", e))?;
                *guard = None;
            }
            
            // Also ensure no progress callback is set on the params object itself
            // This prevents Whisper from reporting progress for individual segments
            params.set_progress_callback_safe(|_| {
                // Do nothing - we handle progress manually in diarization mode
            });
            
            tracing::debug!("Diarize enabled {:?}", diarize_options);
            params.set_single_segment(true);
            let mut embedding_manager = pyannote_rs::EmbeddingManager::new(diarize_options.max_speakers);
            let mut extractor =
                pyannote_rs::EmbeddingExtractor::new(diarize_options.embedding_model_path)
                    .map_err(|e| eyre!("{:?}", e))?;

            // Get speech segments as an iterator and collect them to get accurate count
            let diarize_segments_iter = pyannote_rs::get_segments(
                &original_samples,
                16000,
                diarize_options.segment_model_path,
            )
            .map_err(|e| eyre!("{:?}", e))?;

            // Collect all segments first to get accurate total count for progress reporting
            let all_segments: Result<Vec<_>, _> = diarize_segments_iter.collect();
            let all_segments = all_segments.map_err(|e| eyre!("Error collecting segments: {:?}", e))?;
            let total_segments = all_segments.len();
            let mut processed_segments = 0;

            for (i, diarize_segment) in all_segments.into_iter().enumerate() {
                if let Some(ref abort_callback) = abort_callback {
                    if abort_callback() {
                        break;
                    }
                }

                // diarize_segment is already unwrapped from the iterator collection
                tracing::trace!(
                    "diarize segment: {} - {}",
                    diarize_segment.start,
                    diarize_segment.end
                );

                // Pad with 1 second (16000 samples at 16kHz) of silence to avoid Whisper dropping last tokens
                let mut padded_samples = diarize_segment.samples.clone();
                padded_samples.extend(std::iter::repeat(0i16).take(16000)); // 1000 ms of silence
                let mut samples = vec![0.0f32; padded_samples.len()];
                whisper_rs::convert_integer_to_float_audio(&padded_samples, &mut samples)?;
                state.full(params.clone(), &samples).context("failed to transcribe")?;

                let num_segments = state
                    .full_n_segments()
                    .context("failed to get number of segments")?;
                tracing::debug!("found {} sentence segments", num_segments);

                if num_segments > 0 {
                    let embedding_result: Vec<f32> = match extractor.compute(&diarize_segment.samples) {
                        Ok(result) => result.collect(),
                        Err(error) => {
                            tracing::error!("error: {:?}", error);
                            tracing::trace!(
                                "start = {:.2}, end = {:.2}, speaker = ?",
                                diarize_segment.start,
                                diarize_segment.end
                            );
                            continue; // Skip to the next segment
                        }
                    };

                    // Find the speaker
                    let speaker = if embedding_manager.get_all_speakers().len() == diarize_options.max_speakers {
                        embedding_manager
                            .get_best_speaker_match(embedding_result)
                            .map(|r| r.to_string())
                            .unwrap_or_else(|_| "?".to_string())
                    } else {
                        embedding_manager
                            .search_speaker(embedding_result, diarize_options.threshold)
                            .map(|r| r.to_string())
                            .unwrap_or_else(|| "?".to_string())
                    };

                    // Process all segments returned by Whisper for this diarization segment
                    for seg_idx in 0..num_segments {
                        // Get the segment text
                        let text = state
                            .full_get_segment_text_lossy(seg_idx as i32)
                            .context("failed to get segment")?;

                        let offset = diarize_segment.start as f64;
                        let (seg_start, seg_end);

                        // Get word timestamps if DTW is enabled
                        let words = if enable_dtw {
                            let mut words = get_word_timestamps(&state, seg_idx as i32, enable_dtw);
                            // Add offset to all word timestamps and round to 2 decimal places
                            for w in &mut words {
                                w.start = ((w.start + offset) * 100.0).trunc() / 100.0;
                                w.end = ((w.end + offset).min(diarize_segment.end as f64) * 100.0).trunc() / 100.0; // Ensure end time is within diarize segment bounds
                            }
                            seg_start = words.first().map_or(0.0, |w| w.start);
                            seg_end = words.last().map_or(seg_start, |w| w.end);
                            Some(words)
                        } else {
                            // Get segment start and end time in seconds (converted from centiseconds), relative to diarize segment start
                            let t0 = state.full_get_segment_t0(seg_idx as i32).unwrap_or(0) as f64 * 0.01 + offset;
                            let t1 = state.full_get_segment_t1(seg_idx as i32).unwrap_or(0) as f64 * 0.01 + offset;

                            // Round start time to 2 decimal places for consistency
                            seg_start = (t0 * 100.0).trunc() / 100.0;
                            // Ensure end is not after diarize segment end, and round to 2 decimals
                            seg_end = ((t1.min(diarize_segment.end as f64)) * 100.0).trunc() / 100.0;

                            // No word-level timestamps available
                            None
                        };

                        // Check that end time of previous segment is less than start time of current segment (fixes some edge cases where segments overlap)
                        if let Some(last) = segments.last_mut() {
                            if last.end > seg_start {
                                last.end = seg_start;
                            }
                            
                            // If word-level enabled, also update end time of last word
                            if let Some(words) = &mut last.words {
                                words.last_mut().unwrap().end = seg_end;
                            }
                        }

                        let segment = Segment {
                            speaker: Some(speaker.clone()),
                            start: seg_start,
                            end: seg_end,
                            text,
                            words,
                        };
                        segments.push(segment);
                    }

                    // Update progress
                    processed_segments += 1;
                    if let Some(ref progress_callback) = progress_callback {
                        let progress = if total_segments > 0 {
                            ((processed_segments as f64 / total_segments as f64) * 100.0) as i32
                        } else {
                            // Fallback to segment count if we can't estimate total
                            (i as f64 * 10.0) as i32 // Assuming ~10s per segment
                        };
                        progress_callback(progress);
                    }
                }
            }
            
            let transcript = Transcript {
                processing_time_sec: st.elapsed().as_secs(),
                segments
            };
            return Ok(transcript);
        } else {
            // Only set up Whisper's internal progress callback when diarization is NOT enabled
            // When diarization is enabled, we handle progress manually in the diarization loop above
            if let Some(callback) = progress_callback {
                let mut guard = PROGRESS_CALLBACK.lock().map_err(|e| eyre!("{:?}", e))?;
                let internal_progress_callback = move |progress: i32| callback(progress);
                *guard = Some(Box::new(internal_progress_callback));
            }
            let mut samples = vec![0.0f32; original_samples.len()];

            whisper_rs::convert_integer_to_float_audio(&original_samples, &mut samples)?;

            if let Some(abort_callback) = abort_callback {
                params.set_abort_callback_safe(abort_callback);
            }

            if PROGRESS_CALLBACK.lock().map_err(|e| eyre!("{:?}", e))?.as_ref().is_some() {
                params.set_progress_callback_safe(|progress| {
                    if let Ok(mut cb) = PROGRESS_CALLBACK.lock() {
                        if let Some(cb) = cb.as_mut() {
                            cb(progress);
                        }
                    }
                });
            }

            tracing::debug!("set start time...");

            tracing::debug!("setting state full...");
            state.full(params, &samples).context("failed to transcribe")?;
            let _et = std::time::Instant::now();

            tracing::debug!("getting segments count...");
            let num_segments = state.full_n_segments().context("failed to get number of segments")?;
            if num_segments == 0 {
                bail!("no segments found!")
            }
            tracing::debug!("found {} sentence segments", num_segments);
            
            // Process segments with or without diarization
            let num_segments = state.full_n_segments()?;
            tracing::debug!("found {} sentence segments", num_segments);

            // Process each segment and collect word timestamps
            let mut segments: Vec<Segment> = Vec::with_capacity(num_segments as usize);
        
            for seg_idx in 0..num_segments {
                let (seg_start, seg_end);

                // Get the segment text
                let text = state.full_get_segment_text_lossy(seg_idx as i32).context("failed to get segment")?;
                
                // Get word timestamps if DTW is enabled
                let words = if enable_dtw {
                    let mut word_timestamps = get_word_timestamps(&state, seg_idx as i32, enable_dtw);
                    for word in &mut word_timestamps {
                        // Round to 2 decimal places
                        word.start = (word.start as f64 * 100.0).trunc() / 100.0;
                        word.end = (word.end as f64 * 100.0).trunc() / 100.0;
                    }
                    seg_start = word_timestamps.first().unwrap().start;
                    seg_end = word_timestamps.last().unwrap().end;
                    Some(word_timestamps)
                } else {
                    // Convert centiseconds to seconds
                    let t0 = state.full_get_segment_t0(seg_idx as i32).unwrap_or(0) as f64 * 0.01;
                    let t1 = state.full_get_segment_t1(seg_idx as i32).unwrap_or(0) as f64 * 0.01;

                    // Round to 2 decimal places
                    seg_start = (t0 as f64 * 100.0).trunc() / 100.0;
                    seg_end = (t1 as f64 * 100.0).trunc() / 100.0;
                    None
                };

                // Check that end time of previous segment is less than start time of current segment (fixes some edge cases where segments overlap)
                if let Some(last) = segments.last_mut() {
                    if last.end > seg_start {
                        last.end = seg_start;
                    }
                    
                    // If word-level enabled, also update end time of last word
                    if let Some(words) = &mut last.words {
                        words.last_mut().unwrap().end = seg_end;
                    }
                }
                    
                // Create the segment after we're done printing
                let segment = Segment {
                    speaker: None, // No speaker info in non-diarized mode
                    start: seg_start,
                    end: seg_end,
                    text,
                    words,
                };

                segments.push(segment);
            }

            let transcript = Transcript {
                processing_time_sec: st.elapsed().as_secs(),
                segments
            };
            return Ok(transcript);
        }
    }).await??;
    Ok(transcript)
}
