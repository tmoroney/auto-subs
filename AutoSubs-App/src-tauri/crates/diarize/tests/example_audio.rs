use eyre::Result;
use diarize::raw::{EmbeddingExtractor, EmbeddingManager};
use std::path::Path;

#[derive(Debug, PartialEq)]
struct DiarizedSegment {
    start: String,
    end: String,
    speaker: String,
}

fn has_example_artifacts() -> bool {
    [
        "example.wav",
        "segmentation-community-1.onnx",
        "embedding_model.onnx",
        "xvec_transform.npz",
        "plda.npz",
    ]
    .iter()
    .all(|path| Path::new(path).exists())
}

#[test]
fn example_audio_segments_and_speakers_match_baseline() -> Result<()> {
    if !has_example_artifacts() {
        eprintln!("skipping example audio regression test: local ignored artifacts are missing");
        return Ok(());
    }

    let (samples, sample_rate) = diarize::raw::read_wav("example.wav")?;
    let max_speakers = 6;
    let mut extractor = EmbeddingExtractor::new_with_plda(
        "embedding_model.onnx",
        "xvec_transform.npz",
        "plda.npz",
        128,
    )?;
    let mut manager = EmbeddingManager::new(max_speakers);

    let actual = diarize::raw::get_segments(&samples, sample_rate, "segmentation-community-1.onnx")?
        .map(|segment| {
            let segment = segment?;
            let embedding = extractor.compute(&segment.samples)?;
            let speaker = if manager.get_all_speakers().len() == max_speakers {
                manager.get_best_speaker_match(embedding)?.to_string()
            } else {
                manager
                    .search_speaker(embedding, 0.5)
                    .map(|speaker| speaker.to_string())
                    .unwrap_or_else(|| "?".to_string())
            };

            Ok(DiarizedSegment {
                start: format!("{:.2}", segment.start),
                end: format!("{:.2}", segment.end),
                speaker,
            })
        })
        .collect::<Result<Vec<_>>>()?;

    let expected = vec![
        DiarizedSegment {
            start: "0.05".into(),
            end: "15.69".into(),
            speaker: "1".into(),
        },
        DiarizedSegment {
            start: "16.15".into(),
            end: "24.42".into(),
            speaker: "1".into(),
        },
        DiarizedSegment {
            start: "32.68".into(),
            end: "34.86".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "35.01".into(),
            end: "38.48".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "38.73".into(),
            end: "41.72".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "42.61".into(),
            end: "44.42".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "45.06".into(),
            end: "49.25".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "50.02".into(),
            end: "54.58".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "54.99".into(),
            end: "57.05".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "57.72".into(),
            end: "60.41".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "61.13".into(),
            end: "62.94".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "63.06".into(),
            end: "67.13".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "67.87".into(),
            end: "73.55".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "74.44".into(),
            end: "78.07".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "78.24".into(),
            end: "84.00".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "84.76".into(),
            end: "86.87".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "87.19".into(),
            end: "93.05".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "93.69".into(),
            end: "95.04".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "95.63".into(),
            end: "100.04".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "100.14".into(),
            end: "102.91".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "103.43".into(),
            end: "109.18".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "109.75".into(),
            end: "113.97".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "114.86".into(),
            end: "121.10".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "122.07".into(),
            end: "124.30".into(),
            speaker: "2".into(),
        },
        DiarizedSegment {
            start: "125.08".into(),
            end: "128.93".into(),
            speaker: "2".into(),
        },
    ];

    assert_eq!(actual, expected);
    Ok(())
}
