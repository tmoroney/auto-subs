use eyre::{bail, Context, ContextCompat, Result};
use ndarray::Array2;

pub fn compute_fbank(samples: &[f32]) -> Result<Array2<f32>> {
    if samples.is_empty() {
        bail!("The samples array is empty. No features to compute.")
    }

    // Scale samples by 32768 to match WeSpeaker's preprocessing
    // Source: https://github.com/wenet-e2e/wespeaker/blob/master/wespeaker/bin/infer_onnx.py
    // note: 1 << 15
    let scaled_samples: Vec<f32> = samples.iter().map(|&x| x * 32768.0).collect();

    let mut result = unsafe {
        knf_rs_sys::ComputeFbank(
            scaled_samples.as_ptr(),
            scaled_samples.len().try_into().context("samples len")?,
        )
    };

    // Extract frames
    let frames = unsafe {
        std::slice::from_raw_parts(
            result.frames,
            (result.num_frames * result.num_bins) as usize,
        )
        .to_vec()
    };

    let frames_array = Array2::from_shape_vec(
        (
            result.num_frames.try_into().context("num_frames")?,
            result.num_bins.try_into().context("num_bins")?,
        ),
        frames,
    )?;

    unsafe {
        knf_rs_sys::DestroyFbankResult(&mut result as *mut _);
    }

    if frames_array.is_empty() {
        bail!("The frames array is empty. No features to compute.")
    }

    let mean = frames_array.mean_axis(ndarray::Axis(0)).context("mean")?;
    let features = frames_array - mean;

    Ok(features)
}

pub fn convert_integer_to_float_audio(samples: &[i16], output: &mut [f32]) {
    for (input, output) in samples.iter().zip(output.iter_mut()) {
        *output = *input as f32 / 32768.0;
    }
}

#[cfg(test)]
mod tests {
    use crate::compute_fbank;
    use std::f32::consts::PI;

    fn generate_sine_wave(sample_rate: usize, duration: usize, frequency: f32) -> Vec<f32> {
        let waveform_size = sample_rate * duration;
        let mut waveform = Vec::with_capacity(waveform_size);

        for i in 0..waveform_size {
            let sample = 0.5 * (2.0 * PI * frequency * i as f32 / sample_rate as f32).sin();
            waveform.push(sample);
        }
        waveform
    }

    #[test]
    fn it_works() {
        let sample_rate = 16000;
        let duration = 1; // 1 second
        let frequency = 440.0; // A4 note

        let waveform = generate_sine_wave(sample_rate, duration, frequency);
        let features = compute_fbank(&waveform);
        println!("features: {:?}", features);
    }
}
