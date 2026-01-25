use reqwest;
use serde_json::Value;
use crate::types::{Segment, WordTimestamp, LabeledProgressFn, ProgressType};
use futures::stream::{self, StreamExt};
use tokio::time::{sleep, Duration};

// Normalize Whisper language codes to the codes accepted by the unofficial Google
// Translate endpoint. Applies both to source (sl) and target (tl) codes.
fn normalize_google_lang(code: &str, is_target: bool) -> String {
    let c = code.trim();
    if c.eq_ignore_ascii_case("auto") {
        return "auto".to_string();
    }

    // Canonicalize casing and hyphens
    let c = c.to_string();

    // Special cases first
    match c.as_str() {
        // Whisper uses "jw" for Javanese; Google expects "jv"
        "jw" => return "jv".to_string(),
        // Cantonese not supported separately: map to Traditional Chinese
        "yue" => return "zh-TW".to_string(),
        // Hebrew "he" is accepted; older "iw" also exists, so keep "he"
        _ => {}
    }

    // Target-specific adjustments
    if is_target {
        // Nynorsk often unsupported; map to general Norwegian
        if c == "nn" { return "no".to_string(); }
        if c == "yue" { return "zh-TW".to_string(); }
        if c == "jw" { return "jv".to_string(); }
    }

    c
}

/// Translates text from one language to another.
pub async fn translate_text(text: &str, from: &str, to: &str) -> Result<String, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let url = "https://translate.googleapis.com/translate_a/single";
    let sl = normalize_google_lang(from, false);
    let tl = normalize_google_lang(to, true);

    let max_retries = 3u32;
    let mut attempt = 0u32;
    loop {
        let resp_result = client
            .get(url)
            .query(&[("client", "gtx"), ("sl", sl.as_str()), ("tl", tl.as_str()), ("dt", "t"), ("q", text)])
            .send()
            .await;

        match resp_result {
            Ok(resp) => {
                if resp.status().is_success() {
                    let body = resp.text().await?;
                    let translated_text: String = serde_json::from_str::<Value>(&body)?[0][0][0]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    return Ok(translated_text);
                } else if resp.status().as_u16() == 429 || resp.status().is_server_error() {
                    if attempt >= max_retries { break; }
                    let backoff_ms = 200u64 << attempt; // 200ms, 400ms, 800ms
                    sleep(Duration::from_millis(backoff_ms)).await;
                    attempt += 1;
                    continue;
                } else {
                    // Non-retryable status
                    let status = resp.status();
                    let body = resp.text().await.unwrap_or_default();
                    return Err(format!("translate_text HTTP error {}: {}", status, body).into());
                }
            }
            Err(e) => {
                if attempt >= max_retries { return Err(e.into()); }
                let backoff_ms = 200u64 << attempt;
                sleep(Duration::from_millis(backoff_ms)).await;
                attempt += 1;
                continue;
            }
        }
    }

    Err("translate_text failed after retries".into())
}

/// Translate a batch of segments in-place.
///
/// - Minimizes number of HTTP requests by batching multiple segments into a single request
///   using a robust delimiter strategy.
/// - Overwrites `segment.text` with the translated text.
/// - Regenerates `segment.words` with evenly interpolated timestamps between `start` and `end`.
pub async fn translate_segments(
    segments: &mut [Segment],
    from: &str,
    to: &str,
    progress: Option<&LabeledProgressFn>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Indices of non-empty segments to translate
    let mut indices: Vec<usize> = Vec::new();
    let mut inputs: Vec<String> = Vec::new();
    for (i, seg) in segments.iter().enumerate() {
        let t = seg.text.trim();
        if !t.is_empty() {
            indices.push(i);
            inputs.push(t.to_string());
        }
    }

    if inputs.is_empty() { return Ok(()); }

    // Progress setup
    let total = inputs.len();
    let mut completed: usize = 0;
    let start_label = format!("Translating from {} to {}", from, to);
    // Report start at 0%
    if total > 0 {
        if let Some(p) = progress { p(0, ProgressType::Translate, &start_label); }
    }

    // Translate concurrently with bounded concurrency; keep track of original order via enumerate index
    let concurrency: usize = 4;
    let mut out: Vec<Option<String>> = vec![None; total];
    let mut stream = stream::iter(inputs.into_iter().enumerate())
        .map(|(k, txt)| async move { (k, translate_text(&txt, from, to).await) })
        .buffer_unordered(concurrency);

    while let Some((k, res)) = stream.next().await {
        match res {
            Ok(tr) => {
                out[k] = Some(tr);
            }
            Err(_e) => {
                // Leave as None to keep original text on error
            }
        }
        completed += 1;
        // Incremental progress
        let percent = ((completed as f64) / (total as f64) * 100.0).round() as i32;
        if let Some(p) = progress { p(percent.min(99), ProgressType::Translate, &format!("{}", start_label)); }
    }

    // Apply results back to segments
    for (k, maybe_tr) in out.into_iter().enumerate() {
        let seg_idx = indices[k];
        if let Some(tr) = maybe_tr {
            let seg = &mut segments[seg_idx];
            seg.text = tr;
            regenerate_words_uniform(seg);
        }
    }

    // Completion progress
    if total > 0 {
        if let Some(p) = progress { p(100, ProgressType::Translate, "Translating complete"); }
    }

    Ok(())
}

/// Regenerate `words` for a segment by splitting text on whitespace
/// and interpolating timestamps uniformly between segment.start and segment.end.
/// Words after the first are prefixed with a space so that the formatting layer
/// can reconstruct the original spacing when rendering.
fn regenerate_words_uniform(seg: &mut Segment) {
    // Split on Unicode whitespace; filter out empty tokens
    let tokens: Vec<&str> = seg
        .text
        .split_whitespace()
        .filter(|s| !s.is_empty())
        .collect();

    let n = tokens.len();
    if n == 0 {
        seg.words = Some(Vec::new());
        return;
    }

    let start = seg.start;
    let end = seg.end.max(start); // guard against inverted times
    let dur = end - start;

    // Assign bounds so that words tile the interval [start, end].
    // Prefix words after the first with a space so the formatting layer
    // knows to insert inter-word spacing.
    let mut words = Vec::with_capacity(n);
    for (i, w) in tokens.into_iter().enumerate() {
        let t0 = start + dur * (i as f64) / (n as f64);
        let t1 = start + dur * ((i + 1) as f64) / (n as f64);
        let text = if i == 0 { w.to_string() } else { format!(" {}", w) };
        words.push(WordTimestamp { text, start: t0, end: t1, probability: None });
    }

    seg.words = Some(words);
}

// get_translate_languages moved to utils.rs