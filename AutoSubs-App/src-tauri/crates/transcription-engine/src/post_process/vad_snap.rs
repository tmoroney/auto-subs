use crate::types::{Segment, WordTimestamp};
use eyre::Result;

/// Configuration for VAD-guided timestamp snapping
#[derive(Debug, Clone)]
pub struct VadSnapConfig {
    /// Maximum time (seconds) to shift a word start forward to snap to VAD voice onset
    pub max_leading_pad_sec: f64,
    /// Maximum time (seconds) to shift a word end backward to snap to VAD voice offset
    pub max_trailing_pad_sec: f64,
    /// Minimum gap (seconds) to enforce between adjacent words to prevent overlap
    pub min_word_gap_sec: f64,
}

impl Default for VadSnapConfig {
    fn default() -> Self {
        Self {
            max_leading_pad_sec: 0.2,   // 200ms max forward shift for word starts
            max_trailing_pad_sec: 0.5,  // 500ms max backward shift for word ends
            min_word_gap_sec: 0.0,      // No minimum gap by default (allow touching)
        }
    }
}

/// Snap word timestamps to VAD-detected speech boundaries.
///
/// This corrects two common Whisper failure modes:
/// 1. **Leading edge drift**: Word starts placed in pre-speech silence
/// 2. **Trailing overhang**: Word/segment ends extending into post-speech silence
///
/// Also enforces non-overlapping word boundaries for high-WPM speech.
pub fn snap_timestamps_to_vad(
    segments: &mut [Segment],
    vad_intervals: &[(f64, f64)], // (start, end) of detected speech regions
    config: &VadSnapConfig,
) -> Result<()> {
    if vad_intervals.is_empty() {
        return Ok(());
    }

    // Sort VAD intervals by start time (should already be sorted, but be safe)
    let mut sorted_vad = vad_intervals.to_vec();
    sorted_vad.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

    for segment in segments.iter_mut() {
        let Some(words) = segment.words.as_mut() else {
            continue;
        };
        if words.is_empty() {
            continue;
        }

        // Process each word
        for word in words.iter_mut() {
            // Find the VAD interval that overlaps or is closest to this word
            let mut best_vad: Option<&(f64, f64)> = None;
            let mut best_distance = f64::INFINITY;

            for vad in &sorted_vad {
                let vad_start = vad.0;
                let vad_end = vad.1;

                // Check if word overlaps with this VAD interval
                let overlaps = word.start < vad_end && word.end > vad_start;

                if overlaps {
                    best_vad = Some(vad);
                    break;
                }

                // Track closest VAD interval for words in silence gaps
                let distance = if word.end <= vad_start {
                    vad_start - word.end
                } else if word.start >= vad_end {
                    word.start - vad_end
                } else {
                    0.0
                };

                if distance < best_distance {
                    best_distance = distance;
                    best_vad = Some(vad);
                }
            }

            if let Some(&(vad_start, vad_end)) = best_vad {
                // Leading edge correction: snap word.start to VAD voice onset if close
                if word.start < vad_start && (vad_start - word.start) <= config.max_leading_pad_sec {
                    word.start = vad_start;
                }

                // Trailing edge correction: clamp word.end to VAD voice offset
                // Only clamp if overhang EXCEEDS the allowed padding threshold
                if word.end > vad_end && (word.end - vad_end) > config.max_trailing_pad_sec {
                    word.end = vad_end;
                }

                // Ensure word.end >= word.start
                if word.end < word.start {
                    word.end = word.start;
                }
            }
        }

        // Overlap prevention: enforce word[n].end <= word[n+1].start
        for i in 0..words.len().saturating_sub(1) {
            let current_end = words[i].end;
            let next_start = words[i + 1].start;

            if current_end > next_start {
                // Overlap detected - place boundary at midpoint or local minimum
                let boundary = (current_end + next_start) / 2.0;
                words[i].end = boundary;
                words[i + 1].start = boundary.max(words[i + 1].start); // ensure non-decreasing
            }

            // Enforce minimum gap if configured
            if config.min_word_gap_sec > 0.0 {
                let gap = words[i + 1].start - words[i].end;
                if gap < config.min_word_gap_sec {
                    // Distribute the gap adjustment
                    let adjustment = (config.min_word_gap_sec - gap) / 2.0;
                    words[i].end -= adjustment.min(words[i].end - words[i].start);
                    words[i + 1].start += adjustment;
                }
            }
        }

        // Recalculate segment bounds from clamped words
        if let (Some(first), Some(last)) = (words.first(), words.last()) {
            segment.start = first.start;
            segment.end = last.end;
        }
    }

    // Final pass: ensure segments don't overlap each other
    for i in 0..segments.len().saturating_sub(1) {
        if segments[i].end > segments[i + 1].start {
            let boundary = (segments[i].end + segments[i + 1].start) / 2.0;
            const MIN_WORD_DURATION: f64 = 0.01; // 10ms minimum word duration to prevent zero-duration collapse

            // 1. Adjust preceding segment words (ensure all end <= boundary without dropping any words)
            if let Some(words) = &mut segments[i].words {
                let count = words.len();
                if count > 0 {
                    // Clamp last word to boundary
                    if words[count - 1].end > boundary {
                        words[count - 1].end = boundary;
                        if words[count - 1].start >= boundary {
                            words[count - 1].start = (boundary - MIN_WORD_DURATION).max(0.0);
                        }
                    }

                    // Move backwards through words to ensure sequential start < end ordering
                    for idx in (0..count - 1).rev() {
                        if words[idx].end > words[idx + 1].start {
                            words[idx].end = words[idx + 1].start;
                            if words[idx].start >= words[idx].end {
                                words[idx].start = (words[idx].end - MIN_WORD_DURATION).max(0.0);
                            }
                        }
                    }
                }
            }

            // 2. Adjust succeeding segment words (ensure all start >= boundary without dropping any words)
            if let Some(words) = &mut segments[i + 1].words {
                let count = words.len();
                if count > 0 {
                    // Clamp first word start to boundary
                    if words[0].start < boundary {
                        words[0].start = boundary;
                        if words[0].end <= boundary {
                            words[0].end = boundary + MIN_WORD_DURATION;
                        }
                    }

                    // Move forwards through words to ensure sequential start < end ordering
                    for idx in 1..count {
                        if words[idx].start < words[idx - 1].end {
                            words[idx].start = words[idx - 1].end;
                            if words[idx].end <= words[idx].start {
                                words[idx].end = words[idx].start + MIN_WORD_DURATION;
                            }
                        }
                    }
                }
            }

            // 3. Recalculate true segment boundaries based on adjusted words
            if let Some(words) = &segments[i].words {
                if let (Some(first), Some(last)) = (words.first(), words.last()) {
                    segments[i].start = segments[i].start.min(first.start);
                    segments[i].end = last.end;
                }
            } else {
                segments[i].end = boundary;
            }

            if let Some(words) = &segments[i + 1].words {
                if let (Some(first), Some(last)) = (words.first(), words.last()) {
                    segments[i + 1].start = first.start;
                    segments[i + 1].end = segments[i + 1].end.max(last.end);
                }
            } else {
                segments[i + 1].start = boundary;
            }
        }
    }

    Ok(())
}

/// Extract VAD speech intervals from SpeechSegment list
pub fn extract_vad_intervals(speech_segments: &[crate::types::SpeechSegment]) -> Vec<(f64, f64)> {
    speech_segments
        .iter()
        .map(|s| (s.start, s.end))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Segment, WordTimestamp};

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
            text: words.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" "),
            words: Some(words),
            speaker_id: None,
        }
    }

    #[test]
    fn test_trailing_overhang_truncation() {
        // Word extends 1.5s into silence after VAD end at 5.0s
        let mut segments = vec![make_segment(vec![
            make_word("Hello", 4.0, 5.0),
            make_word("world", 5.0, 6.5), // extends 1.5s past VAD end
        ])];

        let vad_intervals = vec![(4.0, 5.0)]; // Speech only 4.0-5.0
        let config = VadSnapConfig {
            max_trailing_pad_sec: 0.5,
            ..Default::default()
        };

        snap_timestamps_to_vad(&mut segments, &vad_intervals, &config).unwrap();

        // "world" end should be clamped to VAD end (5.0) since overhang (1.5s) > max_pad (0.5s)
        assert_eq!(segments[0].words.as_ref().unwrap()[1].end, 5.0);
    }

    #[test]
    fn test_trailing_overhang_preserved_when_small() {
        // Word extends only 0.3s into silence after VAD end at 5.0s
        let mut segments = vec![make_segment(vec![
            make_word("Hello", 4.0, 5.0),
            make_word("world", 5.0, 5.3), // extends 0.3s past VAD end
        ])];

        let vad_intervals = vec![(4.0, 5.0)];
        let config = VadSnapConfig {
            max_trailing_pad_sec: 0.5,
            ..Default::default()
        };

        snap_timestamps_to_vad(&mut segments, &vad_intervals, &config).unwrap();

        // "world" end should remain at 5.3 since overhang (0.3s) <= max_pad (0.5s)
        assert_eq!(segments[0].words.as_ref().unwrap()[1].end, 5.3);
    }

    #[test]
    fn test_leading_edge_snap() {
        // Word starts 0.15s before VAD onset at 2.0s
        let mut segments = vec![make_segment(vec![
            make_word("Hello", 1.85, 2.5), // starts 0.15s before VAD
        ])];

        let vad_intervals = vec![(2.0, 5.0)];
        let config = VadSnapConfig {
            max_leading_pad_sec: 0.2,
            ..Default::default()
        };

        snap_timestamps_to_vad(&mut segments, &vad_intervals, &config).unwrap();

        // "Hello" start should snap to VAD onset (2.0)
        assert_eq!(segments[0].words.as_ref().unwrap()[0].start, 2.0);
    }

    #[test]
    fn test_leading_edge_not_snapped_when_too_far() {
        // Word starts 0.5s before VAD onset at 2.0s (exceeds 0.2s max)
        let mut segments = vec![make_segment(vec![
            make_word("Hello", 1.5, 2.5),
        ])];

        let vad_intervals = vec![(2.0, 5.0)];
        let config = VadSnapConfig {
            max_leading_pad_sec: 0.2,
            ..Default::default()
        };

        snap_timestamps_to_vad(&mut segments, &vad_intervals, &config).unwrap();

        // "Hello" start should remain at 1.5 (too far to snap)
        assert_eq!(segments[0].words.as_ref().unwrap()[0].start, 1.5);
    }

    #[test]
    fn test_overlap_prevention() {
        // Two words with overlapping timestamps (common in high-WPM speech)
        let mut segments = vec![make_segment(vec![
            make_word("Hello", 1.0, 1.8), // ends at 1.8
            make_word("world", 1.5, 2.2), // starts at 1.5 (overlap!)
        ])];

        let vad_intervals = vec![(1.0, 3.0)];
        let config = VadSnapConfig::default();

        snap_timestamps_to_vad(&mut segments, &vad_intervals, &config).unwrap();

        let words = segments[0].words.as_ref().unwrap();
        // Boundary should be at midpoint: (1.8 + 1.5) / 2 = 1.65
        assert!((words[0].end - 1.65).abs() < 0.001);
        assert!((words[1].start - 1.65).abs() < 0.001);
        assert!(words[0].end <= words[1].start);
    }

    #[test]
    fn test_segment_bounds_recalculated() {
        let mut segments = vec![make_segment(vec![
            make_word("Hello", 1.0, 2.0),
            make_word("world", 2.0, 3.5), // extends past VAD
        ])];

        let vad_intervals = vec![(1.0, 3.0)];
        let config = VadSnapConfig {
            max_trailing_pad_sec: 0.5,
            ..Default::default()
        };

        snap_timestamps_to_vad(&mut segments, &vad_intervals, &config).unwrap();

        // Segment end should be updated to last word's clamped end
        assert_eq!(segments[0].end, 3.0);
    }

    #[test]
    fn test_multiple_vad_intervals() {
        // Two separate speech regions with silence between
        let mut segments = vec![
            make_segment(vec![make_word("Hello", 1.0, 2.5)]), // extends into silence
            make_segment(vec![make_word("world", 4.5, 5.0)]), // starts before VAD
        ];

        let vad_intervals = vec![(1.0, 2.0), (5.0, 6.0)];
        let config = VadSnapConfig {
            max_trailing_pad_sec: 0.5,
            max_leading_pad_sec: 0.2,
            ..Default::default()
        };

        snap_timestamps_to_vad(&mut segments, &vad_intervals, &config).unwrap();

        // First segment: "Hello" end clamped to 2.0 (VAD end)
        assert_eq!(segments[0].words.as_ref().unwrap()[0].end, 2.0);
        assert_eq!(segments[0].end, 2.0);

        // Second segment: "world" start snapped to 5.0 (VAD start)
        assert_eq!(segments[1].words.as_ref().unwrap()[0].start, 5.0);
        assert_eq!(segments[1].start, 5.0);
    }

    #[test]
    fn test_empty_vad_intervals_noop() {
        let mut segments = vec![make_segment(vec![
            make_word("Hello", 1.0, 2.0),
        ])];

        let vad_intervals = vec![];
        let config = VadSnapConfig::default();

        snap_timestamps_to_vad(&mut segments, &vad_intervals, &config).unwrap();

        // Should be unchanged
        assert_eq!(segments[0].words.as_ref().unwrap()[0].start, 1.0);
        assert_eq!(segments[0].words.as_ref().unwrap()[0].end, 2.0);
    }

    #[test]
    fn test_segment_overlap_prevention() {
        let mut segments = vec![
            make_segment(vec![make_word("Hello", 1.0, 3.0)]), // ends at 3.0
            make_segment(vec![make_word("world", 2.5, 4.0)]), // starts at 2.5 (overlap!)
        ];

        let vad_intervals = vec![(1.0, 4.0)];
        let config = VadSnapConfig::default();

        snap_timestamps_to_vad(&mut segments, &vad_intervals, &config).unwrap();

        // Boundary should be at midpoint: (3.0 + 2.5) / 2 = 2.75
        assert!((segments[0].end - 2.75).abs() < 0.001);
        assert!((segments[1].start - 2.75).abs() < 0.001);
        assert!(segments[0].end <= segments[1].start);

        // Word timestamps should also be clamped to the new boundaries
        let words0 = segments[0].words.as_ref().unwrap();
        let words1 = segments[1].words.as_ref().unwrap();
        assert_eq!(words0.len(), 1, "first segment should preserve its word");
        assert_eq!(words1.len(), 1, "second segment should preserve its word");
        assert_eq!(words0[0].end, 2.75); // "Hello" end clamped to boundary
        assert_eq!(words1[0].start, 2.75); // "world" start clamped to boundary
        assert!(words0[0].end > words0[0].start);
        assert!(words1[0].end > words1[0].start);
    }

    #[test]
    fn test_segment_overlap_with_multiple_words() {
        // Two segments with multiple words overlapping
        let mut segments = vec![
            make_segment(vec![
                make_word("Hello", 1.0, 2.0),
                make_word(" there", 2.0, 3.5), // extends past next segment start
            ]),
            make_segment(vec![
                make_word("world", 2.5, 3.5),
                make_word("!", 3.5, 4.0),
            ]),
        ];

        let vad_intervals = vec![(1.0, 4.0)];
        let config = VadSnapConfig::default();

        snap_timestamps_to_vad(&mut segments, &vad_intervals, &config).unwrap();

        // Boundary should be at midpoint: (3.5 + 2.5) / 2 = 3.0
        assert!((segments[0].end - 3.0).abs() < 0.001);
        assert!((segments[1].start - 3.0).abs() < 0.001);

        // All words in first segment should have end <= 3.0 (with minimum duration preserved)
        let words0 = segments[0].words.as_ref().unwrap();
        assert_eq!(words0.len(), 2, "first segment should preserve both words");
        for word in words0 {
            assert!(word.end <= 3.0, "word end {} should be <= 3.0", word.end);
            assert!(word.end > word.start, "word '{}' has zero/negative duration", word.text);
        }

        // All words in second segment should have start >= 3.0 (with minimum duration preserved)
        let words1 = segments[1].words.as_ref().unwrap();
        assert_eq!(words1.len(), 2, "second segment should preserve both words");
        for word in words1 {
            assert!(word.start >= 3.0, "word start {} should be >= 3.0", word.start);
            assert!(word.end > word.start, "word '{}' has zero/negative duration", word.text);
        }
    }

    #[test]
    fn test_segment_overlap_preserves_all_words() {
        // Test that ALL words are preserved when segments overlap,
        // with timestamps adjusted to maintain non-zero duration
        let mut segments = vec![
            make_segment(vec![
                make_word("Hello", 1.0, 2.0),
                make_word(" world", 2.0, 3.5), // crosses boundary at 3.0
                make_word(" extra", 3.5, 4.0), // entirely past boundary
            ]),
            make_segment(vec![
                make_word(" prev", 2.5, 3.5),  // crosses boundary at 3.0
                make_word(" there", 3.0, 3.5), // entirely before boundary
                make_word("!", 3.5, 4.0),
            ]),
        ];

        let vad_intervals = vec![(1.0, 4.0)];
        let config = VadSnapConfig::default();

        snap_timestamps_to_vad(&mut segments, &vad_intervals, &config).unwrap();

        // Boundary should be at midpoint: (3.5 + 2.5) / 2 = 3.0
        assert!((segments[0].end - 3.0).abs() < 0.001);
        assert!((segments[1].start - 3.0).abs() < 0.001);

        // All 3 words in first segment should be preserved
        let words0 = segments[0].words.as_ref().unwrap();
        assert_eq!(words0.len(), 3, "first segment should preserve all 3 words");
        assert_eq!(words0[0].text, "Hello");
        assert_eq!(words0[1].text, " world");
        assert_eq!(words0[2].text, " extra");

        // " world" end should be trimmed to boundary (3.0)
        assert!((words0[1].end - 3.0).abs() < 0.001);
        assert!(words0[1].start < 3.0);

        // " extra" should be moved to end at boundary with minimum duration
        assert!(words0[2].end <= 3.0);
        assert!(words0[2].end > words0[2].start);

        // All 3 words in second segment should be preserved
        let words1 = segments[1].words.as_ref().unwrap();
        assert_eq!(words1.len(), 3, "second segment should preserve all 3 words");
        assert_eq!(words1[0].text, " prev");
        assert_eq!(words1[1].text, " there");
        assert_eq!(words1[2].text, "!");

        // " prev" start should be trimmed to boundary (3.0)
        assert!((words1[0].start - 3.0).abs() < 0.001);
        assert!(words1[0].end > 3.0);

        // " there" should start at or after boundary
        assert!(words1[1].start >= 3.0);
        assert!(words1[1].end > words1[1].start);

        // Verify no zero-duration words
        for word in words0.iter().chain(words1.iter()) {
            assert!(word.end > word.start, "word '{}' has zero/negative duration: [{}, {}]", word.text, word.start, word.end);
            assert!(word.end - word.start >= 0.009, "word '{}' duration too small: {}", word.text, word.end - word.start);
        }
    }

    #[test]
    fn test_word_without_vad_overlap_uses_closest() {
        // Word in silence between two VAD regions
        let mut segments = vec![make_segment(vec![
            make_word("um", 3.0, 3.5), // in silence between VAD regions
        ])];

        let vad_intervals = vec![(1.0, 2.0), (4.0, 5.0)];
        let config = VadSnapConfig::default();

        snap_timestamps_to_vad(&mut segments, &vad_intervals, &config).unwrap();

        // Word should be associated with closest VAD (4.0-5.0, distance 0.5 vs 1.0)
        // But since it doesn't overlap and is outside max_pad, it should be unchanged
        assert_eq!(segments[0].words.as_ref().unwrap()[0].start, 3.0);
        assert_eq!(segments[0].words.as_ref().unwrap()[0].end, 3.5);
    }
}