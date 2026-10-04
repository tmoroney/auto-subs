//! report: read one or more bench results.jsonl files and print a markdown
//! table per model, one row per (engine, decode, dtw) config.
//!
//! Columns: load_ms, total transcribe s, x-realtime (total audio / total
//! transcribe time), peak RSS MB, "WER vs AutoSubs today" (vs the
//! wcpp/beam5/dtw transcript of the same file+model), "WER vs reference"
//! (vs <audio>.txt when it exists). WER is pooled: total edits / total
//! reference words.

use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};

#[derive(serde::Deserialize)]
struct Row {
    engine: String,
    model: String,
    decode: String,
    dtw: serde_json::Value,
    file: String,
    audio_s: f64,
    load_ms: f64,
    transcribe_ms: f64,
    peak_rss_mb: f64,
    text: String,
}

/// Normalization for WER, matching the bench scorer exactly:
/// lowercase; replace ’ with '; replace every char that is not alphanumeric
/// (Unicode), an apostrophe or whitespace with a space; split on whitespace;
/// strip leading/trailing apostrophes per token; drop empty tokens.
fn normalize(text: &str) -> Vec<String> {
    let lower = text.to_lowercase().replace('\u{2019}', "'");
    let cleaned: String = lower
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '\'' || c.is_whitespace() {
                c
            } else {
                ' '
            }
        })
        .collect();
    cleaned
        .split_whitespace()
        .map(|t| t.trim_matches('\'').to_string())
        .filter(|t| !t.is_empty())
        .collect()
}

fn edit_distance(a: &[String], b: &[String]) -> usize {
    // word-level Levenshtein, memory-light two-row DP
    let (n, m) = (a.len(), b.len());
    let mut prev: Vec<usize> = (0..=m).collect();
    let mut cur = vec![0usize; m + 1];
    for i in 1..=n {
        cur[0] = i;
        for j in 1..=m {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[m]
}

fn wer_pooled(refs: &[Vec<String>], hyps: &[Vec<String>]) -> Option<f64> {
    let mut edits = 0usize;
    let mut words = 0usize;
    for (r, h) in refs.iter().zip(hyps.iter()) {
        edits += edit_distance(r, h);
        words += r.len();
    }
    if words == 0 {
        None
    } else {
        Some(edits as f64 / words as f64)
    }
}

/// "<path>.<ext>" -> "<path>.txt"
fn reference_path(file: &str) -> PathBuf {
    let p = Path::new(file);
    p.with_extension("txt")
}

fn dtw_key(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Bool(b) => b.to_string(),
        _ => "n/a".to_string(),
    }
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() {
        eprintln!("usage: report <results.jsonl> [more.jsonl ...]");
        std::process::exit(2);
    }
    let mut rows: Vec<Row> = Vec::new();
    for path in &args {
        let content = std::fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("cannot read {path}: {e}"));
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            rows.push(serde_json::from_str(line).unwrap_or_else(|e| {
                panic!("{path}: bad json line: {e}: {line}")
            }));
        }
    }

    // Group by model, preserving first-seen order.
    let mut models: Vec<String> = Vec::new();
    let mut by_model: HashMap<String, Vec<&Row>> = HashMap::new();
    for r in &rows {
        by_model.entry(r.model.clone()).or_default().push(r);
        if !models.contains(&r.model) {
            models.push(r.model.clone());
        }
    }

    for model in &models {
        let rows = &by_model[model];

        // Baseline: wcpp/beam5/dtw transcript per file ("AutoSubs today").
        let baseline: HashMap<&str, &str> = rows
            .iter()
            .filter(|r| {
                r.engine == "wcpp" && r.decode == "beam5" && dtw_key(&r.dtw) == "true"
            })
            .map(|r| (r.file.as_str(), r.text.as_str()))
            .collect();

        // Configs = (engine, decode, dtw), preserving first-seen order.
        let mut cfgs: Vec<(String, String, String)> = Vec::new();
        for r in rows {
            let k = (r.engine.clone(), r.decode.clone(), dtw_key(&r.dtw));
            if !cfgs.contains(&k) {
                cfgs.push(k);
            }
        }

        println!("### model: `{model}`");
        println!();
        println!(
            "| engine | decode | dtw | load_ms | transcribe_s | x realtime | peak RSS MB | WER vs AutoSubs today | WER vs reference |"
        );
        println!("|---|---|---|---|---|---|---|---|---|");
        for (engine, decode, dtw) in &cfgs {
            let rs: Vec<&&Row> = rows
                .iter()
                .filter(|r| r.engine == *engine && r.decode == *decode && dtw_key(&r.dtw) == *dtw)
                .collect();
            let load_ms = rs.first().map(|r| r.load_ms).unwrap_or(f64::NAN);
            let t_s: f64 = rs.iter().map(|r| r.transcribe_ms).sum::<f64>() / 1000.0;
            let a_s: f64 = rs.iter().map(|r| r.audio_s).sum();
            let x_rt = a_s / t_s;
            let rss = rs
                .iter()
                .map(|r| r.peak_rss_mb)
                .fold(f64::NAN, f64::max);

            // WER vs AutoSubs today (wcpp/beam5/dtw baseline).
            let wer_vs_baseline = {
                let mut refs = Vec::new();
                let mut hyps = Vec::new();
                for r in &rs {
                    if let Some(base) = baseline.get(r.file.as_str()) {
                        refs.push(normalize(base));
                        hyps.push(normalize(&r.text));
                    }
                }
                if refs.is_empty() {
                    "—".to_string()
                } else {
                    match wer_pooled(&refs, &hyps) {
                        Some(w) => format!("{w:.4}"),
                        None => "—".to_string(),
                    }
                }
            };

            // WER vs reference <audio>.txt files.
            let wer_vs_ref = {
                let mut refs = Vec::new();
                let mut hyps = Vec::new();
                for r in &rs {
                    let ref_path = reference_path(&r.file);
                    if ref_path.exists() {
                        if let Ok(t) = std::fs::read_to_string(&ref_path) {
                            refs.push(normalize(&t));
                            hyps.push(normalize(&r.text));
                        }
                    }
                }
                if refs.is_empty() {
                    "—".to_string()
                } else {
                    match wer_pooled(&refs, &hyps) {
                        Some(w) => format!("{w:.4}"),
                        None => "—".to_string(),
                    }
                }
            };

            println!(
                "| {engine} | {decode} | {dtw} | {load_ms:.0} | {t_s:.1} | {x_rt:.2} | {rss:.0} | {wer_vs_baseline} | {wer_vs_ref} |"
            );
        }
        println!();
    }
}
