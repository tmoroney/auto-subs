//! 128-bin log-mel features matching NeMo's `AudioToMelSpectrogramPreprocessor` for
//! Nemotron-3-Diarization: 25 ms Hann window, 10 ms hop, 512-point FFT, 0.97 preemphasis,
//! Slaney mel scale and normalisation, no feature normalisation, no dither.
//!
//! Ported from `altunenes/parakeet-rs` (MIT, see `AUTOSUBS_IMPORT.md`). Unlike upstream,
//! frames are computed on demand for a range, so the whole-file spectrogram is never held
//! in memory (an hour of audio would otherwise need ~0.5 GB).

use eyre::{eyre, Result};
use ndarray::Array2;
use realfft::{RealFftPlanner, RealToComplex};
use std::sync::Arc;

pub const SAMPLE_RATE: usize = 16_000;
pub const N_MELS: usize = 128;
pub const HOP_LENGTH: usize = 160;
const N_FFT: usize = 512;
const WIN_LENGTH: usize = 400;
const FREQ_BINS: usize = N_FFT / 2 + 1;
const PREEMPH: f32 = 0.97;
const LOG_ZERO_GUARD: f32 = 5.960_464_5e-8; // 2^-24

/// Round to the nearest bfloat16 value. The checkpoint stores the STFT window and mel
/// filterbank in bf16 and NeMo runs with those values, so features only match when ours do.
fn to_bf16(x: f32) -> f32 {
    let bits = x.to_bits();
    f32::from_bits((bits + 0x7FFF + ((bits >> 16) & 1)) & 0xFFFF_0000)
}

/// An audio sample the extractor can read, scaled to [-1, 1].
pub trait Sample: Copy {
    fn to_f32(self) -> f32;
}

impl Sample for f32 {
    fn to_f32(self) -> f32 {
        self
    }
}

impl Sample for i16 {
    fn to_f32(self) -> f32 {
        self as f32 / 32768.0
    }
}

pub struct MelExtractor {
    fft: Arc<dyn RealToComplex<f32>>,
    /// Hann window (torch `periodic=False`) zero-padded and centred to `N_FFT`.
    window: Vec<f32>,
    /// `(N_MELS, FREQ_BINS)`
    mel_basis: Array2<f32>,
}

impl MelExtractor {
    pub fn new() -> Self {
        let fft = RealFftPlanner::<f32>::new().plan_fft_forward(N_FFT);

        let n = (WIN_LENGTH - 1) as f64;
        let offset = (N_FFT - WIN_LENGTH) / 2;
        let mut window = vec![0.0f32; N_FFT];
        for i in 0..WIN_LENGTH {
            let w = 0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / n).cos();
            window[offset + i] = to_bf16(w as f32);
        }

        let mel_basis = mel_filterbank().mapv(to_bf16);
        Self {
            fft,
            window,
            mel_basis,
        }
    }

    /// Number of feature frames for `num_samples` of audio (`center=True` framing).
    pub fn num_frames(num_samples: usize) -> usize {
        num_samples / HOP_LENGTH + 1
    }

    /// Log-mel frames `[start, end)` as `(end - start, N_MELS)`. `audio` is the whole
    /// recording; frames past its end see zero padding. Samples are read as i16 and
    /// scaled on the fly so the recording is never duplicated as f32.
    pub fn frames<S: Sample>(&self, audio: &[S], start: usize, end: usize) -> Result<Array2<f32>> {
        let mut out = Array2::<f32>::zeros((end.saturating_sub(start), N_MELS));
        let mut input = self.fft.make_input_vec();
        let mut spectrum = self.fft.make_output_vec();
        let mut scratch = self.fft.make_scratch_vec();
        let mut power = vec![0.0f32; FREQ_BINS];

        // Preemphasised sample at index `j` of the unpadded signal.
        let preemph = |j: isize| -> f32 {
            if j < 0 || j as usize >= audio.len() {
                return 0.0;
            }
            let j = j as usize;
            if j == 0 {
                audio[0].to_f32()
            } else {
                audio[j].to_f32() - PREEMPH * audio[j - 1].to_f32()
            }
        };

        for (row, frame) in (start..end).enumerate() {
            // `center=True`: frame `f` starts at `f * hop - n_fft / 2` in the unpadded signal.
            let origin = (frame * HOP_LENGTH) as isize - (N_FFT / 2) as isize;
            for (i, slot) in input.iter_mut().enumerate() {
                *slot = preemph(origin + i as isize) * self.window[i];
            }
            self.fft
                .process_with_scratch(&mut input, &mut spectrum, &mut scratch)
                .map_err(|e| eyre!("FFT failed: {e}"))?;
            for (p, c) in power.iter_mut().zip(spectrum.iter()) {
                *p = c.norm_sqr();
            }
            for m in 0..N_MELS {
                let basis = self.mel_basis.row(m);
                let energy: f32 = basis.iter().zip(power.iter()).map(|(b, p)| b * p).sum();
                out[[row, m]] = (energy + LOG_ZERO_GUARD).ln();
            }
        }
        Ok(out)
    }
}

// Slaney mel scale (as librosa).
const F_SP: f64 = 200.0 / 3.0;
const MIN_LOG_HZ: f64 = 1000.0;
const MIN_LOG_MEL: f64 = MIN_LOG_HZ / F_SP;
const LOG_STEP: f64 = 0.068_751_777_420_949_12;

fn hz_to_mel(hz: f64) -> f64 {
    if hz < MIN_LOG_HZ {
        hz / F_SP
    } else {
        MIN_LOG_MEL + (hz / MIN_LOG_HZ).ln() / LOG_STEP
    }
}

fn mel_to_hz(mel: f64) -> f64 {
    if mel < MIN_LOG_MEL {
        mel * F_SP
    } else {
        MIN_LOG_HZ * ((mel - MIN_LOG_MEL) * LOG_STEP).exp()
    }
}

/// librosa `filters.mel(norm="slaney")` for 16 kHz, 512-point FFT, 0 Hz to Nyquist.
fn mel_filterbank() -> Array2<f32> {
    let mut filterbank = Array2::<f32>::zeros((N_MELS, FREQ_BINS));
    let mel_max = hz_to_mel(SAMPLE_RATE as f64 / 2.0);
    let hz_points: Vec<f64> = (0..=N_MELS + 1)
        .map(|i| mel_to_hz(mel_max * i as f64 / (N_MELS + 1) as f64))
        .collect();
    let fdiff: Vec<f64> = hz_points.windows(2).map(|w| w[1] - w[0]).collect();

    for m in 0..N_MELS {
        let enorm = 2.0 / (hz_points[m + 2] - hz_points[m]);
        for k in 0..FREQ_BINS {
            let freq = k as f64 * SAMPLE_RATE as f64 / N_FFT as f64;
            let lower = (freq - hz_points[m]) / fdiff[m];
            let upper = (hz_points[m + 2] - freq) / fdiff[m + 1];
            filterbank[[m, k]] = (0.0f64.max(lower.min(upper)) * enorm) as f32;
        }
    }
    filterbank
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(freq_hz: f32, num_samples: usize) -> Vec<f32> {
        (0..num_samples)
            .map(|i| (2.0 * std::f32::consts::PI * freq_hz * i as f32 / SAMPLE_RATE as f32).sin())
            .collect()
    }

    #[test]
    fn frame_count_matches_centered_stft() {
        assert_eq!(MelExtractor::num_frames(0), 1);
        assert_eq!(MelExtractor::num_frames(16_000), 101);
    }

    #[test]
    fn sine_energy_lands_in_matching_mel_band() {
        let audio = sine(1000.0, SAMPLE_RATE);
        let mel = MelExtractor::new().frames(&audio, 10, 90).unwrap();
        let basis = mel_filterbank();
        // The mel band whose filter peaks closest to FFT bin 32 (1 kHz).
        let expected = (0..N_MELS)
            .max_by(|&a, &b| basis[[a, 32]].partial_cmp(&basis[[b, 32]]).unwrap())
            .unwrap();
        for row in mel.rows() {
            let loudest = (0..N_MELS)
                .max_by(|&a, &b| row[a].partial_cmp(&row[b]).unwrap())
                .unwrap();
            assert!(loudest.abs_diff(expected) <= 1, "band {loudest}, expected {expected}");
        }
    }

    #[test]
    fn ranges_are_consistent_with_a_single_pass() {
        let audio = sine(440.0, 8_000);
        let extractor = MelExtractor::new();
        let total = MelExtractor::num_frames(audio.len());
        let whole = extractor.frames(&audio, 0, total).unwrap();
        let tail = extractor.frames(&audio, 20, total).unwrap();
        assert_eq!(whole.slice(ndarray::s![20.., ..]), tail);
    }

    #[test]
    fn silence_is_the_log_guard() {
        let mel = MelExtractor::new().frames(&[0.0; 1600], 0, 5).unwrap();
        assert!(mel.iter().all(|&v| (v - LOG_ZERO_GUARD.ln()).abs() < 1e-6));
    }
}
