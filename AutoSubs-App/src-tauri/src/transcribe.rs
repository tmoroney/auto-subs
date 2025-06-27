use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub fn transcribe_audio(
    model_path: String,
    wav_path: String,
    language: String,
) -> Result<Vec<(i32, i32, String)>, String> {
    // Load audio samples
    let samples: Vec<i16> = hound::WavReader::open(&wav_path)
        .map_err(|e| format!("Failed to open wav: {}", e))?
        .into_samples::<i16>()
        .map(|x| x.unwrap())
        .collect();

    // Load whisper model
    let ctx = WhisperContext::new_with_params(&model_path, WhisperContextParameters::default())
        .map_err(|e| format!("Failed to load model: {:?}", e))?;

    let mut state = ctx.create_state().map_err(|e| format!("{:?}", e))?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some(&language));
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    let mut inter_samples = vec![Default::default(); samples.len()];
    whisper_rs::convert_integer_to_float_audio(&samples, &mut inter_samples)
        .map_err(|e| format!("Failed to convert audio: {:?}", e))?;
    let samples = whisper_rs::convert_stereo_to_mono_audio(&inter_samples)
        .map_err(|e| format!("Failed to convert to mono: {:?}", e))?;

    state.full(params, &samples[..]).map_err(|e| format!("{:?}", e))?;

    let num_segments = state.full_n_segments().map_err(|e| format!("{:?}", e))?;
    let mut results = Vec::new();
    for i in 0..num_segments {
        let segment = state.full_get_segment_text(i).map_err(|e| format!("{:?}", e))?;
        let start = state.full_get_segment_t0(i).map_err(|e| format!("{:?}", e))?;
        let end = state.full_get_segment_t1(i).map_err(|e| format!("{:?}", e))?;
        results.push((start as i32, end as i32, segment));
    }
    Ok(results)
}
