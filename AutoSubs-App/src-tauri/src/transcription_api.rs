use crate::audio_preprocess as audio;
use crate::models::get_cache_dir;
use crate::transcript_types::{ColorModifier, Sample, Segment, Speaker, Transcript, WordTimestamp};
use eyre::Result;
use serde::{Deserialize, Serialize};
use serde_json;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicI32, AtomicU64, Ordering};
use std::time::Instant;
use tauri::{command, AppHandle, Emitter, Manager, Runtime};
use transcription_engine::{Engine, EngineConfig, TranscribeOptions, Callbacks, Segment as WDSegment, ProgressType, PostProcessConfig, process_segments, ContentFormatting, TextCase, TextDensity};

// Frontend-compatible progress data type
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LabeledProgress {
    pub progress: i32,
    #[serde(rename = "type")]
    pub progress_type: Option<String>,
    pub label: Option<String>,
}

impl From<(&i32, &Option<ProgressType>, &Option<String>)> for LabeledProgress {
    fn from((progress, progress_type, label): (&i32, &Option<ProgressType>, &Option<String>)) -> Self {
        Self {
            progress: *progress,
            progress_type: progress_type.as_ref().map(|t| format!("{:?}", t)),
            label: label.clone(),
        }
    }
}


// Global cancellation state (public so main.rs can access it for exit handling)
pub static SHOULD_CANCEL: Mutex<bool> = Mutex::new(false);

// Latest progress value and type updated from callbacks
static LATEST_PROGRESS: AtomicI32 = AtomicI32::new(0);
static LATEST_PROGRESS_TYPE: Mutex<Option<ProgressType>> = Mutex::new(None);
static LATEST_PROGRESS_LABEL: Mutex<Option<String>> = Mutex::new(None);
// Tracks the last progress stage we emitted an info-level log for; used to
// rate-limit logs to one line per stage transition.
static LAST_LOGGED_PROGRESS_TYPE: Mutex<Option<ProgressType>> = Mutex::new(None);

static NORMALIZED_AUDIO_COUNTER: AtomicU64 = AtomicU64::new(0);

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
    pub target_language: Option<String>,
    pub enable_dtw: Option<bool>,
    pub enable_gpu: Option<bool>,
    pub enable_diarize: Option<bool>,
    pub max_speakers: Option<usize>,
    pub density: Option<TextDensity>,
    pub max_lines: Option<usize>,
    // Content formatting (applied after structural line wrapping).
    pub text_case: Option<String>,
    pub remove_punctuation: Option<bool>,
    pub censored_words: Option<Vec<String>>,
}

/// Parse a frontend text_case string ("none"|"lowercase"|"uppercase"|"titlecase") into TextCase.
fn parse_text_case(s: Option<&str>) -> TextCase {
    match s.map(|v| v.to_lowercase()) {
        Some(ref v) if v == "lowercase" => TextCase::Lowercase,
        Some(ref v) if v == "uppercase" => TextCase::Uppercase,
        Some(ref v) if v == "titlecase" => TextCase::Titlecase,
        _ => TextCase::None,
    }
}

#[command]
pub async fn cancel_transcription() -> Result<(), String> {
    tracing::info!("cancel_transcription: requested");
    if let Ok(mut should_cancel) = SHOULD_CANCEL.lock() {
        *should_cancel = true;
    } else {
        tracing::error!("cancel_transcription: failed to acquire SHOULD_CANCEL lock");
        return Err("Failed to acquire cancellation lock".to_string());
    }
    Ok(())
}

/// Sanitized view of transcription options suitable for logging. Strips the
/// full absolute `audio_path` down to a basename so user paths don't leak into
/// logs that may be shared on GitHub issues.
#[derive(Serialize)]
struct TranscribeOptionsLogView<'a> {
    audio_file: String,
    offset: Option<f64>,
    model: &'a str,
    lang: Option<&'a str>,
    translate: Option<bool>,
    target_language: Option<&'a str>,
    enable_dtw: Option<bool>,
    enable_gpu: Option<bool>,
    enable_diarize: Option<bool>,
    max_speakers: Option<usize>,
    density: Option<String>,
    max_lines: Option<usize>,
    text_case: Option<&'a str>,
    remove_punctuation: Option<bool>,
    censored_words_count: usize,
}

impl<'a> From<&'a FrontendTranscribeOptions> for TranscribeOptionsLogView<'a> {
    fn from(o: &'a FrontendTranscribeOptions) -> Self {
        let audio_file = std::path::Path::new(&o.audio_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "<unknown>".to_string());
        Self {
            audio_file,
            offset: o.offset,
            model: &o.model,
            lang: o.lang.as_deref(),
            translate: o.translate,
            target_language: o.target_language.as_deref(),
            enable_dtw: o.enable_dtw,
            enable_gpu: o.enable_gpu,
            enable_diarize: o.enable_diarize,
            max_speakers: o.max_speakers,
            density: o.density.as_ref().map(|d| format!("{:?}", d)),
            max_lines: o.max_lines,
            text_case: o.text_case.as_deref(),
            remove_punctuation: o.remove_punctuation,
            censored_words_count: o.censored_words.as_ref().map(|v| v.len()).unwrap_or(0),
        }
    }
}

#[command]
pub async fn transcribe_audio<R: Runtime>(
    app: AppHandle<R>,
    options: FrontendTranscribeOptions,
) -> Result<Transcript, String> {
    let start_time = Instant::now();
    let options_log = TranscribeOptionsLogView::from(&options);
    match serde_json::to_string(&options_log) {
        Ok(j) => tracing::info!(target: "autosubs::transcribe", "transcribe_audio: starting options={}", j),
        Err(_) => tracing::info!(target: "autosubs::transcribe", "transcribe_audio: starting (options failed to serialize)"),
    }

    // Reset progress and cancellation state
    LATEST_PROGRESS.store(0, Ordering::Relaxed);
    if let Ok(mut progress_type_lock) = LATEST_PROGRESS_TYPE.lock() {
        *progress_type_lock = None;
    }
    if let Ok(mut progress_label_lock) = LATEST_PROGRESS_LABEL.lock() {
        *progress_label_lock = None;
    }
    if let Ok(mut should_cancel) = SHOULD_CANCEL.lock() {
        *should_cancel = false;
    }

    let emit_app = app.clone();
    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
    let emitter_handle = tokio::spawn(async move {
        let mut last_progress = -1;
        let mut last_progress_type: Option<ProgressType> = None;
        let mut last_progress_label: Option<String> = None;
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(250));
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    let progress = LATEST_PROGRESS.load(Ordering::Relaxed).clamp(0, 100);
                    let progress_type = LATEST_PROGRESS_TYPE.lock().unwrap().clone();
                    let progress_label = LATEST_PROGRESS_LABEL.lock().unwrap().clone();
                    
                    if progress != last_progress || progress_type != last_progress_type || progress_label != last_progress_label {
                        // Emit labeled progress with type and label
                        let labeled_progress = LabeledProgress::from((&progress, &progress_type, &progress_label));
                        let _ = emit_app.emit("labeled-progress", labeled_progress);
                        last_progress = progress;
                        last_progress_type = progress_type;
                        last_progress_label = progress_label;
                    }
                }
                _ = &mut stop_rx => {
                    break;
                }
            }
        }
    });

    // --- Audio Normalization (only task left in app before passing to crate) ---
    let audio_path = if should_normalize(options.audio_path.clone().into()) {
        create_normalized_audio(app.clone(), options.audio_path.clone().into(), None)
            .await
            .map_err(|e| {
                tracing::error!("audio normalization failed: {}", e);
                format!("Failed to normalize audio: {}", e)
            })?
    } else {
        tracing::info!("audio normalization skipped");
        options.audio_path.clone().into()
    };
    tracing::debug!("normalized audio path: {}", audio_path.display());

    // Clone app handle for segment callback and wrap in Arc for thread-safe sharing
    let segment_emit_app = Arc::new(app.clone());
    let segment_emit_app_clone = Arc::clone(&segment_emit_app);

    // Run transcription using the whisper-diarize-rs crate (it's async)
    let model_name_for_log = options.model.clone();
    let enable_diarize_for_log = options.enable_diarize.unwrap_or(false);
    let res = async move {
        // Get the proper cache directory for models
        let cache_dir = get_cache_dir(app.clone())
            .map_err(|e| {
                tracing::error!("get_cache_dir failed: {}", e);
                format!("Failed to get cache directory: {}", e)
            })?;

        // Pre-check whether the selected model is already cached so we can
        // tell users/triagers whether this run will download.
        match transcription_engine::list_cached_models(&cache_dir) {
            Ok(models) => {
                if models.iter().any(|m| m == &model_name_for_log) {
                    tracing::info!("whisper model '{}' already cached", model_name_for_log);
                } else {
                    tracing::info!("whisper model '{}' not cached, will download", model_name_for_log);
                }
                if enable_diarize_for_log {
                    tracing::info!("diarization enabled (models will be downloaded if missing)");
                }
            }
            Err(e) => tracing::warn!("list_cached_models failed: {}", e),
        }
        
        // Create engine config with proper cache directory
        let engine_config = EngineConfig {
            cache_dir,
            enable_dtw: options.enable_dtw.or(Some(true)), // Enable DTW for better word timestamps
            enable_flash_attn: Some(true),                 // Engine handles DTW/flash attention mutual exclusion
            use_gpu: options.enable_gpu.or(Some(true)),    // Enable GPU acceleration when available
            gpu_device: None,                 // Use default GPU device
            vad_model_path: None,             // Use default VAD model
            diarize_segment_model_path: None, // Download segmentation model if needed
            diarize_embedding_model_path: None, // Download embedding model if needed
        };
        
        let mut engine = Engine::new(engine_config);

        // Map frontend options to crate options
        let mut transcribe_options = TranscribeOptions::default();
        transcribe_options.model = options.model.clone();
        transcribe_options.lang = options.lang.clone().or(Some("auto".into()));
        transcribe_options.enable_vad = Some(true); // Always enable VAD
        transcribe_options.enable_diarize = options.enable_diarize;
        // Guard against invalid values from the frontend. In the engine, max_speakers == 0
        // effectively prevents creating any speakers and can lead to all segments being labeled "?".
        transcribe_options.max_speakers = match options.max_speakers {
            Some(0) => None,
            other => other,
        };
        // Handle translation - use target_language from frontend
        if options.translate.unwrap_or(false) {
            if let Some(target) = options.target_language {
                if target == "en" {
                    // English: use Whisper's built-in translation
                    transcribe_options.whisper_to_english = Some(true);
                    transcribe_options.translate_target = None;
                } else {
                    // Non-English: use post-translation via Google Translate
                    transcribe_options.whisper_to_english = Some(false);
                    transcribe_options.translate_target = Some(target);
                }
            } else {
                // Default to English for backward compatibility
                transcribe_options.whisper_to_english = Some(true);
                transcribe_options.translate_target = None;
            }
        } else {
            // Translation disabled
            transcribe_options.whisper_to_english = Some(false);
            transcribe_options.translate_target = None;
        }

        // Note: GPU is handled internally by the crate based on platform
        // For now, we pass the enable_gpu option if the crate supports it in the future

        // Set up callbacks using whisper-diarize-rs built-in cancellation
        let segment_callback = move |segment: &WDSegment| {
            tracing::trace!("new segment: {}", segment.text);

            // Emit the segment text to frontend for live preview
            let _ = segment_emit_app_clone.emit("new-segment", segment.text.clone());
        };

        // Reset per-run stage log de-dup state.
        if let Ok(mut g) = LAST_LOGGED_PROGRESS_TYPE.lock() {
            *g = None;
        }

        // Log one info! per distinct ProgressType transition; tick-by-tick
        // progress stays at trace level to avoid filling the log with %s.
        let callbacks = Callbacks {
            progress: Some(&|percent: i32, progress_type: ProgressType, label: &str| {
                if let Ok(mut guard) = LAST_LOGGED_PROGRESS_TYPE.lock() {
                    if guard.as_ref() != Some(&progress_type) {
                        tracing::info!("{}: stage={:?}", label, progress_type);
                        *guard = Some(progress_type.clone());
                    }
                }
                tracing::trace!("{}: {}% - {:?}", label, percent, progress_type);

                // Update global progress state
                LATEST_PROGRESS.store(percent, Ordering::Relaxed);
                if let Ok(mut progress_type_lock) = LATEST_PROGRESS_TYPE.lock() {
                    *progress_type_lock = Some(progress_type.clone());
                }
                if let Ok(mut progress_label_lock) = LATEST_PROGRESS_LABEL.lock() {
                    *progress_label_lock = Some(label.to_string());
                }
            }),
            new_segment_callback: Some(&segment_callback),
            is_cancelled: Some(Box::new(|| {
                if let Ok(should_cancel) = SHOULD_CANCEL.lock() {
                    *should_cancel
                } else {
                    false
                }
            })),
        };

        // Check for cancellation before starting transcription
        if let Ok(should_cancel) = SHOULD_CANCEL.lock() {
            if *should_cancel {
                return Err("Transcription cancelled".to_string());
            }
        }

        // Build content formatting options from frontend settings.
        let content_formatting = ContentFormatting {
            text_case: parse_text_case(options.text_case.as_deref()),
            remove_punctuation: options.remove_punctuation.unwrap_or(false),
            censored_words: options.censored_words.clone().unwrap_or_default(),
        };

        // Run transcription.
        // `raw_segments` preserves the engine's pre-formatting word data (used as
        // `originalSegments` for reformatting). `segments` are fully formatted for display.
        tracing::info!("transcription pipeline started");
        let (raw_segments, segments, output_language) = engine
            .transcribe_audio(
                &audio_path.to_string_lossy(),
                transcribe_options,
                options.max_lines, // max_lines
                options.density, // density
                Some(content_formatting),
                Some(callbacks),
            )
            .await
            .map_err(|e| {
                // Check if this was a cancellation error
                if let Ok(should_cancel) = SHOULD_CANCEL.lock() {
                    if *should_cancel {
                        tracing::info!("transcription cancelled by user");
                        "Transcription cancelled".to_string()
                    } else {
                        tracing::error!("transcription failed: {}", e);
                        format!("Transcription failed: {}", e)
                    }
                } else {
                    tracing::error!("transcription failed: {}", e);
                    format!("Transcription failed: {}", e)
                }
            })?;

        // Check for cancellation after transcription completes
        if let Ok(should_cancel) = SHOULD_CANCEL.lock() {
            if *should_cancel {
                return Err("Transcription cancelled".to_string());
            }
        }

        // Convert whisper-diarize-rs segments to app's Segment format
        let mut app_segments: Vec<Segment> = segments.iter().map(wd_to_app_segment).collect();
        let mut app_raw_segments: Vec<Segment> = raw_segments.iter().map(wd_to_app_segment).collect();

        if options.enable_diarize.unwrap_or(false) {
            let total = app_segments.len();
            let unknown = app_segments
                .iter()
                .filter(|s| s.speaker_id.as_deref().unwrap_or("").trim() == "?")
                .count();

            if total > 0 && unknown == total {
                tracing::warn!(
                    "Diarization enabled but all segments have unknown speaker_id ('?'). Check model availability and options.max_speakers."
                );
            }
        }

        // Apply offset if provided — to both the display segments and the raw segments,
        // so reformatting later preserves the correct (offset-adjusted) timings.
        if let Some(offset) = options.offset {
            apply_offset_to_segments(&mut app_segments, offset);
            apply_offset_to_segments(&mut app_raw_segments, offset);
        }

        // Aggregate speakers if diarization was enabled (from display segments, which
        // are the ones actually shown; raw segments share the same speaker_id values).
        let (speakers, segments) = if options.enable_diarize.unwrap_or(false) {
            aggregate_speakers_from_segments(&app_segments)
        } else {
            (Vec::new(), app_segments)
        };

        Ok::<Transcript, String>(Transcript {
            processing_time_sec: 0, // Will be set below
            language: output_language,
            segments,
            original_segments: app_raw_segments,
            speakers,
        })
    }
    .await;

    // Stop emitter and wait for it to finish
    let _ = stop_tx.send(());
    let _ = emitter_handle.await;

    match res {
        Ok(mut transcript) => {
            transcript.processing_time_sec = start_time.elapsed().as_secs();

            tracing::info!(
                target: "autosubs::transcribe",
                "transcribe_audio: success ({}s, segments={}, speakers={}, language={})",
                transcript.processing_time_sec,
                transcript.segments.len(),
                transcript.speakers.len(),
                transcript.language
            );

            // Optional deep-debug dump controlled by env var.
            if std::env::var("AUTOSUBS_DEBUG_TRANSCRIPT")
                .ok()
                .as_deref()
                == Some("1")
            {
                match serde_json::to_string_pretty(&transcript) {
                    Ok(json) => tracing::debug!("final transcript JSON:\n{}", json),
                    Err(e) => tracing::warn!("failed to serialize transcript for debug: {}", e),
                }
            }

            Ok(transcript)
        }
        Err(e) => {
            // Note: detailed error was already logged at the map_err site. Avoid
            // double-logging the same message at `error` level here.
            tracing::debug!("transcribe_audio returning Err to frontend: {}", e);
            Err(e)
        }
    }
}


/// Always normalize audio to ensure it's mono 16kHz WAV for whisper-diarize-rs
fn should_normalize(_source: PathBuf) -> bool {
    true
}


// This function must now be `async` because it calls the async `normalize` function.
pub async fn create_normalized_audio<R: Runtime>(
    app: AppHandle<R>,
    source: PathBuf,
    additional_ffmpeg_args: Option<Vec<String>>,
) -> Result<PathBuf> {
    tracing::info!("audio normalization: start input={}", source.display());

    let path_resolver = app.path();

    let cache_dir = path_resolver
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir());

    let out_path = if cfg!(test) {
        let n = NORMALIZED_AUDIO_COUNTER.fetch_add(1, Ordering::Relaxed);
        cache_dir.join(format!("normalized_audio_{}.wav", n))
    } else {
        cache_dir.join("normalized_audio.wav")
    };

    tracing::info!("Normalizing audio to path: {}", out_path.display());

    audio::normalize(app, source, out_path.clone(), additional_ffmpeg_args)
        .await
        .map_err(|e| eyre::eyre!("Failed to normalize audio: {}", e))?;

    Ok(out_path)
}


/// Convert a `transcription_engine` segment to the app's `Segment` type.
fn wd_to_app_segment(seg: &WDSegment) -> Segment {
    let words = seg.words.as_ref().map(|words| {
        words
            .iter()
            .map(|w| WordTimestamp {
                word: w.text.clone(),
                start: w.start,
                end: w.end,
                probability: w.probability,
            })
            .collect()
    });
    Segment {
        speaker_id: seg.speaker_id.clone(),
        start: seg.start,
        end: seg.end,
        text: seg.text.clone(),
        words,
    }
}

/// Apply a time offset (in seconds) to every segment and its word timestamps.
fn apply_offset_to_segments(segments: &mut [Segment], offset: f64) {
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
}

/// Aggregates speakers from transcript segments, similar to the frontend logic
fn aggregate_speakers_from_segments(segments: &[Segment]) -> (Vec<Speaker>, Vec<Segment>) {
    use std::collections::HashMap;

    // Build speaker map: raw_speaker_id -> (index, start_time, end_time)
    let mut speaker_info: HashMap<String, (usize, f64, f64)> = HashMap::new();
    let mut next_index: usize = 0;

    // First pass: collect unique speakers and assign indices
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

    // Do not rewrite segment speaker IDs. Preserve the engine's speaker_id values so the UI
    // sees the same labels as the transcription engine output.
    let updated_segments = segments.to_vec();

    // Convert speaker info to speakers array, sorted by index
    let mut speakers = Vec::new();
    let mut speaker_list: Vec<(String, (usize, f64, f64))> = speaker_info.into_iter().collect();
    speaker_list.sort_by_key(|(_, (index, _, _))| *index);

    for (raw_id, (_, start, end)) in speaker_list {
        speakers.push(Speaker {
            name: format!("Speaker {}", raw_id),
            sample: Sample { start, end },
            fill: ColorModifier::default(),
            outline: ColorModifier::default(),
            border: ColorModifier::default(),
        });
    }

    (speakers, updated_segments)
}

// --- Frontend Formatting Options Struct ---
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FrontendFormattingOptions {
    pub language: Option<String>,
    pub max_lines: Option<usize>,
    pub text_density: Option<String>,
    // Content formatting (applied after structural line wrapping).
    pub text_case: Option<String>,
    pub remove_punctuation: Option<bool>,
    pub censored_words: Option<Vec<String>>,
}

/// Reformat subtitles with new formatting options without re-transcribing.
/// Takes the raw word-level data and applies formatting rules to produce new segments.
#[command]
pub async fn reformat_subtitles(
    segments: Vec<Segment>,
    options: FrontendFormattingOptions,
) -> Result<Vec<Segment>, String> {
    // Convert app segments to engine segments (WDSegment)
    let engine_segments: Vec<WDSegment> = segments
        .iter()
        .map(|seg| {
            let words = seg.words.as_ref().map(|words| {
                words
                    .iter()
                    .map(|w| transcription_engine::WordTimestamp {
                        text: w.word.clone(),
                        start: w.start,
                        end: w.end,
                        probability: w.probability,
                    })
                    .collect()
            });

            WDSegment {
                start: seg.start,
                end: seg.end,
                text: seg.text.clone(),
                words,
                speaker_id: seg.speaker_id.clone(),
            }
        })
        .collect();

    // Build config from language profile, then apply density and max_lines
    let lang = options.language.as_deref().unwrap_or("en");
    let mut config = PostProcessConfig::for_language(lang);

    if let Some(ref density_str) = options.text_density {
        let density: TextDensity = match density_str.to_lowercase().as_str() {
            "less" => TextDensity::Less,
            "more" => TextDensity::More,
            "single" => TextDensity::Single,
            _ => TextDensity::Standard,
        };
        config.apply_density(density);
    }
    if let Some(ml) = options.max_lines {
        config.max_lines = ml;
    }

    // Content formatting (case, punctuation removal, censoring).
    config.text_case = parse_text_case(options.text_case.as_deref());
    config.remove_punctuation = options.remove_punctuation.unwrap_or(false);
    config.censored_words = options.censored_words.clone().unwrap_or_default();

    // Run the formatting engine
    let formatted = process_segments(&engine_segments, &config);

    // Convert back to app segments
    let result: Vec<Segment> = formatted
        .iter()
        .map(|seg| {
            let words = seg.words.as_ref().map(|words| {
                words
                    .iter()
                    .map(|w| WordTimestamp {
                        word: w.text.clone(),
                        start: w.start,
                        end: w.end,
                        probability: w.probability,
                    })
                    .collect()
            });

            Segment {
                start: seg.start,
                end: seg.end,
                text: seg.text.clone(),
                words,
                speaker_id: seg.speaker_id.clone(),
            }
        })
        .collect();

    Ok(result)
}
