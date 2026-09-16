use futures::channel::mpsc::UnboundedSender;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;
use transcription_engine::{
    Callbacks, Engine, EngineConfig, LabeledProgressFn, Segment, SegmentStage, TranscribeOptions,
};

/// One subtitle line as shown in the list.
#[derive(Clone)]
pub struct SubtitleRow {
    pub start: f64,
    pub text: String,
    /// Raw diarization id ("0", "1", …) when speaker labelling ran.
    pub speaker: Option<String>,
}

impl From<&Segment> for SubtitleRow {
    fn from(seg: &Segment) -> Self {
        Self {
            start: seg.start,
            text: seg.text.clone(),
            speaker: seg.speaker_id.clone(),
        }
    }
}

/// Messages sent from the transcription worker thread back to the UI.
pub enum EngineEvent {
    Progress { percent: i32, label: String },
    /// `index` is the segment's position in the final transcript; a later
    /// stage (e.g. alignment) re-sends an index to update that row.
    LiveSegment { index: usize, row: SubtitleRow },
    Done {
        language: String,
        elapsed: f64,
        segments: Vec<SubtitleRow>,
    },
    Failed(String),
}

/// Options collected from the spike UI, mapped onto TranscribeOptions.
pub struct SpikeOptions {
    pub model: String,
    pub lang: String,
    pub vad: bool,
    pub diarize: bool,
    pub align: bool,
}

/// Same location as the Tauri app's app_cache_dir()/models so the spike
/// shares the existing model cache.
pub fn model_cache_dir() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.autosubs")
        .join("models")
}

/// Ids of models already downloaded. Touches the disk, so call off the UI thread.
pub fn cached_model_ids() -> std::collections::HashSet<String> {
    transcription_engine::list_cached_models(&model_cache_dir())
        .map(|ids| ids.into_iter().collect())
        .unwrap_or_default()
}

/// Run the full pipeline on a dedicated thread with its own tokio runtime.
/// The engine is tokio-based (hf-hub downloads, timeouts), while GPUI runs on
/// its own executor — the two never share a reactor.
pub fn spawn_pipeline(
    input: PathBuf,
    opts: SpikeOptions,
    tx: UnboundedSender<EngineEvent>,
    cancel: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
            rt.block_on(run(input, opts, tx.clone(), cancel))
        }));
        match result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                let _ = tx.unbounded_send(EngineEvent::Failed(format!("{e:#}")));
            }
            Err(_) => {
                let _ = tx.unbounded_send(EngineEvent::Failed(
                    "Transcription panicked (see logs)".into(),
                ));
            }
        }
    });
}

async fn run(
    input: PathBuf,
    opts: SpikeOptions,
    tx: UnboundedSender<EngineEvent>,
    cancel: Arc<AtomicBool>,
) -> eyre::Result<()> {
    send_progress(&tx, 0, "Prepare", "Converting audio to 16kHz WAV");
    let wav = normalize(&input).map_err(|e| eyre::eyre!("{e}"))?;
    send_progress(&tx, 100, "Prepare", "Audio ready");

    let cache_dir = model_cache_dir();
    std::fs::create_dir_all(&cache_dir)?;

    let mut engine = Engine::new(EngineConfig {
        cache_dir,
        enable_dtw: Some(true),
        enable_flash_attn: Some(true),
        use_gpu: Some(true),
        ..Default::default()
    });

    let progress: Arc<LabeledProgressFn> = {
        let tx = tx.clone();
        Arc::new(move |pct, ty, label| {
            let _ = tx.unbounded_send(EngineEvent::Progress {
                percent: pct,
                label: format!("{ty:?} · {label}"),
            });
        })
    };
    let on_segment: Arc<dyn Fn(usize, &Segment, SegmentStage) + Send + Sync> = {
        let tx = tx.clone();
        Arc::new(move |index, seg, _| {
            let _ = tx.unbounded_send(EngineEvent::LiveSegment {
                index,
                row: seg.into(),
            });
        })
    };
    let is_cancelled: Arc<dyn Fn() -> bool + Send + Sync> = {
        let cancel = cancel.clone();
        Arc::new(move || cancel.load(Ordering::Relaxed))
    };

    let started = Instant::now();
    let (_raw, segments, language) = engine
        .transcribe_audio(
            &wav.to_string_lossy(),
            TranscribeOptions {
                model: opts.model,
                lang: Some(opts.lang),
                enable_vad: Some(opts.vad),
                enable_diarize: Some(opts.diarize),
                enable_forced_alignment: Some(opts.align),
                ..Default::default()
            },
            None,
            None,
            None,
            None,
            Some(Callbacks {
                progress: Some(progress),
                new_segment_callback: Some(on_segment),
                speakers_identified: None,
                is_cancelled: Some(is_cancelled),
            }),
        )
        .await?;

    if cancel.load(Ordering::Relaxed) {
        eyre::bail!("Cancelled");
    }

    let _ = tx.unbounded_send(EngineEvent::Done {
        language,
        elapsed: started.elapsed().as_secs_f64(),
        segments: segments.iter().map(SubtitleRow::from).collect(),
    });
    Ok(())
}

fn send_progress(tx: &UnboundedSender<EngineEvent>, percent: i32, phase: &str, label: &str) {
    let _ = tx.unbounded_send(EngineEvent::Progress {
        percent,
        label: format!("{phase} · {label}"),
    });
}

fn ffmpeg_binary() -> Option<PathBuf> {
    // Reuse the bundled sidecar when running from the repo on Apple Silicon.
    let bundled =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../binaries/ffmpeg-aarch64-apple-darwin");
    if bundled.is_file() {
        return Some(bundled);
    }
    which::which("ffmpeg").ok()
}

fn normalize(input: &Path) -> Result<PathBuf, String> {
    let ffmpeg = ffmpeg_binary()
        .ok_or_else(|| "ffmpeg not found (no bundled sidecar and not on PATH)".to_string())?;
    let out = std::env::temp_dir().join("autosubs-gpui-spike.wav");
    let output = Command::new(&ffmpeg)
        .args([
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-vn",
            "-sn",
            "-dn",
            "-i",
        ])
        .arg(input)
        .args([
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
        ])
        .arg(&out)
        .output()
        .map_err(|e| format!("failed to run ffmpeg: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "ffmpeg failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(out)
}
