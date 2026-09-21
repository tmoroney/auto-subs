use crate::types::{Segment, SpeechSegment, WordTimestamp};

/// Minimum duration to keep on a word when clamping, so caption animations
/// still show a brief flash instead of the word collapsing to zero width.
const MIN_WORD_DURATION: f64 = 0.01;

/// Configuration for VAD-guided timestamp snapping.
#[derive(Debug, Clone)]
pub struct VadSnapConfig {
    /// A word start this far before the VAD onset (or closer) is snapped
    /// forward onto it — Whisper often places starts inside pre-speech silence.
    pub max_leading_pad_sec: f64,
    /// A word end must overhang the VAD offset by more than this before it is
    /// clamped; smaller overhangs are left alone.
    pub max_trailing_pad_sec: f64,
}

impl Default for VadSnapConfig {
    fn default() -> Self {
        Self {
            max_leading_pad_sec: 0.2,
            max_trailing_pad_sec: 0.5,
        }
    }
}

/// Snap word timestamps to the VAD-detected speech regions, then remove any
/// word/segment overlaps that snapping (or Whisper itself) produced.
///
/// VAD intervals and word timestamps must share a timeline: intervals are
/// expected to already carry the same user offset the engines add to emitted
/// timestamps (see `extract_vad_intervals`).
pub fn snap_timestamps_to_vad(
    segments: &mut [Segment],
    vad_intervals: &[(f64, f64)],
    config: &VadSnapConfig,
) {
    for segment in segments.iter_mut() {
        let Some(words) = segment.words.as_mut() else {
            continue;
        };
        for word in words.iter_mut() {
            snap_word_to_vad(word, vad_intervals, config);
        }
        resolve_word_overlaps(words);
        if let (Some(first), Some(last)) = (words.first(), words.last()) {
            segment.start = first.start;
            segment.end = last.end;
        }
    }
    resolve_segment_overlaps(segments);
}

/// Extract VAD speech intervals in the same timeline as emitted timestamps:
/// engines bake `options.offset` into every word/segment time, so the VAD
/// bounds must be shifted by the same amount or nothing will line up.
pub fn extract_vad_intervals(
    speech_segments: &[SpeechSegment],
    offset: f64,
) -> Vec<(f64, f64)> {
    let mut intervals: Vec<(f64, f64)> = speech_segments
        .iter()
        .map(|s| (s.start + offset, s.end + offset))
        .collect();
    intervals.sort_by(|a, b| a.0.total_cmp(&b.0));
    intervals
}

/// Snap a word to the VAD interval it overlaps (the first one, when it spans
/// several). A word sitting entirely inside a silence gap is left untouched —
/// clamping it to a distant boundary would collapse or teleport it.
fn snap_word_to_vad(word: &mut WordTimestamp, vad: &[(f64, f64)], config: &VadSnapConfig) {
    // Intervals are sorted by start; skip every interval ending at or before
    // the word's start. A word merely touching a VAD boundary isn't owned by
    // that interval — clamping it would collapse the word to zero duration.
    let i = vad.partition_point(|&(_, vad_end)| word.start >= vad_end);
    let Some(&(vad_start, vad_end)) = vad.get(i) else {
        return;
    };
    if word.end <= vad_start {
        return; // fully inside a gap before this interval
    }
    if word.start < vad_start && vad_start - word.start <= config.max_leading_pad_sec {
        word.start = vad_start;
    }
    if word.end > vad_end && word.end - vad_end > config.max_trailing_pad_sec {
        word.end = vad_end;
    }
    if word.end < word.start {
        word.end = word.start;
    }
}

/// Split overlapping adjacent words at the midpoint of the overlap. A single
/// forward pass suffices: each boundary only moves the next word's start later.
fn resolve_word_overlaps(words: &mut [WordTimestamp]) {
    for i in 0..words.len().saturating_sub(1) {
        if words[i].end <= words[i + 1].start {
            continue;
        }
        // Never place the boundary before word i's own start — that would move
        // it backwards into the previous word's already-finalized span.
        let boundary = ((words[i].end + words[i + 1].start) / 2.0).max(words[i].start);
        words[i].end = boundary;
        words[i + 1].start = boundary;
        if words[i + 1].end < words[i + 1].start {
            words[i + 1].end = words[i + 1].start + MIN_WORD_DURATION;
        }
    }
}

/// Enforce non-overlapping segments with a single forward pass. Overlapping
/// neighbours meet at the midpoint of the overlap, floored by the previous
/// pair's boundary — a middle segment squeezed from both sides can collapse to
/// zero width, but it can never slide back under the boundary already fixed
/// behind it, so a single pass provably converges.
fn resolve_segment_overlaps(segments: &mut [Segment]) {
    let mut prev_boundary: Option<f64> = None;
    for i in 0..segments.len().saturating_sub(1) {
        let (before, after) = segments.split_at_mut(i + 1);
        let prev = &mut before[i];
        let next = &mut after[0];
        if prev.end <= next.start {
            prev_boundary = None;
            continue;
        }
        let mut boundary = (prev.end + next.start) / 2.0;
        if let Some(floor) = prev_boundary {
            boundary = boundary.max(floor);
        }
        let floor = prev_boundary.unwrap_or(0.0);
        if let Some(words) = prev.words.as_mut() {
            clamp_words_before_boundary(words, boundary, floor);
            if let (Some(first), Some(last)) = (words.first(), words.last()) {
                prev.start = prev.start.min(first.start);
                prev.end = last.end;
            }
        } else {
            prev.end = boundary;
        }
        if let Some(words) = next.words.as_mut() {
            clamp_words_after_boundary(words, boundary);
            if let (Some(first), Some(last)) = (words.first(), words.last()) {
                next.start = first.start;
                next.end = next.end.max(last.end);
            }
        } else {
            next.start = boundary;
        }
        prev_boundary = Some(boundary);
    }
}

/// Clamp word ends so none reaches past `boundary`, walking backwards so words
/// that land entirely past it compress to MIN_WORD_DURATION where possible.
/// `floor` is the boundary fixed for the previous segment pair: no word start
/// may move below it, which is what makes the single forward pass safe.
fn clamp_words_before_boundary(words: &mut [WordTimestamp], boundary: f64, floor: f64) {
    let count = words.len();
    for i in (0..count).rev() {
        let limit = if i + 1 == count {
            boundary
        } else {
            words[i + 1].start
        };
        if words[i].end > limit {
            words[i].end = limit;
        }
        if words[i].start >= words[i].end {
            words[i].start = (words[i].end - MIN_WORD_DURATION).max(floor);
        }
    }
}

/// Clamp word starts so none begins before `boundary`, walking forwards so
/// each word keeps at least MIN_WORD_DURATION where possible.
fn clamp_words_after_boundary(words: &mut [WordTimestamp], boundary: f64) {
    let count = words.len();
    for i in 0..count {
        let min_start = if i == 0 { boundary } else { words[i - 1].end };
        if words[i].start < min_start {
            words[i].start = min_start;
        }
        if words[i].end <= words[i].start {
            words[i].end = words[i].start + MIN_WORD_DURATION;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_word(text: &str, start: f64, end: f64) -> WordTimestamp {
        WordTimestamp {
            text: text.to_string(),
            start,
            end,
            probability: Some(0.9),
        }
    }

    fn make_segment(words: Vec<WordTimestamp>) -> Segment {
        let start = words.first().map(|w| w.start).unwrap_or(0.0);
        let end = words.last().map(|w| w.end).unwrap_or(0.0);
        Segment {
            start,
            end,
            text: words
                .iter()
                .map(|w| w.text.as_str())
                .collect::<Vec<_>>()
                .join(" "),
            words: Some(words),
            speaker_id: None,
        }
    }

    #[test]
    fn test_trailing_overhang_truncation() {
        // Word starts inside speech and extends 1.5s past VAD end at 5.0s
        let mut segments = vec![make_segment(vec![
            make_word("Hello", 4.0, 5.0),
            make_word("world", 4.5, 6.5),
        ])];

        let vad_intervals = vec![(4.0, 5.0)];
        snap_timestamps_to_vad(&mut segments, &vad_intervals, &VadSnapConfig::default());

        // "world" end should be clamped to VAD end (5.0) since overhang (1.5s) > max_pad (0.5s)
        assert_eq!(segments[0].words.as_ref().unwrap()[1].end, 5.0);
        assert!(segments[0].words.as_ref().unwrap()[1].start < 5.0);
    }

    #[test]
    fn test_word_starting_at_vad_end_not_owned() {
        // Word starts exactly at the VAD offset — it belongs to the silence
        // after speech, so it must not be clamped (clamping would zero it out).
        let mut segments = vec![make_segment(vec![make_word("noise", 5.0, 6.5)])];

        let vad_intervals = vec![(4.0, 5.0)];
        snap_timestamps_to_vad(&mut segments, &vad_intervals, &VadSnapConfig::default());

        let word = &segments[0].words.as_ref().unwrap()[0];
        assert_eq!(word.start, 5.0);
        assert_eq!(word.end, 6.5);
    }

    #[test]
    fn test_trailing_overhang_preserved_when_small() {
        // Word extends only 0.3s into silence after VAD end at 5.0s
        let mut segments = vec![make_segment(vec![
            make_word("Hello", 4.0, 5.0),
            make_word("world", 5.0, 5.3),
        ])];

        let vad_intervals = vec![(4.0, 5.0)];
        snap_timestamps_to_vad(&mut segments, &vad_intervals, &VadSnapConfig::default());

        // "world" end should remain at 5.3 since overhang (0.3s) <= max_pad (0.5s)
        assert_eq!(segments[0].words.as_ref().unwrap()[1].end, 5.3);
    }

    #[test]
    fn test_leading_edge_snap() {
        // Word starts 0.15s before VAD onset at 2.0s
        let mut segments = vec![make_segment(vec![make_word("Hello", 1.85, 2.5)])];

        let vad_intervals = vec![(2.0, 5.0)];
        snap_timestamps_to_vad(&mut segments, &vad_intervals, &VadSnapConfig::default());

        assert_eq!(segments[0].words.as_ref().unwrap()[0].start, 2.0);
    }

    #[test]
    fn test_leading_edge_not_snapped_when_too_far() {
        // Word starts 0.5s before VAD onset at 2.0s (exceeds 0.2s max)
        let mut segments = vec![make_segment(vec![make_word("Hello", 1.5, 2.5)])];

        let vad_intervals = vec![(2.0, 5.0)];
        snap_timestamps_to_vad(&mut segments, &vad_intervals, &VadSnapConfig::default());

        assert_eq!(segments[0].words.as_ref().unwrap()[0].start, 1.5);
    }

    #[test]
    fn test_word_in_silence_gap_untouched() {
        // Word sits fully inside a silence gap — it must not be clamped to a
        // distant VAD edge (the original closest-interval logic collapsed such
        // words to zero duration).
        let mut segments = vec![make_segment(vec![make_word("um", 3.0, 3.5)])];

        let vad_intervals = vec![(1.0, 2.0), (4.0, 5.0)];
        snap_timestamps_to_vad(&mut segments, &vad_intervals, &VadSnapConfig::default());

        let word = &segments[0].words.as_ref().unwrap()[0];
        assert_eq!(word.start, 3.0);
        assert_eq!(word.end, 3.5);
    }

    #[test]
    fn test_overlap_prevention() {
        // Two words with overlapping timestamps (common in high-WPM speech)
        let mut segments = vec![make_segment(vec![
            make_word("Hello", 1.0, 1.8),
            make_word("world", 1.5, 2.2), // overlap!
        ])];

        let vad_intervals = vec![(1.0, 3.0)];
        snap_timestamps_to_vad(&mut segments, &vad_intervals, &VadSnapConfig::default());

        let words = segments[0].words.as_ref().unwrap();
        // Boundary at the midpoint of the overlap: (1.8 + 1.5) / 2 = 1.65
        assert!((words[0].end - 1.65).abs() < 0.001);
        assert!((words[1].start - 1.65).abs() < 0.001);
        assert!(words[0].end <= words[1].start);
    }

    #[test]
    fn test_segment_bounds_recalculated() {
        let mut segments = vec![make_segment(vec![
            make_word("Hello", 1.0, 2.0),
            make_word("world", 2.0, 3.5),
        ])];

        let vad_intervals = vec![(1.0, 3.0)];
        snap_timestamps_to_vad(&mut segments, &vad_intervals, &VadSnapConfig::default());

        // "world" overhang 0.5 is not > 0.5, so it survives; segment follows last word
        assert_eq!(segments[0].end, 3.5);
    }

    #[test]
    fn test_multiple_vad_intervals() {
        // Two separate speech regions with silence between
        let mut segments = vec![
            make_segment(vec![make_word("Hello", 1.0, 2.5)]), // ends in silence
            make_segment(vec![make_word("world", 4.5, 5.0)]), // starts before VAD
        ];

        let vad_intervals = vec![(1.0, 2.0), (5.0, 6.0)];
        snap_timestamps_to_vad(&mut segments, &vad_intervals, &VadSnapConfig::default());

        // "Hello" overhang is exactly 0.5 — not strictly greater than max_pad, kept
        assert_eq!(segments[0].words.as_ref().unwrap()[0].end, 2.5);

        // "world" gap of 0.5 exceeds max_leading_pad (0.2), so no snap
        assert_eq!(segments[1].words.as_ref().unwrap()[0].start, 4.5);
    }

    #[test]
    fn test_extract_intervals_applies_offset() {
        let seg = SpeechSegment {
            start: 1.0,
            end: 2.0,
            samples: Vec::new(),
            speaker_id: None,
        };
        let intervals = extract_vad_intervals(&[seg], 10.0);
        assert_eq!(intervals, vec![(11.0, 12.0)]);
    }

    #[test]
    fn test_segment_overlap_prevention() {
        let mut segments = vec![
            make_segment(vec![make_word("Hello", 1.0, 3.0)]),
            make_segment(vec![make_word("world", 2.5, 4.0)]), // overlap!
        ];

        let vad_intervals = vec![(1.0, 4.0)];
        snap_timestamps_to_vad(&mut segments, &vad_intervals, &VadSnapConfig::default());

        // Boundary at midpoint: (3.0 + 2.5) / 2 = 2.75
        assert!((segments[0].end - 2.75).abs() < 0.001);
        assert!((segments[1].start - 2.75).abs() < 0.001);

        let words0 = segments[0].words.as_ref().unwrap();
        let words1 = segments[1].words.as_ref().unwrap();
        assert_eq!(words0[0].end, 2.75);
        assert_eq!(words1[0].start, 2.75);
        assert!(words0[0].end > words0[0].start);
        assert!(words1[0].end > words1[0].start);
    }

    #[test]
    fn test_segment_overlap_with_multiple_words() {
        let mut segments = vec![
            make_segment(vec![
                make_word("Hello", 1.0, 2.0),
                make_word(" there", 2.0, 3.5),
            ]),
            make_segment(vec![make_word("world", 2.5, 3.5), make_word("!", 3.5, 4.0)]),
        ];

        let vad_intervals = vec![(1.0, 4.0)];
        snap_timestamps_to_vad(&mut segments, &vad_intervals, &VadSnapConfig::default());

        // Boundary at midpoint: (3.5 + 2.5) / 2 = 3.0
        assert!((segments[0].end - 3.0).abs() < 0.001);
        assert!((segments[1].start - 3.0).abs() < 0.001);

        let words0 = segments[0].words.as_ref().unwrap();
        for word in words0 {
            assert!(word.end <= 3.0, "word end {} should be <= 3.0", word.end);
            assert!(word.end > word.start, "word '{}' has zero/negative duration", word.text);
        }

        let words1 = segments[1].words.as_ref().unwrap();
        for word in words1 {
            assert!(word.start >= 3.0, "word start {} should be >= 3.0", word.start);
            assert!(word.end > word.start, "word '{}' has zero/negative duration", word.text);
        }
    }

    #[test]
    fn test_segment_overlap_preserves_all_words() {
        let mut segments = vec![
            make_segment(vec![
                make_word("Hello", 1.0, 2.0),
                make_word(" world", 2.0, 3.5), // crosses the boundary
                make_word(" extra", 3.5, 4.0), // entirely past the boundary
            ]),
            make_segment(vec![
                make_word(" prev", 2.5, 3.5), // crosses the boundary
                make_word(" there", 3.0, 3.5),
                make_word("!", 3.5, 4.0),
            ]),
        ];

        let vad_intervals = vec![(1.0, 4.0)];
        snap_timestamps_to_vad(&mut segments, &vad_intervals, &VadSnapConfig::default());

        // Word-overlap pass runs first: " prev"(2.5-3.5) overlaps " there"(3.0-3.5)
        // -> split at 3.25. Then segment overlap: seg0.end=4.0, seg1.start=2.5
        // -> boundary (4.0 + 2.5) / 2 = 3.25.
        assert!((segments[0].end - 3.25).abs() < 0.001);
        assert!((segments[1].start - 3.25).abs() < 0.001);

        let words0 = segments[0].words.as_ref().unwrap();
        assert_eq!(words0.len(), 3, "first segment should preserve all 3 words");
        assert_eq!(words0[0].text, "Hello");
        assert_eq!(words0[1].text, " world");
        assert_eq!(words0[2].text, " extra");

        let words1 = segments[1].words.as_ref().unwrap();
        assert_eq!(words1.len(), 3, "second segment should preserve all 3 words");
        assert_eq!(words1[0].text, " prev");
        assert_eq!(words1[1].text, " there");
        assert_eq!(words1[2].text, "!");

        for word in words0.iter().chain(words1.iter()) {
            assert!(
                word.end > word.start,
                "word '{}' has zero/negative duration: [{}, {}]",
                word.text,
                word.start,
                word.end
            );
        }
    }

    #[test]
    fn test_middle_segment_squeezed_by_two_neighbours() {
        // Regression: a middle segment squeezed from both sides used to get its
        // start pulled back below the boundary already fixed behind it.
        let mut segments = vec![
            make_segment(vec![make_word("a", 0.0, 10.0)]),
            make_segment(vec![make_word("b", 4.0, 8.0)]),
            make_segment(vec![make_word("c", 5.0, 9.0)]),
        ];

        let vad_intervals = vec![(0.0, 10.0)];
        snap_timestamps_to_vad(&mut segments, &vad_intervals, &VadSnapConfig::default());

        // A/B resolves at 7.0; B/C then resolves at boundary max(6.5, 7.0) = 7.0,
        // collapsing B to a point at 7.0 rather than overlapping A again.
        assert!(segments[0].end <= segments[1].start,
            "segments overlap: {:?} vs {:?}", segments[0].end, segments[1].start);
        assert!(segments[1].end <= segments[2].start);
        assert!((segments[0].end - 7.0).abs() < 0.001);
        assert!(segments[1].start >= 7.0);
        assert!(segments[2].start >= segments[1].end);
    }
}
