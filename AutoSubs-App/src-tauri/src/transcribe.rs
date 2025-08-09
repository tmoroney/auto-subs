use crate::audio;
use crate::config::{DiarizeOptions, TranscribeOptions};
use crate::transcript::{ColorModifier, Sample, Segment, Speaker, Transcript};
use eyre::{bail, eyre, Context, OptionExt, Result};
use hound::WavReader;
use serde::Deserialize;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;
use std::time::SystemTime;
use tauri::{command, AppHandle, Emitter, Manager};
use whisper_rs::DtwMode;
use whisper_rs::DtwModelPreset;
use whisper_rs::DtwParameters;
pub use whisper_rs::SegmentCallbackData;
pub use whisper_rs::WhisperContext;
pub use whisper_rs::WhisperState;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContextParameters};

type ProgressCallbackType = once_cell::sync::Lazy<Mutex<Option<Box<dyn Fn(i32) + Send + Sync>>>>;
static PROGRESS_CALLBACK: ProgressCallbackType = once_cell::sync::Lazy::new(|| Mutex::new(None));

// Global cancellation state
pub static SHOULD_CANCEL: once_cell::sync::Lazy<Mutex<bool>> =
    once_cell::sync::Lazy::new(|| Mutex::new(false));

// Utility function for rounding to n decimal places
fn round_to_places(val: f64, places: u32) -> f64 {
    let factor = 10f64.powi(places as i32);
    (val * factor).trunc() / factor
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
    pub enable_diarize: Option<bool>,
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
pub async fn transcribe_audio(
    app: AppHandle,
    options: FrontendTranscribeOptions,
) -> Result<Transcript, String> {
    let start_time = Instant::now();
    println!("Starting transcription with options: {:?}", options);

    // Reset cancellation flag at the start of transcription
    if let Ok(mut should_cancel) = SHOULD_CANCEL.lock() {
        *should_cancel = false;
        println!("Cancellation flag reset to false");
    }

    let model_path = crate::models::download_model_if_needed(app.clone(), &options.model)?;

    let audio_duration = crate::audio::get_audio_duration(app.clone(), options.audio_path.clone())
        .await
        .map_err(|e| format!("Failed to get audio duration: {}", e))?;

    let ctx = create_context(
        &PathBuf::from(model_path),
        &options.model,
        None,
        Some(true),
        options.enable_dtw, // improved word timestamps
        Some(audio_duration),
    )
    .map_err(|e| format!("Failed to create Whisper context: {}", e))?;

    let transcribe_options = TranscribeOptions {
        path: options.audio_path.clone().into(),
        offset: options.offset,
        lang: options.lang,
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
    };

    let diarize_options = if let Some(true) = options.enable_diarize {
        println!("Diarization enabled, checking for models...");
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
        options.enable_diarize,
    )
    .await
    {
        Ok(mut transcript) => {
            transcript.processing_time_sec = start_time.elapsed().as_secs();
            println!(
                "Transcription successful in {:.2}s",
                transcript.processing_time_sec
            );
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
    let min_mb = 16; // 16MB minimum
    let max_mb = 1024; // 1GB maximum to prevent excessive memory usage

    // Convert to bytes and ensure it's a multiple of 4MB (alignment)
    let bytes = (estimated_mb.max(min_mb).min(max_mb) * 1024 * 1024) & !0x3FFFFF;
    bytes
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
    if let Some(use_gpu) = use_gpu {
        ctx_params.use_gpu = use_gpu;
    }
    // set GPU device number from preference
    if let Some(gpu_device) = gpu_device {
        ctx_params.gpu_device = gpu_device;
    }

    // set enable_dtw from preference
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
            "large" => DtwModelPreset::LargeV3,
            "large-turbo" => DtwModelPreset::LargeV3Turbo,
            _ => DtwModelPreset::SmallEn, // Defaulting to SmallEn
        };

        ctx_params.dtw_parameters(DtwParameters {
            mode: DtwMode::ModelPreset { model_preset },
            dtw_mem_size,
        });
    } else {
        ctx_params.flash_attn(true);
    }

    // Print actual DTW state from ctx_params
    let dtw_enabled = enable_dtw.unwrap_or(false);
    // print as well
    println!("gpu device: {:?}", ctx_params.gpu_device);
    println!("use gpu: {:?}", ctx_params.use_gpu);
    println!("DTW enabled: {}", dtw_enabled);
    println!("flash attn: {}", ctx_params.flash_attn);
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

fn get_word_timestamps(
    state: &WhisperState,
    seg: i32,
    enable_dtw: Option<bool>,
) -> Vec<crate::transcript::WordTimestamp> {
    let ntok = state.full_n_tokens(seg).unwrap() as usize;
    let mut word_timestamps = Vec::with_capacity(ntok);

    let start_of_segment = state.full_get_segment_t0(seg).unwrap_or(0);
    let end_of_segment = state.full_get_segment_t1(seg).unwrap_or(0);
    let mut prev_end_frame = start_of_segment;
    let mut current_word = String::new();
    let mut start_frame = start_of_segment;

    // Helper function to close the current word and add it to timestamps
    let close_current_word = |word: &mut String,
                              timestamps: &mut Vec<crate::transcript::WordTimestamp>,
                              _token_idx: i32,
                              start: i64,
                              end: i64,
                              prob: f32|
     -> i64 {
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
                start_frame = close_current_word(
                    &mut current_word,
                    &mut word_timestamps,
                    i as i32,
                    start_frame,
                    prev_end_frame,
                    prev_data.p,
                );
            }
            continue;
        }

        // New word starts at tokens with leading space or if first token
        if token_text.starts_with(' ') && !current_word.is_empty() {
            let prev_data = state.full_get_token_data(seg, (i - 1) as i32).unwrap();
            start_frame = close_current_word(
                &mut current_word,
                &mut word_timestamps,
                i as i32,
                start_frame,
                prev_end_frame,
                prev_data.p,
            );
        }

        current_word.push_str(&token_text);
        prev_end_frame = if let Some(true) = enable_dtw {
            data.t_dtw
        } else {
            data.t1
        };

        // If last token, push the final word
        if is_last && !current_word.is_empty() {
            close_current_word(
                &mut current_word,
                &mut word_timestamps,
                i as i32,
                start_frame,
                prev_end_frame,
                data.p,
            );
        }
    }

    word_timestamps
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

pub async fn run_transcription_pipeline(
    app: AppHandle,
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

        tracing::debug!("set start time...");

        tracing::debug!("setting state full...");
        state
            .full(params, &samples)
            .context("failed to transcribe")?;
        let _et = std::time::Instant::now();

        tracing::debug!("getting segments count...");
        let num_segments = state
            .full_n_segments()
            .context("failed to get number of segments")?;
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
            let text = state
                .full_get_segment_text_lossy(seg_idx as i32)
                .context("failed to get segment")?;

            // Get word timestamps if DTW is enabled
            let words = {
                let word_timestamps = get_word_timestamps(&state, seg_idx as i32, options.enable_dtw);
                seg_start = word_timestamps.first().unwrap().start;
                seg_end = word_timestamps.last().unwrap().end;
                Some(word_timestamps)
            };

            // Check that end time of previous segment is less than start time of current segment (fixes some edge cases where segments overlap)
            if let Some(last) = segments.last_mut() {
                if last.end > seg_start {
                    last.end = seg_start;
                }

                // If word-level enabled, clamp the last word's end to the previous segment's (possibly adjusted) end
                if let Some(words) = &mut last.words {
                    if let Some(last_word) = words.last_mut() {
                        if last_word.end > last.end {
                            last_word.end = last.end;
                        }
                    }
                }
            }

            // Create the segment after we're done printing
            let segment = Segment {
                speaker_id: None, // No speaker info in non-diarized mode
                start: seg_start,
                end: seg_end,
                text,
                words,
            };

            segments.push(segment);
        }

        // Process with diarization if enabled
        let (mut speakers, mut segments) = if let Some(true) = enable_diarize {
            // Emit diarization start event
            let _ = app.emit("diarization-start", ());

            // Create diarization progress callback
            let diarize_app = app.clone();
            let diarize_progress_callback = Some(Box::new(move |progress: i32| {
                let _ = diarize_app.emit("diarization-progress", progress);
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
                segments,
                &original_samples,
                diarize_opts,
                diarize_progress_callback,
            )?;

            // Emit diarization complete event
            let _ = app.emit("diarization-complete", ());

            result
        } else {
            // No speaker aggregation needed for non-diarized transcripts
            (Vec::new(), segments)
        };

        let offset = options.offset.unwrap_or(0.0);

        // loop through and offset to each word and segment, then round
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

        // loop through and offset to each speaker, then round
        for speaker in speakers.iter_mut() {
            speaker.sample.start = round_to_places(speaker.sample.start + offset, 3);
            speaker.sample.end = round_to_places(speaker.sample.end + offset, 3);
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
