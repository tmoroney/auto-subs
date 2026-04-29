/*
wget https://github.com/thewh1teagle/pyannote-rs/releases/download/v0.1.0/segmentation-3.0.onnx
wget https://github.com/thewh1teagle/pyannote-rs/releases/download/v0.1.0/wespeaker_en_voxceleb_CAM++.onnx
wget https://github.com/thewh1teagle/pyannote-rs/releases/download/v0.1.0/6_speakers.wav
cargo run --example infinite 6_speakers.wav
*/

use diarize::raw::{EmbeddingExtractor, EmbeddingManager};

fn process_segment(
    segment: diarize::raw::Segment,
    embedding_extractor: &mut EmbeddingExtractor,
    embedding_manager: &mut EmbeddingManager,
    search_threshold: f32,
) -> Result<(), eyre::Report> {
    let embedding_result: Vec<f32> = embedding_extractor
        .compute(&segment.samples)
        .unwrap();

    let speaker = embedding_manager
        .search_speaker(embedding_result.clone(), search_threshold)
        .ok_or_else(|| embedding_manager.search_speaker(embedding_result, 0.0)) // Ensure always to return speaker
        .map(|r| r.to_string())
        .unwrap_or("?".into());

    println!(
        "start = {:.2}, end = {:.2}, speaker = {}",
        segment.start, segment.end, speaker
    );

    Ok(())
}

fn main() -> Result<(), eyre::Report> {
    let audio_path = std::env::args().nth(1).expect("Please specify audio file");
    let search_threshold = 0.5;

    // embedding model with PLDA transformations
    let mut embedding_extractor = EmbeddingExtractor::new_with_plda(
        "embedding_model.onnx",
        "xvec_transform.npz",
        "plda.npz",
        128,
    )?;

    let segmentation_model_path = "segmentation-community-1.onnx";

    let (samples, sample_rate) = diarize::raw::read_wav(&audio_path)?;
    let mut embedding_manager = EmbeddingManager::new(usize::MAX);

    let segments = diarize::raw::get_segments(&samples, sample_rate, segmentation_model_path)?;

    for segment in segments {
        if let Ok(segment) = segment {
            if let Err(error) = process_segment(
                segment,
                &mut embedding_extractor,
                &mut embedding_manager,
                search_threshold,
            ) {
                eprintln!("Error processing segment: {:?}", error);
            }
        } else if let Err(error) = segment {
            eprintln!("Failed to process segment: {:?}", error);
        }
    }

    Ok(())
}
