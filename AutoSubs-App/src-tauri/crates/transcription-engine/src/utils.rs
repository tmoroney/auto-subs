/// Estimate a safe DTW working-set size (in bytes) for whisper.cpp DTW.
/// Pass the result to `DtwParameters { dtw_mem_size, .. }`.
pub fn calculate_dtw_mem_size(num_samples: usize) -> usize {
    // Frame geometry at 16 kHz: 10 ms per frame → 160 samples per frame
    const FRAME_SAMPLES: usize = 160;
    let num_frames = (num_samples + FRAME_SAMPLES - 1) / FRAME_SAMPLES; // ceil division

    // Memory model bits
    const BYTES_F32: usize = 4;
    const BYTES_I32: usize = 4;

    // Rolling buffers + auxiliaries (cost, prev, scratch, etc.)
    // Use 4 lanes to leave headroom on long segments/presets.
    const LANES: usize = 4;

    // Dynamic band: narrow for short audio, wider for long audio.
    // Keeps quality while bounding memory.
    let band_frames = match num_frames {
        0..=15_000 => 96,    // ≤150 s
        15_001..=45_000 => 128, // 150–450 s
        _ => 160,            // >450 s
    };

    // Core DP working set (float costs) plus an int32 backtrack-ish buffer
    let dp_bytes = num_frames
        .saturating_mul(band_frames)
        .saturating_mul(LANES)
        .saturating_mul(BYTES_F32);

    let bt_bytes = num_frames
        .saturating_mul(BYTES_I32); // rough backtrack/indices budget

    // Fixed baseline for internal scratch
    const BASELINE_MB: usize = 24;
    let base_bytes = BASELINE_MB * 1024 * 1024;

    // Total and clamps
    let total = base_bytes
        .saturating_add(dp_bytes)
        .saturating_add(bt_bytes);

    let min_bytes = 24 * 1024 * 1024;   // 24 MB floor
    let max_bytes = 768 * 1024 * 1024;  // 768 MB ceiling
    let clamped = total.clamp(min_bytes, max_bytes);

    // Align up to 8 MB so we never round *down* below requirement
    const ALIGN: usize = 8 * 1024 * 1024;
    (clamped + (ALIGN - 1)) & !(ALIGN - 1)
}

pub fn round_to_places(value: f64, places: i32) -> f64 {
    let factor = 10f64.powi(places);
    (value * factor).round() / factor
}

// Convert centiseconds to seconds (1 centisecond = 10ms)
pub fn cs_to_s(cs: i64) -> f64 {
    cs as f64 * 0.01
}

/// Split a speech segment into chunks no longer than `max_seconds` (at 16 kHz),
/// preserving absolute timing and speaker id. Used by ONNX backends that process
/// a whole clip per call (Moonshine, SenseVoice, Canary, Cohere) to bound memory.
pub fn split_speech_segment(
    seg: &crate::types::SpeechSegment,
    max_seconds: f64,
) -> Vec<crate::types::SpeechSegment> {
    const SAMPLE_RATE: usize = 16000;
    let max_samples = (max_seconds * SAMPLE_RATE as f64) as usize;
    if max_samples == 0 || seg.samples.len() <= max_samples {
        return vec![seg.clone()];
    }

    let mut out = Vec::new();
    let mut idx = 0usize;
    while idx < seg.samples.len() {
        let end_idx = (idx + max_samples).min(seg.samples.len());
        let start_s = idx as f64 / SAMPLE_RATE as f64;
        let end_s = end_idx as f64 / SAMPLE_RATE as f64;
        out.push(crate::types::SpeechSegment {
            start: seg.start + start_s,
            end: seg.start + end_s,
            samples: seg.samples[idx..end_idx].to_vec(),
            speaker_id: seg.speaker_id.clone(),
        });
        idx = end_idx;
    }
    out
}

/// Generate approximate per-word timestamps by interpolating across [start, end]
/// proportional to word lengths. Used when real word-level timestamps are unavailable
/// (e.g. translation output, Moonshine).
pub fn interpolate_word_timestamps(line: &str, start: f64, end: f64) -> Vec<crate::types::WordTimestamp> {
    let dur = (end - start).max(0.0);
    if dur <= 0.0 { return Vec::new(); }

    let tokens: Vec<&str> = line
        .split_whitespace()
        .filter(|t| !t.trim_matches('\0').trim().is_empty())
        .collect();
    if tokens.is_empty() { return Vec::new(); }

    let weights: Vec<usize> = tokens
        .iter()
        .map(|t| t.chars().filter(|c| c.is_alphanumeric()).count().max(1))
        .collect();
    let total_w: usize = weights.iter().sum();
    if total_w == 0 { return Vec::new(); }

    let mut out = Vec::with_capacity(tokens.len());
    let mut acc = 0usize;
    for (i, tok) in tokens.iter().enumerate() {
        let t0 = start + (acc as f64 / total_w as f64) * dur;
        let t1 = if i + 1 == tokens.len() {
            end
        } else {
            start + ((acc + weights[i]) as f64 / total_w as f64) * dur
        };
        acc += weights[i];
        // Prefix non-first words with a space so formatting.rs can detect word boundaries
        let text = if i == 0 { (*tok).to_string() } else { format!(" {}", tok) };
        out.push(crate::types::WordTimestamp { text, start: t0, end: t1, probability: None });
    }
    out
}

/// Clamp the previous segment (and its last word) so it doesn't overlap the
/// new segment's start, then push. Mirrors the logic duplicated across engines.
pub fn push_segment_clamped(
    segments: &mut Vec<crate::types::Segment>,
    seg: crate::types::Segment,
) {
    if let Some(last) = segments.last_mut() {
        if last.end > seg.start { last.end = seg.start; }
        if let Some(words) = &mut last.words {
            if let Some(lw) = words.last_mut() {
                if lw.end > last.end { lw.end = last.end; }
            }
        }
    }
    segments.push(seg);
}

/// List of supported target language codes for Google Translate (unofficial endpoint).
pub fn get_translate_languages() -> Vec<&'static str> {
    vec![
        "af", "sq", "am", "ar", "hy", "az", "eu", "be", "bn", "bs", "bg", "ca", "ceb", "ny", "zh", "zh-TW",
        "co", "hr", "cs", "da", "nl", "en", "eo", "et", "tl", "fi", "fr", "fy", "gl", "ka", "de", "el", "gu",
        "ht", "ha", "haw", "he", "hi", "hmn", "hu", "is", "ig", "id", "ga", "it", "ja", "jv", "kn", "kk", "km",
        "rw", "ko", "ku", "ky", "lo", "la", "lv", "lt", "lb", "mk", "mg", "ms", "ml", "mt", "mi", "mr", "mn",
        "my", "ne", "no", "or", "ps", "fa", "pl", "pt", "pa", "ro", "ru", "sm", "gd", "sr", "st", "sn", "sd",
        "si", "sk", "sl", "so", "es", "su", "sw", "sv", "tg", "ta", "te", "th", "tr", "uk", "ur", "ug", "uz",
        "vi", "cy", "xh", "yi", "yo", "zu",
    ]
}

/// List of Whisper-supported language codes (including "auto").
pub fn get_whisper_languages() -> Vec<&'static str> {
    vec![
        // Auto detection
        "auto",
        // Core set
        "en", "zh", "de", "es", "ru", "ko", "fr", "ja", "pt", "tr", "pl", "ca", "nl", "ar", "sv", "it", "id",
        "hi", "fi", "vi", "he", "uk", "el", "ms", "cs", "ro", "da", "hu", "ta", "no", "th", "ur", "hr", "bg",
        "lt", "la", "mi", "ml", "cy", "sk", "te", "fa", "lv", "bn", "sr", "az", "sl", "kn", "et", "mk", "br",
        "eu", "is", "hy", "ne", "mn", "bs", "kk", "sq", "sw", "gl", "mr", "pa", "si", "km", "sn", "yo", "so",
        "af", "oc", "ka", "be", "tg", "sd", "gu", "am", "yi", "lo", "uz", "fo", "ht", "ps", "tk", "nn", "mt",
        "sa", "lb", "my", "bo", "tl", "mg", "as", "tt", "haw", "ln", "ha", "ba", "jw", "su", "yue",
    ]
}