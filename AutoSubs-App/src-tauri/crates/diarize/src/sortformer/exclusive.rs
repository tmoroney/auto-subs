//! Turns Sortformer's per-speaker activity probabilities into the disjoint, single-speaker
//! segments AutoSubs transcribes one at a time.
//!
//! Diarization output decides which audio gets transcribed, so this is deliberately not
//! NeMo's per-speaker binarization. When the model is sure someone is talking but splits
//! the probability between two speakers (0.40 / 0.22), no channel crosses 0.5 and NeMo
//! emits nothing: for subtitles those words would vanish. Instead:
//!
//! 1. speech activity comes from all channels together (`1 - prod(1 - p)`);
//! 2. each speech frame goes to the most likely speaker (smoothed), which also resolves
//!    overlap to the dominant speaker;
//! 3. turns too short to transcribe on their own are absorbed into an adjacent turn;
//! 4. same-speaker turns across short pauses are merged, then padded slightly;
//! 5. speakers are numbered by first appearance in what is left.

use super::model::NUM_SPEAKERS;
use ndarray::Array2;

/// One 10 ms output frame, in 16 kHz samples.
pub const FRAME_SAMPLES: usize = 160;

#[derive(Debug, Clone)]
pub struct ExclusiveConfig {
    /// Speech starts when combined activity rises above this...
    pub onset: f32,
    /// ...and ends when it falls below this.
    pub offset: f32,
    /// Speech runs shorter than this (frames) are dropped as blips.
    pub min_speech_frames: usize,
    /// Moving-average window (frames) applied to probabilities before picking a speaker.
    pub speaker_smoothing_frames: usize,
    /// Turns shorter than this (frames) are absorbed into an adjacent turn, if one is
    /// within `merge_gap_frames` and the model is not confident the short turn is a
    /// different speaker (see `confident_turn_prob`).
    pub min_turn_frames: usize,
    /// A short turn is kept as its own speaker when its speaker's mean probability over
    /// it is at least this, and beats every close neighbour's speaker by
    /// `confident_turn_margin`. That keeps quick replies ("Yeah.") from another person
    /// while still absorbing flickers where the model is unsure.
    pub confident_turn_prob: f32,
    pub confident_turn_margin: f32,
    /// Same-speaker turns separated by less than this many silent frames are merged.
    pub merge_gap_frames: usize,
    /// Frames added at each end of a segment, never overlapping a neighbour.
    pub pad_frames: usize,
}

impl Default for ExclusiveConfig {
    fn default() -> Self {
        Self {
            onset: 0.5,
            offset: 0.35,
            min_speech_frames: 15,
            speaker_smoothing_frames: 15,
            min_turn_frames: 40,
            confident_turn_prob: 0.7,
            confident_turn_margin: 0.3,
            merge_gap_frames: 50,
            pad_frames: 10,
        }
    }
}

/// A disjoint segment in 16 kHz samples, `speaker` numbered from 0 by first appearance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Turn {
    pub start: usize,
    pub end: usize,
    pub speaker: usize,
}

/// A run of frames `[start, end)` given to one model channel.
#[derive(Debug, Clone, Copy)]
struct Run {
    start: usize,
    end: usize,
    channel: usize,
}

impl Run {
    fn len(&self) -> usize {
        self.end - self.start
    }
}

pub fn exclusive_turns(
    probs: &Array2<f32>,
    num_samples: usize,
    max_speakers: usize,
    config: &ExclusiveConfig,
) -> Vec<Turn> {
    let frames = probs.nrows().min(num_samples.div_ceil(FRAME_SAMPLES));
    if frames == 0 || max_speakers == 0 {
        return Vec::new();
    }
    let allowed = allowed_channels(probs, frames, max_speakers);

    let speech = speech_mask(probs, frames, config);
    let smoothed = moving_average(probs, frames, config.speaker_smoothing_frames);

    let mut runs = Vec::new();
    let mut t = 0;
    while t < frames {
        if !speech[t] {
            t += 1;
            continue;
        }
        let channel = best_channel(&smoothed, t, &allowed);
        let start = t;
        while t < frames && speech[t] && best_channel(&smoothed, t, &allowed) == channel {
            t += 1;
        }
        runs.push(Run {
            start,
            end: t,
            channel,
        });
    }

    let runs = absorb_short_turns(runs, probs, config);
    let runs = merge_same_speaker(runs, config.merge_gap_frames);
    to_turns(&runs, num_samples, config.pad_frames)
}

/// The `max_speakers` channels with the most total activity (all of them if fewer).
/// Speech from the other channels is still transcribed, attributed to an allowed one.
fn allowed_channels(probs: &Array2<f32>, frames: usize, max_speakers: usize) -> Vec<usize> {
    let mut activity: Vec<(usize, f32)> = (0..NUM_SPEAKERS.min(probs.ncols()))
        .map(|k| (k, (0..frames).map(|t| probs[[t, k]]).sum()))
        .collect();
    activity.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let mut allowed: Vec<usize> = activity
        .into_iter()
        .take(max_speakers)
        .map(|(k, _)| k)
        .collect();
    allowed.sort_unstable();
    allowed
}

fn speech_mask(probs: &Array2<f32>, frames: usize, config: &ExclusiveConfig) -> Vec<bool> {
    let mut mask = vec![false; frames];
    let mut active = false;
    for (t, slot) in mask.iter_mut().enumerate() {
        let silence: f32 = probs.row(t).iter().map(|p| 1.0 - p.clamp(0.0, 1.0)).product();
        let p = 1.0 - silence;
        active = if p > config.onset {
            true
        } else if p < config.offset {
            false
        } else {
            active
        };
        *slot = active;
    }

    // Drop blips.
    let mut t = 0;
    while t < frames {
        if !mask[t] {
            t += 1;
            continue;
        }
        let start = t;
        while t < frames && mask[t] {
            t += 1;
        }
        if t - start < config.min_speech_frames {
            mask[start..t].fill(false);
        }
    }
    mask
}

fn moving_average(probs: &Array2<f32>, frames: usize, window: usize) -> Array2<f32> {
    let channels = probs.ncols();
    if window <= 1 {
        return probs.slice(ndarray::s![..frames, ..]).to_owned();
    }
    let half = window / 2;
    let mut out = Array2::zeros((frames, channels));
    for k in 0..channels {
        let mut prefix = vec![0.0f64; frames + 1];
        for t in 0..frames {
            prefix[t + 1] = prefix[t] + probs[[t, k]] as f64;
        }
        for t in 0..frames {
            let lo = t.saturating_sub(half);
            let hi = (t + half + 1).min(frames);
            out[[t, k]] = ((prefix[hi] - prefix[lo]) / (hi - lo) as f64) as f32;
        }
    }
    out
}

fn best_channel(probs: &Array2<f32>, t: usize, allowed: &[usize]) -> usize {
    let mut best = allowed[0];
    for &k in &allowed[1..] {
        if probs[[t, k]] > probs[[t, best]] {
            best = k;
        }
    }
    best
}

fn mean_prob(probs: &Array2<f32>, run: &Run, channel: usize) -> f32 {
    (run.start..run.end).map(|t| probs[[t, channel]]).sum::<f32>() / run.len().max(1) as f32
}

/// Repeatedly give the shortest too-short turn to the adjacent turn whose speaker the model
/// finds more likely over it. A short turn stays when it has no close neighbour (a lone
/// "Yes.") or when the model is confident it is a different speaker (a quick reply).
fn absorb_short_turns(mut runs: Vec<Run>, probs: &Array2<f32>, config: &ExclusiveConfig) -> Vec<Run> {
    let close = |a: &Run, b: &Run| b.start - a.end < config.merge_gap_frames;
    // Channels of the close neighbours of `runs[i]`.
    let neighbours = |runs: &[Run], i: usize| -> (Option<usize>, Option<usize>) {
        let prev = (i > 0 && close(&runs[i - 1], &runs[i])).then(|| runs[i - 1].channel);
        let next = (i + 1 < runs.len() && close(&runs[i], &runs[i + 1])).then(|| runs[i + 1].channel);
        (prev, next)
    };
    let confident = |run: &Run, (prev, next): (Option<usize>, Option<usize>)| -> bool {
        let own = mean_prob(probs, run, run.channel);
        let rival = [prev, next]
            .into_iter()
            .flatten()
            .map(|channel| mean_prob(probs, run, channel))
            .fold(0.0f32, f32::max);
        own >= config.confident_turn_prob && own - rival >= config.confident_turn_margin
    };

    loop {
        let candidate = (0..runs.len())
            .filter(|&i| runs[i].len() < config.min_turn_frames)
            .filter(|&i| {
                let near = neighbours(&runs, i);
                (near.0.is_some() || near.1.is_some()) && !confident(&runs[i], near)
            })
            .min_by_key(|&i| runs[i].len());
        let Some(i) = candidate else {
            return runs;
        };

        let channel = match neighbours(&runs, i) {
            (Some(p), Some(n)) if mean_prob(probs, &runs[i], n) > mean_prob(probs, &runs[i], p) => n,
            (Some(p), _) => p,
            (None, Some(n)) => n,
            (None, None) => unreachable!("candidate has a close neighbour"),
        };
        runs[i].channel = channel;
        runs = merge_same_speaker(runs, config.merge_gap_frames);
    }
}

fn merge_same_speaker(runs: Vec<Run>, max_gap: usize) -> Vec<Run> {
    let mut merged: Vec<Run> = Vec::with_capacity(runs.len());
    for run in runs {
        match merged.last_mut() {
            Some(last) if last.channel == run.channel && run.start - last.end < max_gap => {
                last.end = run.end;
            }
            _ => merged.push(run),
        }
    }
    merged
}

fn to_turns(runs: &[Run], num_samples: usize, pad_frames: usize) -> Vec<Turn> {
    let pad = pad_frames * FRAME_SAMPLES;
    let mut first_seen: Vec<usize> = Vec::new();
    let mut turns = Vec::with_capacity(runs.len());
    for (i, run) in runs.iter().enumerate() {
        let start = run.start * FRAME_SAMPLES;
        let end = (run.end * FRAME_SAMPLES).min(num_samples);
        // Pad into silence, but never past the midpoint of the gap to a neighbour.
        let lower = match i.checked_sub(1).map(|p| runs[p].end * FRAME_SAMPLES) {
            Some(prev_end) => prev_end + (start - prev_end).div_ceil(2),
            None => 0,
        };
        let upper = match runs.get(i + 1) {
            Some(next) => end + (next.start * FRAME_SAMPLES - end) / 2,
            None => num_samples,
        };
        let speaker = match first_seen.iter().position(|&c| c == run.channel) {
            Some(idx) => idx,
            None => {
                first_seen.push(run.channel);
                first_seen.len() - 1
            }
        };
        let turn = Turn {
            start: start.saturating_sub(pad).max(lower),
            end: (end + pad).min(upper).min(num_samples),
            speaker,
        };
        if turn.end > turn.start {
            turns.push(turn);
        }
    }
    turns
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `spans` of `(start_frame, end_frame, channel, prob)`.
    fn probs(frames: usize, spans: &[(usize, usize, usize, f32)]) -> Array2<f32> {
        let mut p = Array2::zeros((frames, NUM_SPEAKERS));
        for &(start, end, channel, prob) in spans {
            for t in start..end {
                p[[t, channel]] = prob;
            }
        }
        p
    }

    fn run(probs: &Array2<f32>, max_speakers: usize) -> Vec<Turn> {
        let config = ExclusiveConfig {
            pad_frames: 0,
            ..Default::default()
        };
        exclusive_turns(probs, probs.nrows() * FRAME_SAMPLES, max_speakers, &config)
    }

    fn frames(turns: &[Turn]) -> Vec<(usize, usize, usize)> {
        turns
            .iter()
            .map(|t| (t.start / FRAME_SAMPLES, t.end / FRAME_SAMPLES, t.speaker))
            .collect()
    }

    #[test]
    fn split_probability_is_still_speech() {
        // No channel crosses 0.5, but someone is clearly talking.
        let p = probs(300, &[(100, 230, 1, 0.40), (100, 230, 4, 0.22)]);
        assert_eq!(frames(&run(&p, usize::MAX)), vec![(100, 230, 0)]);
    }

    #[test]
    fn overlap_goes_to_the_dominant_speaker_and_labels_follow_arrival() {
        let p = probs(
            600,
            &[(0, 200, 3, 0.9), (200, 400, 5, 0.9), (180, 220, 3, 0.6)],
        );
        let turns = frames(&run(&p, usize::MAX));
        assert_eq!(turns.len(), 2);
        assert_eq!((turns[0].2, turns[1].2), (0, 1));
        assert_eq!(turns[0].1, turns[1].0, "adjacent turns share a boundary");
    }

    #[test]
    fn uncertain_short_flip_is_absorbed() {
        // A 0.2 s flip to speaker 2 in the middle of speaker 0, where the model is torn.
        let p = probs(
            500,
            &[(0, 200, 0, 0.9), (200, 220, 2, 0.55), (200, 220, 0, 0.45), (220, 450, 0, 0.9)],
        );
        assert_eq!(frames(&run(&p, usize::MAX)), vec![(0, 450, 0)]);
    }

    #[test]
    fn confident_short_reply_keeps_its_speaker() {
        // Speaker 1 says "Yeah." (0.3 s) right after speaker 0, then speaker 0 carries on.
        let p = probs(
            600,
            &[(0, 200, 0, 0.9), (210, 240, 1, 0.9), (250, 500, 0, 0.9)],
        );
        let turns = frames(&run(&p, usize::MAX));
        assert_eq!(turns.len(), 3, "{turns:?}");
        assert_eq!(turns.iter().map(|t| t.2).collect::<Vec<_>>(), vec![0, 1, 0]);
    }

    #[test]
    fn isolated_short_utterance_is_kept() {
        let p = probs(600, &[(0, 150, 0, 0.9), (300, 325, 1, 0.9), (480, 600, 0, 0.9)]);
        assert_eq!(
            frames(&run(&p, usize::MAX)),
            vec![(0, 150, 0), (300, 325, 1), (480, 600, 0)]
        );
    }

    #[test]
    fn same_speaker_across_a_short_pause_is_one_segment() {
        let p = probs(400, &[(0, 100, 0, 0.9), (130, 300, 0, 0.9)]);
        assert_eq!(frames(&run(&p, usize::MAX)), vec![(0, 300, 0)]);
    }

    #[test]
    fn long_pause_splits_segments() {
        let p = probs(400, &[(0, 100, 0, 0.9), (200, 300, 0, 0.9)]);
        assert_eq!(frames(&run(&p, usize::MAX)), vec![(0, 100, 0), (200, 300, 0)]);
    }

    #[test]
    fn blips_are_dropped() {
        let p = probs(200, &[(50, 55, 0, 0.9)]);
        assert!(run(&p, usize::MAX).is_empty());
    }

    #[test]
    fn max_speakers_caps_labels_without_losing_speech() {
        let p = probs(
            1000,
            &[(0, 400, 0, 0.9), (500, 900, 1, 0.9), (420, 480, 2, 0.9)],
        );
        let turns = run(&p, 2);
        assert!(turns.iter().all(|t| t.speaker < 2));
        let covered: usize = turns.iter().map(|t| t.end - t.start).sum();
        assert!(covered >= (400 + 400 + 60) * FRAME_SAMPLES);
    }

    #[test]
    fn dropped_channels_do_not_leave_label_gaps() {
        // Channel 1 only ever appears as an uncertain short flip that gets absorbed.
        let p = probs(
            800,
            &[
                (0, 200, 0, 0.9),
                (200, 215, 1, 0.55),
                (200, 215, 0, 0.45),
                (215, 400, 0, 0.9),
                (500, 800, 2, 0.9),
            ],
        );
        let labels: Vec<usize> = run(&p, usize::MAX).iter().map(|t| t.speaker).collect();
        assert_eq!(labels, vec![0, 1]);
    }

    #[test]
    fn padding_stays_inside_the_audio_and_between_neighbours() {
        let p = probs(300, &[(0, 100, 0, 0.9), (104, 300, 1, 0.9)]);
        let turns = exclusive_turns(&p, 300 * FRAME_SAMPLES, usize::MAX, &ExclusiveConfig::default());
        assert_eq!(turns[0].start, 0);
        assert!(turns[0].end <= turns[1].start);
        assert_eq!(turns[1].end, 300 * FRAME_SAMPLES);
    }

    #[test]
    fn silence_yields_nothing() {
        assert!(run(&Array2::zeros((500, NUM_SPEAKERS)), usize::MAX).is_empty());
    }
}
