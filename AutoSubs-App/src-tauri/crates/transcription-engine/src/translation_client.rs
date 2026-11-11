use eyre::{eyre, Result};
use reqwest;
use serde_json::Value;
use crate::types::{Segment, WordTimestamp};
use futures::stream::{self, StreamExt};
use tokio::time::{sleep, Duration};

/// Raised when a segment failed after all retries on a retryable cause
/// (429, 5xx, or a transport error). Distinct from a definitive per-request
/// error so translate_batch can tell a service outage from a lone bad segment.
#[derive(Debug)]
struct ServiceUnavailable(String);

impl std::fmt::Display for ServiceUnavailable {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for ServiceUnavailable {}

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

const TRANSLATE_URL: &str = "https://translate.googleapis.com/translate_a/single";
const MAX_RETRIES: u32 = 5;

/// Translates text from one language to another.
pub async fn translate_text(text: &str, from: &str, to: &str) -> Result<String> {
    let client = http_client();
    translate_text_with_client(&client, TRANSLATE_URL, text, from, to, MAX_RETRIES).await
}

/// reqwest has no timeout by default, so a connection that stalls instead of
/// failing would hang the run with no error. A timeout surfaces as a
/// retryable error and goes through the normal backoff.
fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

fn backoff(attempt: u32) -> Duration {
    // 500ms, 1s, 2s, 4s, 8s, plus jitter from wall-clock nanos so concurrent
    // workers don't retry in lockstep after a 429.
    let jitter = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64 % 400)
        .unwrap_or(0);
    Duration::from_millis((500u64 << attempt).min(8000) + jitter)
}

async fn translate_text_with_client(
    client: &reqwest::Client,
    url: &str,
    text: &str,
    from: &str,
    to: &str,
    max_retries: u32,
) -> Result<String> {
    let sl = normalize_google_lang(from, false);
    let tl = normalize_google_lang(to, true);

    let mut attempt = 0u32;
    loop {
        let resp_result = client
            .get(url)
            .query(&[("client", "gtx"), ("sl", sl.as_str()), ("tl", tl.as_str()), ("dt", "t"), ("q", text)])
            .send()
            .await;

        // Every arm either returns or yields a retryable cause. A body that
        // times out after a 200 is the same outage as a failed connect.
        let retryable_err = match resp_result {
            Ok(resp) if resp.status().is_success() => match resp.text().await {
                Ok(body) => {
                    let translated_text: String = serde_json::from_str::<Value>(&body)?[0][0][0]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    return Ok(translated_text);
                }
                Err(e) => format!("reading response: {e}"),
            },
            Ok(resp) if resp.status().as_u16() == 429 || resp.status().is_server_error() => {
                format!("HTTP {}", resp.status())
            }
            Ok(resp) => {
                // Non-retryable status
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(eyre!("translate_text HTTP error {}: {}", status, body));
            }
            Err(e) => e.to_string(),
        };

        if attempt >= max_retries {
            return Err(ServiceUnavailable(format!(
                "translate_text failed after retries: {retryable_err}"
            ))
            .into());
        }
        sleep(backoff(attempt)).await;
        attempt += 1;
    }
}

/// Translate a collection of texts concurrently while preserving order.
///
/// Empty strings are preserved as empty and not sent to the service.
/// The batch errors as soon as any segment exhausted its retries on a
/// service-side cause (429, 5xx, timeout, transport error): the caller then
/// keeps the whole transcription in the source language, which is better than
/// source-language lines mixed in among translated ones under the target
/// language. A segment the API rejects outright keeps its original text, so
/// one unusual line can't cost the user the whole translation.
pub async fn translate_batch(
    texts: Vec<String>,
    from: &str,
    to: &str,
) -> Result<Vec<String>> {
    // Fast path: source and target are the same (and not auto) so no translation needed.
    if from.eq_ignore_ascii_case(to) && !from.eq_ignore_ascii_case("auto") {
        return Ok(texts);
    }

    // One shared client: per-segment `Client::new()` defeats connection reuse,
    // which makes the translate endpoint throttle much sooner.
    let client = http_client();
    translate_each(texts, |text| {
        let client = &client;
        async move { translate_text_with_client(client, TRANSLATE_URL, &text, from, to, MAX_RETRIES).await }
    })
    .await
}

async fn translate_each<F, Fut>(texts: Vec<String>, translate_one: F) -> Result<Vec<String>>
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<String>>,
{
    let n = texts.len();
    let concurrency: usize = 2;
    let mut out: Vec<Option<String>> = vec![None; n];
    let attempted = texts.iter().filter(|t| !t.trim().is_empty()).count();
    let mut failed = 0usize;
    let mut outage_failures = 0usize;
    let mut outage_cause: Option<String> = None;

    let translate_one = &translate_one;
    let mut stream = stream::iter(texts.into_iter().enumerate())
        .map(|(i, txt)| async move {
            if txt.trim().is_empty() {
                (i, txt, Ok(String::new()))
            } else {
                let res = translate_one(txt.clone()).await;
                (i, txt, res)
            }
        })
        .buffer_unordered(concurrency);

    while let Some((i, original, res)) = stream.next().await {
        match res {
            Ok(tr) => out[i] = Some(tr),
            Err(e) => {
                if !original.trim().is_empty() {
                    failed += 1;
                    if e.downcast_ref::<ServiceUnavailable>().is_some() {
                        outage_failures += 1;
                        outage_cause.get_or_insert_with(|| e.to_string());
                    }
                    tracing::warn!("translation failed for segment {}, keeping original text: {}", i, e);
                }
                out[i] = Some(original);
            }
        }
    }

    if outage_failures > 0 {
        return Err(eyre!(
            "translation failed for {} of {} segments in batch; service appears unreachable: {}",
            outage_failures,
            attempted,
            outage_cause.as_deref().unwrap_or("unknown service error")
        ));
    }

    if failed > 0 {
        tracing::warn!("translation: {}/{} segments kept their original text", failed, attempted);
    }

    Ok(out.into_iter().map(|o| o.unwrap_or_default()).collect())
}

/// Regenerate `words` for a segment by splitting text on whitespace
/// and interpolating timestamps uniformly between segment.start and segment.end.
/// Words after the first are prefixed with a space so that the formatting layer
/// can reconstruct the original spacing when rendering.
pub fn regenerate_words_uniform(seg: &mut Segment) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    /// Serves `head` on every connection, then holds the socket open without
    /// sending anything more. Returns the URL and a connection counter.
    async fn stub_server(head: &'static str) -> (String, Arc<AtomicUsize>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/translate", listener.local_addr().unwrap());
        let connections = Arc::new(AtomicUsize::new(0));
        let counter = connections.clone();
        tokio::spawn(async move {
            loop {
                let (mut socket, _) = listener.accept().await.unwrap();
                counter.fetch_add(1, Ordering::SeqCst);
                tokio::spawn(async move {
                    let mut buf = [0u8; 4096];
                    let _ = socket.read(&mut buf).await;
                    let _ = socket.write_all(head.as_bytes()).await;
                    sleep(Duration::from_secs(30)).await;
                });
            }
        });
        (url, connections)
    }

    fn short_timeout_client() -> reqwest::Client {
        reqwest::Client::builder().timeout(Duration::from_millis(300)).build().unwrap()
    }

    #[tokio::test]
    async fn reads_the_translation_from_a_complete_response() {
        let (url, _) = stub_server(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 42\r\n\r\n[[[\"hola\",\"hello\",null,null,1]],null,\"en\"]",
        )
        .await;
        let out = translate_text_with_client(&short_timeout_client(), &url, "hello", "en", "es", 0)
            .await
            .unwrap();
        assert_eq!(out, "hola");
    }

    #[tokio::test]
    async fn a_body_that_stalls_after_200_is_retried_then_reported_as_an_outage() {
        let (url, connections) = stub_server(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n[",
        )
        .await;
        let err = translate_text_with_client(&short_timeout_client(), &url, "hello", "en", "es", 1)
            .await
            .unwrap_err();

        assert!(err.downcast_ref::<ServiceUnavailable>().is_some(), "outage, got: {err}");
        assert!(err.to_string().contains("reading response"), "{err}");
        assert_eq!(connections.load(Ordering::SeqCst), 2, "first try plus one retry");
    }

    fn texts(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[tokio::test]
    async fn one_exhausted_segment_among_successes_fails_the_batch() {
        let err = translate_each(texts(&["a", "b", "c"]), |t| async move {
            if t == "b" {
                Err(ServiceUnavailable("translate_text failed after retries: HTTP 429".into()).into())
            } else {
                Ok(t.to_uppercase())
            }
        })
        .await
        .unwrap_err();

        let msg = err.to_string();
        assert!(msg.contains("1 of 3 segments"), "{msg}");
        assert!(msg.contains("HTTP 429"), "{msg}");
    }

    #[tokio::test]
    async fn a_segment_the_api_rejects_keeps_its_original_text() {
        let out = translate_each(texts(&["a", "b", "c"]), |t| async move {
            if t == "b" {
                Err(eyre!("translate_text HTTP error 400 Bad Request: "))
            } else {
                Ok(t.to_uppercase())
            }
        })
        .await
        .unwrap();

        assert_eq!(out, ["A", "b", "C"]);
    }

    #[tokio::test]
    async fn empty_segments_are_kept_and_never_sent() {
        let sent = Arc::new(AtomicUsize::new(0));
        let counter = sent.clone();
        let out = translate_each(texts(&["a", "  ", ""]), move |t| {
            counter.fetch_add(1, Ordering::SeqCst);
            async move { Ok(t.to_uppercase()) }
        })
        .await
        .unwrap();

        assert_eq!(out, ["A", "", ""]);
        assert_eq!(sent.load(Ordering::SeqCst), 1);
    }
}
