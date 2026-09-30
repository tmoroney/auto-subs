/*
Diarize a 16 kHz mono WAV with the Sortformer backend (Nemotron-3-Diarization).

wget https://huggingface.co/altunenes/parakeet-rs/resolve/main/nemotron-3-diarization/nemotron3_diar_v3.onnx
cargo run --release --example sortformer -- audio.wav [nemotron3_diar_v3.onnx] [max_speakers]

Set DUMP_PROBS=start,end (seconds) to print the raw 10 ms speaker probabilities instead.
*/

use diarize::{DiarizeBackend, DiarizeOptions};
use std::time::Instant;

fn main() -> eyre::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let audio_path = args.get(1).expect("usage: sortformer <audio.wav> [model.onnx] [max_speakers]");
    let model_path = args.get(2).map(String::as_str).unwrap_or("nemotron3_diar_v3.onnx");
    let max_speakers = args.get(3).and_then(|v| v.parse().ok()).unwrap_or(usize::MAX);
    let (samples, sample_rate) = diarize::raw::read_wav(audio_path)?;

    if let Ok(range) = std::env::var("DUMP_PROBS") {
        let (start, end) = range.split_once(',').expect("DUMP_PROBS=start,end");
        let (start, end): (f64, f64) = (start.parse()?, end.parse()?);
        let mut model = diarize::raw::SortformerModel::new(model_path.as_ref(), 4)?;
        let probs = model.predict(&samples, |_, _| true)?;
        for t in ((start * 100.0) as usize..((end * 100.0) as usize).min(probs.nrows())).step_by(10) {
            let row: Vec<String> = probs.row(t).iter().map(|p| format!("{p:.2}")).collect();
            println!("{:6.2} {}", t as f64 / 100.0, row.join(" "));
        }
        return Ok(());
    }

    let options = DiarizeOptions {
        backend: DiarizeBackend::Sortformer { model_path: model_path.into() },
        threshold: 0.5,
        max_speakers,
    };
    let started = Instant::now();
    let segments = diarize::diarize(&samples, sample_rate, &options, None, None)?;
    let elapsed = started.elapsed().as_secs_f64();
    for segment in &segments {
        println!(
            "{:8.2} - {:8.2}  speaker {}",
            segment.start,
            segment.end,
            segment.speaker_id.as_deref().unwrap_or("?")
        );
    }
    let duration = samples.len() as f64 / sample_rate as f64;
    eprintln!("{duration:.1}s of audio in {elapsed:.2}s ({:.1}x real time)", duration / elapsed);
    Ok(())
}
