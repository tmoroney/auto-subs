use crate::types::{DiarizeOptions, LabeledProgressFn, ProgressType, SpeechSegment};
use eyre::{Result, eyre};

pub fn label_speakers(
    speech_segments: &mut [SpeechSegment],
    diarize_options: &DiarizeOptions,
    progress_callback: Option<&LabeledProgressFn>,
    is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
) -> Result<()> {
    if speech_segments.is_empty() {
        return Ok(());
    }

    let total_segments = speech_segments.len();

    let mut embedding_manager = pyannote_rs::EmbeddingManager::new(diarize_options.max_speakers);
    let mut extractor = pyannote_rs::EmbeddingExtractor::new(&diarize_options.embedding_model_path)
        .map_err(|e| eyre!("{:?}", e))?;

    for (i, seg) in speech_segments.iter_mut().enumerate() {
        if let Some(is_cancelled) = is_cancelled {
            if is_cancelled() {
                return Err(eyre!("Cancelled"));
            }
        }

        let embedding_result = extractor.compute(&seg.samples);
        let speaker = match embedding_result {
            Ok(embedding_vec) => {
                if embedding_manager.get_all_speakers().len() == diarize_options.max_speakers {
                    embedding_manager
                        .get_best_speaker_match(embedding_vec)
                        .map(|r| r.to_string())
                        .unwrap_or("?".into())
                } else {
                    embedding_manager
                        .search_speaker(embedding_vec, diarize_options.threshold)
                        .map(|r| r.to_string())
                        .unwrap_or("?".into())
                }
            }
            Err(e) => {
                tracing::error!("speaker embedding failed: {:?}", e);
                "?".into()
            }
        };

        seg.speaker_id = Some(speaker);

        if let Some(cb) = progress_callback {
            let pct = ((i + 1) as f64 / total_segments as f64 * 100.0) as i32;
            cb(pct, ProgressType::Transcribe, "Identifying speakers");
        }
    }

    Ok(())
}
