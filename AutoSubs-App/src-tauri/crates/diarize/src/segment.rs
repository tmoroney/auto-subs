use crate::session;
use eyre::{Context, ContextCompat, Result};
use ndarray::{ArrayBase, Axis, IxDyn, ViewRepr};
use ort::value::TensorRef;
use std::iter;
use std::{cmp::Ordering, collections::VecDeque, path::Path};

#[derive(Debug, Clone)]
#[repr(C)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub samples: Vec<i16>,
}

fn find_max_index(row: ArrayBase<ViewRepr<&f32>, IxDyn>) -> Result<usize> {
    let (max_index, _) = row
        .iter()
        .enumerate()
        .max_by(|a, b| {
            a.1.partial_cmp(b.1)
                .context("Comparison error")
                .unwrap_or(Ordering::Equal)
        })
        .context("sub_row should not be empty")?;
    Ok(max_index)
}

pub fn get_segments<P: AsRef<Path>>(
    samples: &[i16],
    sample_rate: u32,
    model_path: P,
) -> Result<impl Iterator<Item = Result<Segment>> + '_> {
    // Create session using the provided model path
    let mut session = session::create_session(model_path.as_ref())?;

    // Define frame parameters
    let frame_size = 270;
    let frame_start = 721;
    let window_size = (sample_rate * 10) as usize; // 10 seconds
    let overlap_size = sample_rate as usize;
    let step_size = window_size.saturating_sub(overlap_size);

    let gap_tolerance_frames = 5usize;
    let min_segment_duration_ms = 150f64;
    let start_hysteresis_ms = 500f64;
    let start_hysteresis_frames = (((sample_rate as f64 * start_hysteresis_ms / 1000.0)
        / frame_size as f64)
        .max(1.0)
        .round()) as usize;

    let mut in_speech_segment = false;
    let mut seg_start_samples: usize = 0;
    let mut silence_frame_count: usize = 0;
    let mut last_emitted_offset: usize = 0;
    let mut speech_run: usize = 0;

    // Pad end with silence for full last segment
    let padded_samples = {
        let mut padded = Vec::from(samples);
        padded.extend(vec![0; window_size]);
        padded
    };

    let mut start_iter = (0..samples.len()).step_by(step_size.max(1));

    let mut segments_queue = VecDeque::new();
    Ok(iter::from_fn(move || loop {
        if let Some(segment) = segments_queue.pop_front() {
            return Some(Ok(segment));
        }

        if let Some(start) = start_iter.next() {
            let end = start + window_size;
            let window = &padded_samples[start..end];

            let window_f32 = window.iter().map(|&x| x as f32).collect::<Vec<_>>();

            // Handle potential errors during the session and input processing
            let tensor = match TensorRef::from_array_view((
                [1usize, 1, window_f32.len()],
                window_f32.as_slice(),
            )) {
                Ok(tensor) => tensor,
                Err(e) => {
                    return Some(Err(eyre::eyre!("Failed to prepare inputs: {:?}", e)));
                }
            };
            let inputs = ort::inputs![
                "input_values" => tensor
            ];

            let ort_outs = match session.run(inputs) {
                Ok(outputs) => outputs,
                Err(e) => return Some(Err(eyre::eyre!("Failed to run the session: {:?}", e))),
            };

            let ort_out = match ort_outs.get("logits").context("Output tensor not found") {
                Ok(output) => output,
                Err(e) => return Some(Err(eyre::eyre!("Output tensor error: {:?}", e))),
            };

            let ort_out = match ort_out
                .try_extract_tensor::<f32>()
                .context("Failed to extract tensor")
            {
                Ok(tensor) => tensor,
                Err(e) => return Some(Err(eyre::eyre!("Tensor extraction error: {:?}", e))),
            };

            let (shape, data) = ort_out; // (&Shape, &[f32])
                                         // Fix: shape is &Shape, but from_shape expects &[usize]
            let shape_slice: Vec<usize> = (0..shape.len()).map(|i| shape[i] as usize).collect();
            let view =
                ndarray::ArrayViewD::<f32>::from_shape(ndarray::IxDyn(&shape_slice), data).unwrap();

            for row in view.outer_iter() {
                for (frame_idx, sub_row) in row.axis_iter(Axis(0)).into_iter().enumerate() {
                    let max_index = match find_max_index(sub_row) {
                        Ok(index) => index,
                        Err(e) => return Some(Err(e)),
                    };

                    let abs_offset = start + frame_start + frame_idx * frame_size;
                    if abs_offset <= last_emitted_offset {
                        continue;
                    }

                    let is_speech = max_index != 0;
                    if is_speech {
                        silence_frame_count = 0;
                        speech_run += 1;

                        if !in_speech_segment && speech_run >= start_hysteresis_frames {
                            let first_abs_offset =
                                abs_offset.saturating_sub((speech_run - 1) * frame_size);
                            seg_start_samples = first_abs_offset;
                            in_speech_segment = true;
                        }
                    } else {
                        speech_run = 0;
                        if in_speech_segment {
                            silence_frame_count += 1;
                            if silence_frame_count >= gap_tolerance_frames {
                                let end_idx = abs_offset.min(samples.len());
                                let start_idx = seg_start_samples.min(end_idx);
                                let segment_duration_ms =
                                    ((end_idx.saturating_sub(start_idx)) as f64) * 1000.0
                                        / sample_rate as f64;

                                if segment_duration_ms >= min_segment_duration_ms
                                    && start_idx < end_idx
                                {
                                    let start_sec = start_idx as f64 / sample_rate as f64;
                                    let end_sec = end_idx as f64 / sample_rate as f64;
                                    let segment_samples = &samples[start_idx..end_idx];

                                    segments_queue.push_back(Segment {
                                        start: start_sec,
                                        end: end_sec,
                                        samples: segment_samples.to_vec(),
                                    });
                                }

                                in_speech_segment = false;
                                silence_frame_count = 0;
                            }
                        }
                    }

                    last_emitted_offset = abs_offset;
                }
            }

            continue;
        }

        if in_speech_segment {
            let start_idx = seg_start_samples.min(samples.len());
            let end_idx = last_emitted_offset.min(samples.len());
            if end_idx > start_idx {
                let segment_duration_ms =
                    ((end_idx - start_idx) as f64) * 1000.0 / sample_rate as f64;
                if segment_duration_ms >= min_segment_duration_ms {
                    let start_sec = start_idx as f64 / sample_rate as f64;
                    let end_sec = end_idx as f64 / sample_rate as f64;
                    let segment_samples = &samples[start_idx..end_idx];
                    segments_queue.push_back(Segment {
                        start: start_sec,
                        end: end_sec,
                        samples: segment_samples.to_vec(),
                    });
                }
            }

            in_speech_segment = false;
            continue;
        }

        return None;
    }))
}
