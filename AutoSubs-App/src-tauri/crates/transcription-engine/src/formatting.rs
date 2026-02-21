// Subtitle post-processing utilities for Whisper-style outputs (DTW+VAD already applied)
// Focus: natural line breaks, punctuation/pauses-aware grouping, CPL/CPS enforcement,
// word-edge clamping and tiny-word merging.
//
// Input types are provided by the user (WordTimestamp, Segment). We add:
// - PostProcessConfig: knobs for caps and thresholds
// - SubtitleCue: finalized two-line subtitle unit ready for rendering/exports
// - process_segments(): main entrypoint
//
// Notes:
// * We assume segments.words are in chronological order and include basic punctuation as standalone tokens or
//   attached to words (we handle both by extracting trailing punctuation).
// * If you have a frame-level VAD mask, you can plug it into `SilenceOracle` to refine clamping; otherwise we
//   rely on inter-word gaps and simple thresholds.

use serde::{Deserialize, Serialize};
use crate::types::{WordTimestamp, Segment};
use unicode_segmentation::UnicodeSegmentation;

/// Internal working token type used during processing.
#[derive(Clone, Debug)]
struct Tok {
    pub word: String,
    pub punc: String,
    pub start: f64,
    pub end: f64,
    pub prob: Option<f32>,
    pub speaker: Option<String>,
    pub leading_space: bool, // whether original token text began with a space/newline
}

#[inline]
fn round3(x: f64) -> f64 { (x * 1000.0).round() / 1000.0 }

/// User-facing text density control that scales `max_chars_per_line`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextDensity {
    Less,
    Standard,
    More,
}

impl Default for TextDensity {
    fn default() -> Self { Self::Standard }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostProcessConfig {
    /// Max characters per rendered line (CPL)
    pub max_chars_per_line: usize, // e.g., 38
    /// Max lines per subtitle cue (commonly 2)
    pub max_lines: usize,          // e.g., 2
    /// Characters-per-second cap; we’ll split further if exceeded
    pub cps_cap: f64,              // e.g., 17.0
    /// If a pause between words >= this, we consider it a strong split candidate
    pub split_gap_sec: f64,        // e.g., 0.5
    /// Only allow comma-based breaks if the line would exceed this length otherwise
    pub comma_min_chars_before_allow: usize, // e.g., 55
    /// Minimum duration for a single word (merged if below)
    pub min_word_dur: f64,         // e.g., 0.10
    /// Minimum duration per subtitle cue
    pub min_sub_dur: f64,          // e.g., 1.0
    /// Maximum duration per subtitle cue
    pub max_sub_dur: f64,          // e.g., 6.0
    pub insert_interword_space: bool,   // false for CJK
    pub use_grapheme_len: bool,         // true outside ASCII-only
    pub enforce_kinsoku: bool,          // true for JA
    pub allow_comma_split: bool,        // gate comma splitting
}

impl Default for PostProcessConfig {
    fn default() -> Self {
        Self {
            max_chars_per_line: 38,
            max_lines: 1,
            cps_cap: 17.0,
            split_gap_sec: 0.5,
            comma_min_chars_before_allow: 55,
            min_word_dur: 0.10,
            min_sub_dur: 1.0,
            max_sub_dur: 6.0,
            insert_interword_space: true,
            use_grapheme_len: true,
            enforce_kinsoku: false,
            allow_comma_split: true,
        }
    }
}

impl PostProcessConfig {
    /// Build a config from a ScriptProfile preset.
    pub fn with_profile(p: ScriptProfile) -> Self {
        let mut cfg = Self::default();
        apply_profile(&mut cfg, p);
        cfg
    }

    /// Build a config from a language code by inferring the appropriate ScriptProfile.
    pub fn for_language(lang: &str) -> Self {
        Self::with_profile(profile_for_lang(lang))
    }

    /// Scale `max_chars_per_line` by density factor (~0.7 / 1.0 / 1.3).
    pub fn apply_density(&mut self, density: TextDensity) {
        let factor = match density {
            TextDensity::Less => 0.7,
            TextDensity::Standard => 1.0,
            TextDensity::More => 1.3,
        };
        self.max_chars_per_line = ((self.max_chars_per_line as f64) * factor).round() as usize;
    }

    /// Convenience constructors for common profiles
    pub fn latin() -> Self { Self::with_profile(ScriptProfile::Latin) }
    pub fn cjk() -> Self { Self::with_profile(ScriptProfile::CJK) }
    pub fn se_asian_no_space() -> Self { Self::with_profile(ScriptProfile::SEAsianNoSpace) }
    pub fn rtl() -> Self { Self::with_profile(ScriptProfile::RTL) }
    pub fn indic() -> Self { Self::with_profile(ScriptProfile::Indic) }
}

#[derive(Debug, Clone, Copy)]
pub enum ScriptProfile { Latin, CJK, SEAsianNoSpace, RTL, Indic }

pub fn apply_profile(cfg: &mut PostProcessConfig, p: ScriptProfile) {
    match p {
        ScriptProfile::Latin => {
            cfg.max_chars_per_line = 38; // previously 36..=40; pick 38
            cfg.cps_cap = 17.0;
            cfg.insert_interword_space = true;
            cfg.use_grapheme_len = true;
            cfg.enforce_kinsoku = false;
            cfg.allow_comma_split = true;
        }
        ScriptProfile::CJK => {
            cfg.max_chars_per_line = 20; // previously 16..=22; pick 20
            cfg.cps_cap = 11.5;
            cfg.insert_interword_space = false;
            cfg.use_grapheme_len = true;
            cfg.enforce_kinsoku = true; // simple blacklist rules
            cfg.allow_comma_split = true;
        }
        ScriptProfile::SEAsianNoSpace => { // Thai, Khmer, Lao, etc.
            cfg.max_chars_per_line = 22; // previously 18..=26; pick 22
            cfg.cps_cap = 13.0;
            cfg.insert_interword_space = true; // tokens likely presegmented
            cfg.use_grapheme_len = true;
            cfg.enforce_kinsoku = false;
            cfg.allow_comma_split = false;     // commas are rarer
        }
        ScriptProfile::RTL => { // Arabic, Hebrew
            cfg.max_chars_per_line = 28; // previously 24..=32; pick 28
            cfg.cps_cap = 14.0;
            cfg.insert_interword_space = true;
            cfg.use_grapheme_len = true;
            cfg.enforce_kinsoku = false;
            cfg.allow_comma_split = true;
        }
        ScriptProfile::Indic => {
            cfg.max_chars_per_line = 30; // previously 26..=34; pick 30
            cfg.cps_cap = 15.0;
            cfg.insert_interword_space = true;
            cfg.use_grapheme_len = true; // avoid breaking inside conjuncts
            cfg.enforce_kinsoku = false;
            cfg.allow_comma_split = true;
        }
    }
}

pub fn profile_for_lang(lang: &str) -> ScriptProfile {
    match lang {
        // CJK
        "zh" | "zh-CN" | "zh-TW" | "ja" | "ko" => ScriptProfile::CJK,
        // SE Asian no-space
        "th" | "lo" | "km" | "my" => ScriptProfile::SEAsianNoSpace,
        // RTL
        "ar" | "fa" | "ur" | "he" => ScriptProfile::RTL,
        // Indic
        "hi" | "bn" | "ta" | "te" | "ml" | "mr" | "gu" | "pa" | "kn" | "or" | "si" => ScriptProfile::Indic,
        // default
        _ => ScriptProfile::Latin,
    }
}

/// Main entry: post-process whisper segments into readable subtitle cues.
pub fn process_segments(
    segments: &[Segment],
    cfg: &PostProcessConfig,
) -> Vec<Segment> {
    // 1) Collect words from all segments, keep speaker_id continuity.
    let mut all: Vec<(Option<String>, WordTimestamp)> = Vec::new();
    for seg in segments {
        let speaker = seg.speaker_id.clone();
        if let Some(ws) = &seg.words {
            for w in ws {
                all.push((speaker.clone(), w.clone()));
            }
        } else {
            // fallback: treat the whole segment as one word if needed
            if !seg.text.trim().is_empty() {
                all.push((speaker.clone(), WordTimestamp {
                    text: seg.text.clone(), start: seg.start, end: seg.end, probability: None,
                }));
            }
        }
    }
    if all.is_empty() { return Vec::new(); }

    // 2) Normalize tokens: separate trailing punctuation for split logic.

    let mut toks: Vec<Tok> = Vec::with_capacity(all.len());
    for (speaker, w) in all.into_iter() {
        let (core_raw, punc_raw) = split_trailing_punct(&w.text);
        // Capture whether this token originally had a leading space/newline indicator
        let leading_space = core_raw.starts_with(' ') || core_raw.starts_with('\n');
        // Trim those indicators from core so rendering can decide spacing
        let core_trimmed = core_raw.trim_start_matches(|c| c == ' ' || c == '\n');
        let (core, punc) = (core_trimmed, punc_raw);
        // Remove Unicode replacement characters that may appear due to lossy decoding
        let core = core.replace('\u{FFFD}', "");
        let punc = punc.replace('\u{FFFD}', "");
        if core.is_empty() && punc.is_empty() { continue; }
        toks.push(Tok {
            word: core.to_string(),
            punc: punc.to_string(),
            start: w.start,
            end: w.end,
            prob: w.probability,
            speaker,
            leading_space,
        });
    }

    // 3) Merge subword continuation pieces (right token without leading space) into the previous token.
    merge_continuations(&mut toks);

    // 4) Clamp tiny words and adjust boundaries using gaps.
    clamp_and_merge_tiny_words(&mut toks, cfg);

    // 5) Partition into groups by strong punctuation and long gaps.
    let groups = split_into_groups(&toks, cfg);

    // 6) For each group, create 1..N cues respecting CPL/CPS, pauses, commas.
    let mut cues: Vec<Segment> = Vec::new();
    for g in groups {
        let mut i = 0;
        while i < g.len() {
            // Grow a window that respects max duration and CPS; then split into up to max_lines.
            let (j, cue) = build_cue(&g, i, cfg);
            cues.push(cue);
            i = j;
        }
    }

    cues
}

// === Implementation details ===

// Line-split scoring constants (lower score = better split point).
const BONUS_TERMINAL_PUNCT: f64 = 1.0;  // strong: sentence boundary is ideal
const BONUS_COMMA: f64 = 0.4;           // moderate: comma is a natural pause
const BONUS_LONG_GAP: f64 = 0.5;        // moderate: audible pause suggests a break
const COST_FUNCTION_WORD: f64 = 0.3;    // mild: avoid orphaning "the", "a", etc.
const COST_MID_WORD: f64 = 5.0;         // extreme: never break inside a word

#[inline]
fn is_ascii_word(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphabetic() || c == '\'')
}

/// Merge tokens where the right token is a continuation piece (no leading space)
/// and both sides look like ASCII words (Latin). This avoids outputs like
/// "trans" + "human" + "ism" and instead yields "transhumanism".
fn merge_continuations(toks: &mut Vec<Tok>) {
    if toks.is_empty() { return; }
    let mut out: Vec<Tok> = Vec::with_capacity(toks.len());
    for t in std::mem::take(toks).into_iter() {
        if let Some(prev) = out.last_mut() {
            // Case 1: punctuation-only token -> merge into previous token
            if t.word.is_empty() && !t.punc.is_empty() {
                // Append punctuation to previous without adding space
                let merged = join_tokens(prev, &t, /*insert_space*/ false);
                prev.word = merged.0;
                prev.punc = merged.1;
                prev.end = prev.end.max(t.end);
                continue;
            }
            let right_cont = !t.leading_space;
            let both_ascii_word = is_ascii_word(&prev.word) && is_ascii_word(&t.word);
            let no_prev_punc = prev.punc.is_empty();
            // Only merge if the boundary is essentially contiguous (tiny gap)
            let tiny_gap = (t.start - prev.end) <= 0.03;
            if right_cont && both_ascii_word && no_prev_punc && tiny_gap {
                // Merge t into prev without inserting a space
                let merged = join_tokens(prev, &t, /*insert_space*/ false);
                prev.word = merged.0;
                prev.punc = merged.1;
                prev.end = prev.end.max(t.end);
                // leading_space remains from prev (merged.2)
                continue;
            }
        }
        out.push(t);
    }
    *toks = out;
}

fn split_trailing_punct(s: &str) -> (&str, &str) {
    let is_punc = |c: char| matches!(c,
        '.' | '!' | '?' | ',' | ';' | ':' | '…' | '。' | '！' | '？' | '、' | '，' | '—' | '–' | ')' | ']' | '}' | '"'
    );
    // Walk backwards by char to correctly handle multi-byte Unicode punctuation
    let cut = s.char_indices().rev()
        .take_while(|&(_, c)| is_punc(c))
        .last()
        .map(|(idx, _)| idx)
        .unwrap_or(s.len());
    if cut < s.len() { (&s[..cut], &s[cut..]) } else { (s, "") }
}

fn is_terminal_punct(p: &str) -> bool {
    matches!(p, "." | "!" | "?" | "…" | "。" | "！" | "？")
}

fn is_comma_like(p: &str) -> bool { matches!(p, "," | "，" | "、" | ";") }

fn clamp_and_merge_tiny_words(toks: &mut Vec<Tok>, cfg: &PostProcessConfig) {
    if toks.is_empty() { return; }

    // First pass: expand tokens that are shorter than min_word_dur.
    for t in toks.iter_mut() {
        let dur = t.end - t.start;
        if dur < cfg.min_word_dur {
            let grow = (cfg.min_word_dur - dur) / 2.0;
            t.start -= grow;
            t.end += grow;
        }
    }

    // Second pass: resolve overlaps between adjacent tokens.
    // Each boundary is handled exactly once by only looking backward.
    for i in 1..toks.len() {
        if toks[i - 1].end > toks[i].start {
            let mid = 0.5 * (toks[i - 1].end + toks[i].start);
            toks[i - 1].end = mid;
            toks[i].start = mid;
        }
    }

    // Second pass: merge very tiny words with neighbors (prefer next)
    let mut out: Vec<Tok> = Vec::with_capacity(toks.len());
    let mut i = 0;
    while i < toks.len() {
        let dur = toks[i].end - toks[i].start;
        if dur < cfg.min_word_dur && i + 1 < toks.len() {
            // merge i into i+1
            let mut next = toks[i + 1].clone();
            let merged_word = join_tokens(&toks[i], &next, cfg.insert_interword_space);
            next.word = merged_word.0;
            next.punc = merged_word.1;
            next.start = toks[i].start.min(next.start);
            next.leading_space = merged_word.2;
            out.push(next);
            i += 2;
        } else if dur < cfg.min_word_dur && i > 0 {
            // merge into previous
            let mut prev = out.pop().unwrap();
            let merged_word = join_tokens(&prev, &toks[i], cfg.insert_interword_space);
            prev.word = merged_word.0;
            prev.punc = merged_word.1;
            prev.end = prev.end.max(toks[i].end);
            prev.leading_space = merged_word.2;
            out.push(prev);
            i += 1;
        } else {
            out.push(toks[i].clone());
            i += 1;
        }
    }
    *toks = out;
}

fn join_tokens(a: &Tok, b: &Tok, insert_space: bool) -> (String, String, bool) {
    let mut s = String::new();
    if !a.word.is_empty() { s.push_str(&a.word); }
    if !a.punc.is_empty() { s.push_str(&a.punc); }
    if insert_space && b.leading_space && !b.word.is_empty() && !s.ends_with(' ') { s.push(' '); }
    s.push_str(&b.word);
    let p = b.punc.clone();
    // Leading-space flag for merged token should be the first component's flag
    (s, p, a.leading_space)
}

fn split_into_groups(toks: &[Tok], cfg: &PostProcessConfig) -> Vec<Vec<Tok>> {
    let mut groups: Vec<Vec<Tok>> = Vec::new();
    let mut cur: Vec<Tok> = Vec::new();
    for (i, t) in toks.iter().enumerate() {
        cur.push(t.clone());
        let strong_p = is_terminal_punct(t.punc.as_str());
        let long_gap = i + 1 < toks.len() && (toks[i + 1].start - t.end) >= cfg.split_gap_sec;
        if strong_p || long_gap {
            if !cur.is_empty() { groups.push(std::mem::take(&mut cur)); }
        }
    }
    if !cur.is_empty() { groups.push(cur); }
    groups
}

fn build_cue(group: &[Tok], start_idx: usize, cfg: &PostProcessConfig) -> (usize, Segment) {
    // Expand j while respecting max_sub_dur and a soft CPS cap; we’ll further split into lines later.
    let mut j = start_idx + 1;
    loop {
        let w_slice = &group[start_idx..j];
        let (t0, t1, chars) = slice_stats(w_slice, cfg);
        let dur = (t1 - t0).max(0.001);
        let cps = chars as f64 / dur;

        let next_ok = j < group.len()
            && dur < cfg.max_sub_dur
            && (cps <= cfg.cps_cap || (chars as usize) < cfg.max_chars_per_line * cfg.max_lines);
        if next_ok { j += 1; } else { break; }
    }

    let w_slice = &group[start_idx..j];
    let (t0, t1, _chars) = slice_stats(w_slice, cfg);

    // Decide line split(s)
    let lines = split_into_lines(w_slice, cfg);
    let text = lines.join("\n");
    let speaker = w_slice.first().and_then(|t| t.speaker.clone());

    let words: Vec<WordTimestamp> = w_slice
        .iter()
        .map(|t| WordTimestamp {
            text: render_token(t),
            start: round3(t.start),
            end: round3(t.end),
            probability: t.prob,
        })
        .collect();

    let cue = Segment { start: round3(t0.max(0.0)), end: round3(t1), text, words: Some(words), speaker_id: speaker };
    (j, cue)
}

fn render_token(t: &Tok) -> String {
    let mut s = t.word.clone();
    s.push_str(&t.punc);
    s
}

fn slice_stats(slice: &[Tok], cfg: &PostProcessConfig) -> (f64, f64, usize) {
    let t0 = slice.first().map(|t| t.start).unwrap_or(0.0);
    let t1 = slice.last().map(|t| t.end).unwrap_or(t0);
    let chars: usize = slice_chars(slice, cfg);
    (t0, t1, chars)
}

fn split_into_lines(slice: &[Tok], cfg: &PostProcessConfig) -> Vec<String> {
    if slice.is_empty() { return vec![String::new()]; }
    if cfg.max_lines <= 1 { return vec![render_slice(slice, cfg)]; }

    // If total length comfortably fits into one line, don't split.
    let total_chars = slice_chars(slice, cfg);
    if total_chars <= cfg.max_chars_per_line {
        return vec![render_slice(slice, cfg)];
    }

    // Prepare candidate split indices k (between words): 1..slice.len()-1
    let mut cands: Vec<usize> = Vec::new();
    for k in 1..slice.len() {
        let left = &slice[..k];
        let right = &slice[k..];
        // Prefer terminal punctuation on the left
        let left_term = slice[k - 1].punc.as_str();
        let is_term = is_terminal_punct(left_term);
        // Long pause
        let gap = right.first().unwrap().start - left.last().unwrap().end;
        let long_gap = gap >= cfg.split_gap_sec;
        // Comma allowed only if line would be long otherwise
        let comma_ok = is_comma_like(left_term)
            && slice_chars(slice, cfg) >= cfg.comma_min_chars_before_allow;
        // Always include at least a few fallback cands
        if is_term || long_gap || comma_ok || k % 2 == 0 || k == slice.len() / 2 {
            cands.push(k);
        }
    }
    if cands.is_empty() { return vec![render_slice(slice, cfg)]; }

    // Score candidates: lower = better split point.
    //
    // Cost components (all positive, added to score):
    //   - Line length overflow beyond CPL (quadratic)
    //   - Function word at boundary (avoid orphaned "the", "a", etc.)
    //   - Mid-word break (BPE continuation piece)
    //
    // Bonuses (subtracted from score — reward good break points):
    //   - Terminal punctuation (. ! ?)
    //   - Comma / semicolon
    //   - Long pause between words

    let mut best_k = cands[0];
    let mut best_score = f64::INFINITY;
    for &k in &cands {
        let lchars = slice_chars(&slice[..k], cfg);
        let rchars = slice_chars(&slice[k..], cfg);

        // Penalize lines that exceed the character limit
        let len_cost = length_penalty(lchars, cfg.max_chars_per_line)
            + length_penalty(rchars, cfg.max_chars_per_line);

        // Penalize splits that orphan short function words at line edges
        let syntax_cost = syntax_penalty(slice, k);

        // Reward splitting at punctuation or pauses
        let left_punc = slice[k - 1].punc.as_str();
        let gap = slice[k].start - slice[k - 1].end;
        let mut bonus = 0.0;
        if is_terminal_punct(left_punc)   { bonus += BONUS_TERMINAL_PUNCT; }
        if is_comma_like(left_punc)       { bonus += BONUS_COMMA; }
        if gap >= cfg.split_gap_sec       { bonus += BONUS_LONG_GAP; }

        // Never break inside a BPE word (right token has no leading space)
        let mid_word_cost = if !slice[k].leading_space { COST_MID_WORD } else { 0.0 };

        let score = len_cost + syntax_cost + mid_word_cost - bonus;
        if score < best_score { best_score = score; best_k = k; }
    }

    let left = render_slice(&slice[..best_k], cfg);
    let right = render_slice(&slice[best_k..], cfg);

    vec![left, right]
}

fn render_slice(slice: &[Tok], cfg: &PostProcessConfig) -> String {
    let mut s = String::new();
    for (i, t) in slice.iter().enumerate() {
        if cfg.insert_interword_space && t.leading_space && i > 0 { s.push(' '); }
        s.push_str(&t.word);
        s.push_str(&t.punc);
    }
    s
}

fn slice_chars(slice: &[Tok], cfg: &PostProcessConfig) -> usize {
    let core_len: usize = if cfg.use_grapheme_len {
        slice.iter().map(|t| UnicodeSegmentation::graphemes(t.word.as_str(), true).count() + UnicodeSegmentation::graphemes(t.punc.as_str(), true).count()).sum()
    } else {
        slice.iter().map(|t| t.word.len() + t.punc.len()).sum()
    };
    let spaces = if cfg.insert_interword_space { slice.iter().skip(1).filter(|t| t.leading_space).count() } else { 0 };
    core_len + spaces
}

fn length_penalty(chars: usize, cap: usize) -> f64 {
    if chars <= cap { 0.0 } else { let d = (chars - cap) as f64; 0.02 * d * d }
}

/// Penalize splits that orphan short function words at line boundaries.
/// Operates on the token slice directly to avoid rendering strings.
fn syntax_penalty(slice: &[Tok], k: usize) -> f64 {
    const SHORT_FUNCT: &[&str] = &[
        "i", "to", "a", "the", "and", "or", "of", "in", "on", "for", "with", "at",
    ];
    let mut cost = 0.0;
    // Right line starts with a function word
    if let Some(first_right) = slice.get(k) {
        if SHORT_FUNCT.contains(&first_right.word.to_lowercase().as_str()) {
            cost += COST_FUNCTION_WORD;
        }
    }
    // Left line ends with a function word
    if k > 0 {
        if SHORT_FUNCT.contains(&slice[k - 1].word.to_lowercase().as_str()) {
            cost += COST_FUNCTION_WORD;
        }
    }
    cost
}

// --- Example usage (remove or adapt in your app) ---
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_split() {
        let cfg = PostProcessConfig::default();
        let words = vec![
            Tok { word: "I".into(), punc: "".into(), start: 0.00, end: 0.10, prob: None, speaker: None, leading_space: false },
            Tok { word: "think".into(), punc: "".into(), start: 0.10, end: 0.38, prob: None, speaker: None, leading_space: true },
            Tok { word: "I".into(), punc: "".into(), start: 0.50, end: 0.60, prob: None, speaker: None, leading_space: true },
            Tok { word: "would".into(), punc: "".into(), start: 0.60, end: 0.80, prob: None, speaker: None, leading_space: true },
            Tok { word: "like".into(), punc: "".into(), start: 0.80, end: 0.95, prob: None, speaker: None, leading_space: true },
            Tok { word: "to".into(), punc: ".".into(), start: 0.95, end: 1.10, prob: None, speaker: None, leading_space: true },
        ];

        // Build a pseudo segment and run
        let seg = Segment {
            start: 0.0,
            end: 1.1,
            text: String::new(),
            speaker_id: None,
            words: Some(
                words
                    .iter()
                    .map(|t| WordTimestamp {
                        text: format!("{}{}{}", if t.leading_space { " " } else { "" }, t.word, t.punc),
                        start: t.start,
                        end: t.end,
                        probability: None,
                    })
                    .collect(),
            ),
        };
        let cues = process_segments(&[seg], &cfg);
        assert!(!cues.is_empty());
        let text = &cues[0].text;
        let norm = text.split_whitespace().collect::<Vec<_>>().join(" ");
        assert!(norm.contains("I think"));
        assert!(norm.contains("would like to"));
    }
}
