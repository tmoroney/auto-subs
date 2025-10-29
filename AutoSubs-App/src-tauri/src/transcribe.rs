use crate::audio;
use crate::models::get_cache_dir;
use crate::transcript::{ColorModifier, Sample, Segment, Speaker, Transcript, WordTimestamp};
use eyre::Result;
use serde::{Deserialize, Serialize};
use serde_json;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicI32, Ordering};
use std::time::Instant;
use tauri::{command, AppHandle, Emitter, Manager, Runtime};
use whisper_diarize_rs::{Engine, EngineConfig, TranscribeOptions, Callbacks, Segment as WDSegment, ProgressType};

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
pub async fn transcribe_audio<R: Runtime>(
    app: AppHandle<R>,
    options: FrontendTranscribeOptions,
) -> Result<Transcript, String> {
    let start_time = Instant::now();
    println!("Starting transcription with options: {:?}", options);

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
    println!("Cancellation flag reset to false");

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
            .map_err(|e| format!("Failed to normalize audio: {}", e))?
    } else {
        println!("Skip normalize");
        options.audio_path.clone().into()
    };
    println!("Normalized audio path: {}", audio_path.display());

    // Run transcription using the whisper-diarize-rs crate (it's async)
    let res = async move {
        // Get the proper cache directory for models
        let cache_dir = get_cache_dir(app.clone())
            .map_err(|e| format!("Failed to get cache directory: {}", e))?;
        
        // Create engine config with proper cache directory
        let engine_config = EngineConfig {
            cache_dir,
            enable_dtw: Some(true),           // Enable DTW for better word timestamps
            enable_flash_attn: Some(false),   // Disable flash attention for compatibility
            use_gpu: Some(true),              // Enable GPU acceleration when available
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
        transcribe_options.max_speakers = options.max_speakers;
        // DTW is enabled in engine config for better word timestamps
        
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
        let callbacks = Callbacks {
            progress: Some(&|percent: i32, progress_type: ProgressType, label: &str| {
                println!("{}: {}% - {:?}", label, percent, progress_type);
                
                // Update global progress state
                LATEST_PROGRESS.store(percent, Ordering::Relaxed);
                if let Ok(mut progress_type_lock) = LATEST_PROGRESS_TYPE.lock() {
                    *progress_type_lock = Some(progress_type.clone());
                }
                if let Ok(mut progress_label_lock) = LATEST_PROGRESS_LABEL.lock() {
                    *progress_label_lock = Some(label.to_string());
                }
            }),
            new_segment_callback: Some(&|segment: &WDSegment| {
                println!("New segment: {}", segment.text);
            }),
            is_cancelled: Some(Box::new(|| {
                if let Ok(should_cancel) = SHOULD_CANCEL.lock() {
                    *should_cancel
                } else {
                    false
                }
            })),
        };

        // No formatting overrides - frontend handles formatting
        let formatting_overrides = None;

        // Check for cancellation before starting transcription
        if let Ok(should_cancel) = SHOULD_CANCEL.lock() {
            if *should_cancel {
                return Err("Transcription cancelled".to_string());
            }
        }

        // Run transcription
        let segments = engine
            .transcribe_audio(
                &audio_path.to_string_lossy(),
                transcribe_options,
                formatting_overrides,
                Some(callbacks),
            )
            .await
            .map_err(|e| {
                // Check if this was a cancellation error
                if let Ok(should_cancel) = SHOULD_CANCEL.lock() {
                    if *should_cancel {
                        "Transcription cancelled".to_string()
                    } else {
                        format!("Transcription failed: {}", e)
                    }
                } else {
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
        let mut app_segments: Vec<Segment> = segments
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
                    speaker_id: seg.speaker_id.clone(),
                    start: seg.start,
                    end: seg.end,
                    text: seg.text.clone(),
                    words,
                }
            })
            .collect();

        // Apply offset if provided
        if let Some(offset) = options.offset {
            for segment in app_segments.iter_mut() {
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

        // Aggregate speakers if diarization was enabled
        let (speakers, segments) = if options.enable_diarize.unwrap_or(false) {
            aggregate_speakers_from_segments(&app_segments)
        } else {
            (Vec::new(), app_segments)
        };

        Ok::<Transcript, String>(Transcript {
            processing_time_sec: 0, // Will be set below
            segments,
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
            println!(
                "Transcription successful in {:.2}s",
                transcript.processing_time_sec
            );
            Ok(transcript)
        }
        Err(e) => {
            eprintln!("Error during transcription: {}", e);
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
    tracing::debug!("normalize {:?}", source.display());

    let path_resolver = app.path();
    let out_path = path_resolver
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("normalized_audio.wav");

    // Always overwrite the same file to prevent cache buildup
    tracing::info!("Normalizing audio to fixed path: {}", out_path.display());

    audio::normalize(app, source, out_path.clone(), additional_ffmpeg_args)
        .await
        .map_err(|e| eyre::eyre!("Failed to normalize audio: {}", e))?;

    Ok(out_path)
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

