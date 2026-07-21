/// Estimate a safe DTW working-set size (in bytes) for whisper.cpp DTW.
/// Pass the result to `DtwParameters { dtw_mem_size, .. }`.
///
/// The allocation must cover a full Whisper 30-second chunk regardless of the
/// actual clip length, because the native encoder pads short audio to the full
/// 1500 audio-token geometry.
pub fn calculate_dtw_mem_size(model_name: &str) -> usize {
    const CHUNK_SECONDS: usize = 30;
    const CHUNK_FRAMES: usize = CHUNK_SECONDS * 100;
    const N_AUDIO_TOKENS: usize = CHUNK_FRAMES / 2;
    const N_TOKENS: usize = 448;

    let n_audio_tokens = N_AUDIO_TOKENS;
    let n_tokens = N_TOKENS;

    // Alignment-head count per model preset. These are the lengths of the
    // g_aheads_* arrays in whisper.cpp for token-level DTW.
    let n_heads = match model_name {
        "tiny.en" | "tiny" => 8,
        "base.en" | "base" => 8,
        "small.en" => 19,
        "small" => 10,
        "medium.en" => 18,
        "medium" => 6,
        "large-v1" => 9,
        "large-v2" => 23,
        "large-v3" => 10,
        "large-v3-turbo" => 6,
        _ => 24,
    };

    // Main cross-QK tensor (float) and a few same-shape intermediates
    // produced by ggml_norm / ggml_permute / ggml_scale inside DTW.
    let w_bytes = n_tokens
        .saturating_mul(n_audio_tokens)
        .saturating_mul(n_heads)
        .saturating_mul(4);
    let intermediate_bytes = w_bytes.saturating_mul(2);

    // dtw_and_backtrace allocates cost (f32) and trace (i32) matrices of
    // size (n_tokens + 1) * (n_audio_tokens + 1).
    let dtw_matrix_bytes = (n_tokens + 1)
        .saturating_mul(n_audio_tokens + 1)
        .saturating_mul(4 + 4);

    // Graph overhead + small result tensors
    const OVERHEAD_MB: usize = 16;
    let overhead_bytes = OVERHEAD_MB * 1024 * 1024;

    let total = w_bytes
        .saturating_add(intermediate_bytes)
        .saturating_add(dtw_matrix_bytes)
        .saturating_add(overhead_bytes);

    let min_bytes = 32 * 1024 * 1024;  // 32 MB floor
    let max_bytes = 768 * 1024 * 1024; // 768 MB ceiling
    let clamped = total.clamp(min_bytes, max_bytes);

    // Align up to 8 MB so we never round *down* below the requirement
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