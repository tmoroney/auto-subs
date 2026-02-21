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
    /// Minimum duration for a single word (merged if below)
    pub min_word_dur: f64,         // e.g., 0.10
    /// Minimum duration per subtitle cue
    pub min_sub_dur: f64,          // e.g., 1.0
    /// Maximum duration per subtitle cue
    pub max_sub_dur: f64,          // e.g., 6.0
    pub insert_interword_space: bool,   // false for CJK
    pub use_grapheme_len: bool,         // true outside ASCII-only
    pub enforce_kinsoku: bool,          // true for JA
    /// Language code used for language-aware line breaking (e.g. "en", "fr", "de")
    pub lang: String,
}

impl Default for PostProcessConfig {
    fn default() -> Self {
        Self {
            max_chars_per_line: 38,
            max_lines: 1,
            cps_cap: 17.0,
            split_gap_sec: 0.5,
            min_word_dur: 0.10,
            min_sub_dur: 1.0,
            max_sub_dur: 6.0,
            insert_interword_space: true,
            use_grapheme_len: true,
            enforce_kinsoku: false,
            lang: "en".to_string(),
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
        let mut cfg = Self::with_profile(profile_for_lang(lang));
        cfg.lang = lang.to_string();
        cfg
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
        }
        ScriptProfile::CJK => {
            cfg.max_chars_per_line = 20; // previously 16..=22; pick 20
            cfg.cps_cap = 11.5;
            cfg.insert_interword_space = false;
            cfg.use_grapheme_len = true;
            cfg.enforce_kinsoku = true; // simple blacklist rules
        }
        ScriptProfile::SEAsianNoSpace => { // Thai, Khmer, Lao, etc.
            cfg.max_chars_per_line = 22; // previously 18..=26; pick 22
            cfg.cps_cap = 13.0;
            cfg.insert_interword_space = true; // tokens likely presegmented
            cfg.use_grapheme_len = true;
            cfg.enforce_kinsoku = false;
        }
        ScriptProfile::RTL => { // Arabic, Hebrew
            cfg.max_chars_per_line = 28; // previously 24..=32; pick 28
            cfg.cps_cap = 14.0;
            cfg.insert_interword_space = true;
            cfg.use_grapheme_len = true;
            cfg.enforce_kinsoku = false;
        }
        ScriptProfile::Indic => {
            cfg.max_chars_per_line = 30; // previously 26..=34; pick 30
            cfg.cps_cap = 15.0;
            cfg.insert_interword_space = true;
            cfg.use_grapheme_len = true; // avoid breaking inside conjuncts
            cfg.enforce_kinsoku = false;
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

    // 5) Wrap tokens into lines using greedy line-filling with natural break priorities.
    let lines = wrap_into_lines(&toks, cfg);

    // 6) Bundle consecutive lines into subtitle cues (respecting max_lines and speaker boundaries).
    let mut cues = group_lines_into_cues(lines, cfg);

    // 7) Enforce duration limits and CPS cap.
    enforce_duration_limits(&mut cues, cfg);

    cues
}

// === Implementation details ===

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

fn render_token(t: &Tok) -> String {
    let mut s = String::new();
    if t.leading_space { s.push(' '); }
    s.push_str(&t.word);
    s.push_str(&t.punc);
    s
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

fn tok_chars(t: &Tok, cfg: &PostProcessConfig) -> usize {
    if cfg.use_grapheme_len {
        UnicodeSegmentation::graphemes(t.word.as_str(), true).count()
            + UnicodeSegmentation::graphemes(t.punc.as_str(), true).count()
    } else {
        t.word.len() + t.punc.len()
    }
}

/// Language-aware function-word detection for natural line breaking.
/// Covers conjunctions, prepositions, and other short grammatical words
/// that make good "break before" candidates across major languages.
fn is_function_word(word: &str, lang: &str) -> bool {
    let w = word.to_lowercase();
    match lang {
        "en" => matches!(w.as_str(),
            "and" | "or" | "but" | "so" | "yet" | "nor" |
            "that" | "which" | "because" | "although" | "while" |
            "when" | "where" | "if" | "unless" | "since" | "whether" |
            "to" | "of" | "for" | "in" | "on" | "with" | "at" | "by" | "from"
        ),
        "es" => matches!(w.as_str(),
            "y" | "o" | "pero" | "que" | "porque" | "cuando" | "donde" | "si" |
            "de" | "en" | "con" | "por" | "para" | "a" | "sin" | "sobre"
        ),
        "fr" => matches!(w.as_str(),
            "et" | "ou" | "mais" | "que" | "parce" | "quand" | "si" |
            "de" | "en" | "avec" | "pour" | "dans" | "sur" | "sans"
        ),
        "de" => matches!(w.as_str(),
            "und" | "oder" | "aber" | "dass" | "weil" | "wenn" | "wo" | "ob" |
            "von" | "in" | "mit" | "für" | "an" | "auf" | "aus" | "nach"
        ),
        "pt" => matches!(w.as_str(),
            "e" | "ou" | "mas" | "que" | "porque" | "quando" | "onde" | "se" |
            "de" | "em" | "com" | "por" | "para" | "a" | "sem" | "sobre"
        ),
        "it" => matches!(w.as_str(),
            "e" | "o" | "ma" | "che" | "perché" | "quando" | "dove" | "se" |
            "di" | "in" | "con" | "per" | "da" | "su" | "tra" | "senza"
        ),
        "nl" => matches!(w.as_str(),
            "en" | "of" | "maar" | "dat" | "omdat" | "wanneer" | "waar" | "als" |
            "van" | "in" | "met" | "voor" | "aan" | "op" | "uit" | "naar"
        ),
        // CJK, Arabic, Thai, etc. rely on commas + pauses (which is correct for those scripts)
        _ => false,
    }
}

/// Walk all tokens, filling each line up to `max_chars_per_line`.
/// Proactively breaks at natural points (conjunctions, prepositions, commas)
/// when the line is sufficiently full, to avoid orphan lines.
/// Also force line breaks on speaker change and after terminal punctuation.
fn wrap_into_lines(toks: &[Tok], cfg: &PostProcessConfig) -> Vec<Vec<Tok>> {
    if toks.is_empty() { return Vec::new(); }

    let mut lines: Vec<Vec<Tok>> = Vec::new();
    let mut cur: Vec<Tok> = Vec::new();
    let mut cur_chars: usize = 0;

    // Threshold for proactive breaking: break at natural points when line is this full.
    let proactive_threshold = (cfg.max_chars_per_line as f64 * 0.65) as usize;

    for tok in toks.iter() {
        let tc = tok_chars(tok, cfg);

        // Force line break on speaker change
        if !cur.is_empty() {
            let speaker_change = cur.last().unwrap().speaker != tok.speaker;
            if speaker_change {
                lines.push(std::mem::take(&mut cur));
                cur_chars = 0;
            }
        }

        // Force line break after terminal punctuation on previous token
        if !cur.is_empty() && is_terminal_punct(&cur.last().unwrap().punc) {
            lines.push(std::mem::take(&mut cur));
            cur_chars = 0;
        }

        // Proactive break: if line is sufficiently full and we're at a natural break point.
        // Uses language-universal signals (commas, pauses) plus language-aware function words.
        if cur_chars >= proactive_threshold && !cur.is_empty() {
            let prev = cur.last().unwrap();
            let break_after_comma = is_comma_like(&prev.punc);
            let break_before_function_word = is_function_word(&tok.word, &cfg.lang);
            // Pauses are a universal phrase-boundary signal across all languages.
            // Use a softer threshold (half of split_gap_sec) for proactive breaks.
            let pause = (tok.start - prev.end) >= cfg.split_gap_sec * 0.5;

            if break_after_comma || break_before_function_word || pause {
                lines.push(std::mem::take(&mut cur));
                cur_chars = 0;
            }
        }

        // Would adding this token overflow the line?
        let space_cost = if cfg.insert_interword_space && tok.leading_space && !cur.is_empty() { 1 } else { 0 };
        let new_len = cur_chars + space_cost + tc;

        if new_len > cfg.max_chars_per_line && !cur.is_empty() {
            // Find the best break point within the current line
            let mut break_idx = find_best_break(&cur, cfg);
            if cfg.enforce_kinsoku { break_idx = adjust_kinsoku(&cur, break_idx); }
            if break_idx < cur.len() {
                // Split: 0..break_idx stays, break_idx.. carries forward
                let carry: Vec<Tok> = cur.split_off(break_idx);
                lines.push(std::mem::take(&mut cur));
                cur = carry;
                cur_chars = slice_chars(&cur, cfg);
            } else {
                // Fallback: split at a balanced position instead of keeping everything
                let mut target_idx = find_balanced_break(&cur, cfg);
                if cfg.enforce_kinsoku { target_idx = adjust_kinsoku(&cur, target_idx); }
                if target_idx < cur.len() {
                    let carry: Vec<Tok> = cur.split_off(target_idx);
                    lines.push(std::mem::take(&mut cur));
                    cur = carry;
                    cur_chars = slice_chars(&cur, cfg);
                } else {
                    lines.push(std::mem::take(&mut cur));
                    cur_chars = 0;
                }
            }

            // Recompute with the new current line state
            let space_cost = if cfg.insert_interword_space && tok.leading_space && !cur.is_empty() { 1 } else { 0 };
            cur_chars += space_cost + tc;
            cur.push(tok.clone());
        } else {
            cur_chars = new_len;
            cur.push(tok.clone());
        }
    }

    if !cur.is_empty() {
        lines.push(cur);
    }

    lines
}

/// Scan backward through the line to find the best break point.
/// Returns the index at which to split: tokens before this index stay,
/// this index and after are carried to the next line.
///
/// Break priority (first match scanning backward wins):
/// 1. After terminal punctuation (. ! ?)
/// 2. After comma/semicolon
/// 3. Before a language-aware function word (conjunctions, prepositions, etc.)
/// 4. At a long pause (gap >= split_gap_sec)
/// 5. Fallback: break at the end (keep entire line)
fn find_best_break(line: &[Tok], cfg: &PostProcessConfig) -> usize {
    // Priority 1: After terminal punctuation
    for i in (1..line.len()).rev() {
        if is_terminal_punct(&line[i - 1].punc) {
            return i;
        }
    }
    // Priority 2: After comma/semicolon
    for i in (1..line.len()).rev() {
        if is_comma_like(&line[i - 1].punc) {
            return i;
        }
    }
    // Priority 3: Before function word (language-aware)
    for i in (1..line.len()).rev() {
        if is_function_word(&line[i].word, &cfg.lang) {
            return i;
        }
    }
    // Priority 4: At a long pause
    for i in (1..line.len()).rev() {
        let gap = line[i].start - line[i - 1].end;
        if gap >= cfg.split_gap_sec {
            return i;
        }
    }
    // No natural break found
    line.len()
}

/// Fallback break: find a position closest to 60% of CPL for a balanced split.
/// Used when find_best_break finds no natural break point.
fn find_balanced_break(line: &[Tok], cfg: &PostProcessConfig) -> usize {
    if line.len() <= 1 { return line.len(); }

    let target = (cfg.max_chars_per_line as f64 * 0.6) as usize;
    let mut best_pos = line.len();
    let mut best_diff = usize::MAX;
    let mut running_chars: usize = 0;

    for i in 0..line.len() {
        if cfg.insert_interword_space && line[i].leading_space && i > 0 {
            running_chars += 1;
        }
        running_chars += tok_chars(&line[i], cfg);

        if i > 0 { // don't split before the first word
            let diff = if running_chars > target { running_chars - target } else { target - running_chars };
            if diff < best_diff {
                best_diff = diff;
                // Break AFTER position i (i.e., at index i+1)
                best_pos = i + 1;
            }
        }
    }

    if best_pos < line.len() { best_pos } else { line.len() }
}

/// Characters that must NOT appear at the start of a line (Japanese kinsoku shori).
/// Includes closing punctuation, small kana, prolonged sound mark, etc.
fn violates_kinsoku_start(c: char) -> bool {
    matches!(c,
        '。' | '、' | '，' | '.' | ',' | '!' | '?' | '！' | '？' | '…' |
        '）' | ')' | '」' | '』' | '】' | '〉' | '》' | '｝' | ']' | '}' |
        'ぁ' | 'ぃ' | 'ぅ' | 'ぇ' | 'ぉ' | 'っ' | 'ゃ' | 'ゅ' | 'ょ' | 'ゎ' |
        'ァ' | 'ィ' | 'ゥ' | 'ェ' | 'ォ' | 'ッ' | 'ャ' | 'ュ' | 'ョ' | 'ヮ' | 'ー'
    )
}

/// Apply kinsoku adjustment to a break index within a line.
/// If the first character of the token at `break_idx` would violate kinsoku start rules,
/// shift the break forward by one (pull that token onto the previous line) to fix it.
fn adjust_kinsoku(line: &[Tok], break_idx: usize) -> usize {
    if break_idx >= line.len() || break_idx == 0 { return break_idx; }
    // Check the first character of the token that would start the new line
    let first_char = line[break_idx].word.chars().next()
        .or_else(|| line[break_idx].punc.chars().next());
    if let Some(c) = first_char {
        if violates_kinsoku_start(c) && break_idx + 1 <= line.len() {
            // Pull this token onto the previous line instead
            return break_idx + 1;
        }
    }
    break_idx
}

/// Bundle consecutive lines into subtitle cues, respecting max_lines and speaker boundaries.
fn group_lines_into_cues(lines: Vec<Vec<Tok>>, cfg: &PostProcessConfig) -> Vec<Segment> {
    let mut cues: Vec<Segment> = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        let mut cue_lines: Vec<&Vec<Tok>> = vec![&lines[i]];
        let cue_speaker = lines[i].first().and_then(|t| t.speaker.clone());
        let mut j = i + 1;

        while cue_lines.len() < cfg.max_lines && j < lines.len() {
            // Don't mix speakers in one cue
            let next_speaker = lines[j].first().and_then(|t| t.speaker.clone());
            if next_speaker != cue_speaker {
                break;
            }
            cue_lines.push(&lines[j]);
            j += 1;
        }

        // Build the Segment
        let all_toks: Vec<&Tok> = cue_lines.iter().flat_map(|l| l.iter()).collect();
        let start = all_toks.first().map(|t| t.start).unwrap_or(0.0);
        let end = all_toks.last().map(|t| t.end).unwrap_or(start);

        let text_lines: Vec<String> = cue_lines.iter()
            .map(|line| render_slice(line, cfg))
            .collect();
        let text = text_lines.join("\n");

        let words: Vec<WordTimestamp> = all_toks.iter()
            .map(|t| WordTimestamp {
                text: render_token(t),
                start: round3(t.start),
                end: round3(t.end),
                probability: t.prob,
            })
            .collect();

        cues.push(Segment {
            start: round3(start.max(0.0)),
            end: round3(end),
            text,
            words: Some(words),
            speaker_id: cue_speaker,
        });

        i = j;
    }

    cues
}

/// Post-pass: enforce min/max subtitle duration and characters-per-second cap.
/// - Extends short cues to `min_sub_dur` (clamped to not overlap the next cue).
/// - Splits cues that exceed `max_sub_dur` at the best word boundary.
/// - Splits cues where CPS exceeds `cps_cap` to give each half more screen time.
fn enforce_duration_limits(cues: &mut Vec<Segment>, cfg: &PostProcessConfig) {
    // --- Pass 1: Extend short cues to min_sub_dur ---
    for i in 0..cues.len() {
        let dur = cues[i].end - cues[i].start;
        if dur < cfg.min_sub_dur {
            // Extend end, but don't overlap the next cue's start
            let max_end = if i + 1 < cues.len() { cues[i + 1].start } else { f64::MAX };
            cues[i].end = round3((cues[i].start + cfg.min_sub_dur).min(max_end));
        }
    }

    // --- Pass 2: Split cues that exceed max_sub_dur ---
    let mut i = 0;
    while i < cues.len() {
        let dur = cues[i].end - cues[i].start;
        if dur > cfg.max_sub_dur {
            if let Some(words) = &cues[i].words {
                if words.len() >= 4 { // need enough words so both halves get ≥2
                    // Find the word boundary closest to the midpoint in time
                    let mid_time = cues[i].start + dur / 2.0;
                    let split_at = words.iter().enumerate()
                        .skip(2) // ensure first half has ≥2 words
                        .take(words.len() - 3) // ensure second half has ≥2 words
                        .min_by_key(|(_, w)| ((w.start - mid_time).abs() * 1000.0) as i64)
                        .map(|(idx, _)| idx)
                        .unwrap_or(2);

                    let second_words: Vec<WordTimestamp> = words[split_at..].to_vec();
                    let first_words: Vec<WordTimestamp> = words[..split_at].to_vec();

                    if first_words.len() >= 2 && second_words.len() >= 2 {
                        let first_text = first_words.iter().map(|w| w.text.as_str()).collect::<String>();
                        let second_text = second_words.iter().map(|w| w.text.as_str()).collect::<String>();
                        let first_end = first_words.last().unwrap().end;
                        let second_start = second_words.first().unwrap().start;

                        let second_cue = Segment {
                            start: round3(second_start),
                            end: cues[i].end,
                            text: second_text.trim().to_string(),
                            words: Some(second_words),
                            speaker_id: cues[i].speaker_id.clone(),
                        };

                        cues[i].end = round3(first_end);
                        cues[i].text = first_text.trim().to_string();
                        cues[i].words = Some(first_words);

                        cues.insert(i + 1, second_cue);
                        continue; // re-check the same index (first half might still be too long)
                    }
                }
            }
        }
        i += 1;
    }

    // --- Pass 3: Split cues that exceed CPS cap ---
    // Only split if both halves would have ≥2 words and the split actually
    // improves (lowers) the CPS of the worse half compared to the original.
    let mut i = 0;
    while i < cues.len() {
        let dur = cues[i].end - cues[i].start;
        if dur > 0.0 {
            let char_count = if cfg.use_grapheme_len {
                UnicodeSegmentation::graphemes(cues[i].text.as_str(), true).count()
            } else {
                cues[i].text.len()
            };
            let cps = char_count as f64 / dur;

            if cps > cfg.cps_cap {
                if let Some(words) = &cues[i].words {
                    if words.len() >= 4 { // need enough words so both halves get ≥2
                        let mid_time = cues[i].start + dur / 2.0;
                        let split_at = words.iter().enumerate()
                            .skip(2)
                            .take(words.len() - 3)
                            .min_by_key(|(_, w)| ((w.start - mid_time).abs() * 1000.0) as i64)
                            .map(|(idx, _)| idx)
                            .unwrap_or(2);

                        let second_words: Vec<WordTimestamp> = words[split_at..].to_vec();
                        let first_words: Vec<WordTimestamp> = words[..split_at].to_vec();

                        if first_words.len() >= 2 && second_words.len() >= 2 {
                            let first_text = first_words.iter().map(|w| w.text.as_str()).collect::<String>();
                            let second_text = second_words.iter().map(|w| w.text.as_str()).collect::<String>();
                            let first_end = first_words.last().unwrap().end;
                            let second_start = second_words.first().unwrap().start;

                            // Only proceed if the split actually improves CPS meaningfully
                            // and neither half would be too short to display well.
                            let first_dur = first_end - cues[i].start;
                            let second_dur = cues[i].end - second_start;
                            let first_chars = if cfg.use_grapheme_len {
                                UnicodeSegmentation::graphemes(first_text.trim(), true).count()
                            } else { first_text.trim().len() };
                            let second_chars = if cfg.use_grapheme_len {
                                UnicodeSegmentation::graphemes(second_text.trim(), true).count()
                            } else { second_text.trim().len() };

                            // Don't create orphan cues shorter than ~10 chars
                            let min_cue_chars = 10;
                            if first_chars < min_cue_chars || second_chars < min_cue_chars {
                                i += 1; continue;
                            }

                            let first_cps = if first_dur > 0.0 { first_chars as f64 / first_dur } else { f64::MAX };
                            let second_cps = if second_dur > 0.0 { second_chars as f64 / second_dur } else { f64::MAX };
                            let worst_half_cps = first_cps.max(second_cps);

                            // Require at least 10% improvement to justify the split
                            if worst_half_cps < cps * 0.9 {
                                let second_cue = Segment {
                                    start: round3(second_start),
                                    end: cues[i].end,
                                    text: second_text.trim().to_string(),
                                    words: Some(second_words),
                                    speaker_id: cues[i].speaker_id.clone(),
                                };

                                cues[i].end = round3(first_end);
                                cues[i].text = first_text.trim().to_string();
                                cues[i].words = Some(first_words);

                                cues.insert(i + 1, second_cue);
                                continue; // re-check
                            }
                        }
                    }
                }
            }
        }
        i += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_split() {
        let cfg = PostProcessConfig::default();

        // Build a pseudo segment and run
        let seg = Segment {
            start: 0.0,
            end: 1.1,
            text: String::new(),
            speaker_id: None,
            words: Some(vec![
                WordTimestamp { text: "I".into(), start: 0.00, end: 0.10, probability: None },
                WordTimestamp { text: " think".into(), start: 0.10, end: 0.38, probability: None },
                WordTimestamp { text: " I".into(), start: 0.50, end: 0.60, probability: None },
                WordTimestamp { text: " would".into(), start: 0.60, end: 0.80, probability: None },
                WordTimestamp { text: " like".into(), start: 0.80, end: 0.95, probability: None },
                WordTimestamp { text: " to".into(), start: 0.95, end: 1.05, probability: None },
                WordTimestamp { text: ".".into(), start: 1.05, end: 1.10, probability: None },
            ]),
        };
        let cues = process_segments(&[seg], &cfg);
        assert!(!cues.is_empty());
        // All words should appear across the cues
        let all_text: String = cues.iter().map(|c| c.text.as_str()).collect::<Vec<_>>().join(" ");
        let norm = all_text.split_whitespace().collect::<Vec<_>>().join(" ");
        assert!(norm.contains("I think"), "expected 'I think' in: {}", norm);
        assert!(norm.contains("would like to"), "expected 'would like to' in: {}", norm);
    }

    #[test]
    fn transhumanism_line_wrapping() {
        // Latin profile with standard density → CPL = 38
        let mut cfg = PostProcessConfig::latin();
        cfg.max_lines = 1; // one line per cue to test line-wrapping directly

        // "For us, transhumanism is of the utmost importance to the evolution
        //  of humanity and the continual growth of the human race,
        //  due to the present near future and long term threats
        //  that society is facing. Transhumanism will be the key to our survival,"
        let seg = Segment {
            start: 0.0,
            end: 18.0,
            text: String::new(),
            speaker_id: None,
            words: Some(vec![
                WordTimestamp { text: "For".into(),           start: 0.0, end: 0.3, probability: None },
                WordTimestamp { text: " us".into(),           start: 0.3, end: 0.5, probability: None },
                WordTimestamp { text: ",".into(),             start: 0.5, end: 0.5, probability: None },
                WordTimestamp { text: " transhumanism".into(),start: 0.6, end: 1.2, probability: None },
                WordTimestamp { text: " is".into(),           start: 1.2, end: 1.4, probability: None },
                WordTimestamp { text: " of".into(),           start: 1.4, end: 1.6, probability: None },
                WordTimestamp { text: " the".into(),          start: 1.6, end: 1.8, probability: None },
                WordTimestamp { text: " utmost".into(),       start: 1.8, end: 2.2, probability: None },
                WordTimestamp { text: " importance".into(),   start: 2.2, end: 2.8, probability: None },
                WordTimestamp { text: " to".into(),           start: 2.8, end: 3.0, probability: None },
                WordTimestamp { text: " the".into(),          start: 3.0, end: 3.2, probability: None },
                WordTimestamp { text: " evolution".into(),    start: 3.2, end: 3.8, probability: None },
                WordTimestamp { text: " of".into(),           start: 3.8, end: 4.0, probability: None },
                WordTimestamp { text: " humanity".into(),     start: 4.0, end: 4.5, probability: None },
                WordTimestamp { text: " and".into(),          start: 4.5, end: 4.7, probability: None },
                WordTimestamp { text: " the".into(),          start: 4.7, end: 4.9, probability: None },
                WordTimestamp { text: " continual".into(),    start: 4.9, end: 5.4, probability: None },
                WordTimestamp { text: " growth".into(),       start: 5.4, end: 5.8, probability: None },
                WordTimestamp { text: " of".into(),           start: 5.8, end: 6.0, probability: None },
                WordTimestamp { text: " the".into(),          start: 6.0, end: 6.2, probability: None },
                WordTimestamp { text: " human".into(),        start: 6.2, end: 6.5, probability: None },
                WordTimestamp { text: " race".into(),         start: 6.5, end: 6.8, probability: None },
                WordTimestamp { text: ",".into(),             start: 6.8, end: 6.8, probability: None },
                WordTimestamp { text: " due".into(),          start: 7.0, end: 7.3, probability: None },
                WordTimestamp { text: " to".into(),           start: 7.3, end: 7.5, probability: None },
                WordTimestamp { text: " the".into(),          start: 7.5, end: 7.7, probability: None },
                WordTimestamp { text: " present".into(),      start: 7.7, end: 8.1, probability: None },
                WordTimestamp { text: " near".into(),         start: 8.1, end: 8.4, probability: None },
                WordTimestamp { text: " future".into(),       start: 8.4, end: 8.8, probability: None },
                WordTimestamp { text: " and".into(),          start: 8.8, end: 9.0, probability: None },
                WordTimestamp { text: " long".into(),         start: 9.0, end: 9.3, probability: None },
                WordTimestamp { text: " term".into(),         start: 9.3, end: 9.6, probability: None },
                WordTimestamp { text: " threats".into(),      start: 9.6, end: 10.0, probability: None },
                WordTimestamp { text: " that".into(),         start: 10.0, end: 10.3, probability: None },
                WordTimestamp { text: " society".into(),      start: 10.3, end: 10.7, probability: None },
                WordTimestamp { text: " is".into(),           start: 10.7, end: 10.9, probability: None },
                WordTimestamp { text: " facing".into(),       start: 10.9, end: 11.3, probability: None },
                WordTimestamp { text: ".".into(),             start: 11.3, end: 11.4, probability: None },
                WordTimestamp { text: " Transhumanism".into(),start: 11.5, end: 12.2, probability: None },
                WordTimestamp { text: " will".into(),         start: 12.2, end: 12.5, probability: None },
                WordTimestamp { text: " be".into(),           start: 12.5, end: 12.7, probability: None },
                WordTimestamp { text: " the".into(),          start: 12.7, end: 12.9, probability: None },
                WordTimestamp { text: " key".into(),          start: 12.9, end: 13.2, probability: None },
                WordTimestamp { text: " to".into(),           start: 13.2, end: 13.4, probability: None },
                WordTimestamp { text: " our".into(),          start: 13.4, end: 13.6, probability: None },
                WordTimestamp { text: " survival".into(),     start: 13.6, end: 14.2, probability: None },
                WordTimestamp { text: ",".into(),             start: 14.2, end: 14.2, probability: None },
            ]),
        };

        let cues = process_segments(&[seg], &cfg);

        // Print all cues for visual inspection
        eprintln!("=== Transhumanism cues (CPL={}, max_lines={}) ===", cfg.max_chars_per_line, cfg.max_lines);
        for (i, cue) in cues.iter().enumerate() {
            eprintln!("  cue {}: {:?}", i, cue.text);
        }

        // No single-word orphan lines (a line with ≤ 8 chars is suspicious)
        let min_line_chars = 8;
        for cue in &cues {
            for line in cue.text.split('\n') {
                let trimmed = line.trim();
                // Allow very short lines only if they end with terminal punct (sentence ending)
                if trimmed.len() < min_line_chars && !trimmed.ends_with('.') && !trimmed.ends_with('!') && !trimmed.ends_with('?') {
                    panic!("orphan line ({} chars): {:?}", trimmed.len(), trimmed);
                }
            }
        }

        // Every cue line should be ≤ CPL
        for cue in &cues {
            for line in cue.text.split('\n') {
                assert!(line.len() <= cfg.max_chars_per_line,
                    "line too long ({} > {}): {:?}", line.len(), cfg.max_chars_per_line, line);
            }
        }

        // Prepositions/conjunctions should not be orphaned at end of line
        for cue in &cues {
            for line in cue.text.split('\n') {
                let trimmed = line.trim();
                assert!(!trimmed.ends_with(" and"), "line ends with orphaned 'and': {:?}", trimmed);
                assert!(!trimmed.ends_with(" of"), "line ends with orphaned 'of': {:?}", trimmed);
                assert!(!trimmed.ends_with(" to"), "line ends with orphaned 'to': {:?}", trimmed);
            }
        }
    }

    #[test]
    fn speaker_change_forces_cue_boundary() {
        let mut cfg = PostProcessConfig::default();
        cfg.max_lines = 2;

        let seg = Segment {
            start: 0.0,
            end: 4.0,
            text: String::new(),
            speaker_id: Some("A".into()),
            words: Some(vec![
                WordTimestamp { text: "Hello".into(),  start: 0.0, end: 0.5, probability: None },
                WordTimestamp { text: " world".into(), start: 0.5, end: 1.0, probability: None },
            ]),
        };
        let seg2 = Segment {
            start: 1.5,
            end: 4.0,
            text: String::new(),
            speaker_id: Some("B".into()),
            words: Some(vec![
                WordTimestamp { text: "Good".into(),    start: 1.5, end: 2.0, probability: None },
                WordTimestamp { text: " morning".into(),start: 2.0, end: 2.5, probability: None },
            ]),
        };

        let cues = process_segments(&[seg, seg2], &cfg);
        assert!(cues.len() >= 2, "expected separate cues for different speakers, got {}", cues.len());
        assert_eq!(cues[0].speaker_id, Some("A".into()));
        assert_eq!(cues[1].speaker_id, Some("B".into()));
    }

    #[test]
    fn cjk_comma_and_pause_breaking() {
        // CJK profile: CPL=20, no interword spaces
        let mut cfg = PostProcessConfig::cjk();
        cfg.max_lines = 1;

        // Longer Japanese text that exceeds CPL, forcing comma/pause-based breaks.
        // "私たちにとって、超人主義は最も重要な課題であり、社会の進化に不可欠なものです。"
        let seg = Segment {
            start: 0.0,
            end: 8.0,
            text: String::new(),
            speaker_id: None,
            words: Some(vec![
                WordTimestamp { text: "私たちにとって".into(),   start: 0.0, end: 1.0, probability: None },
                WordTimestamp { text: "、".into(),              start: 1.0, end: 1.0, probability: None },
                WordTimestamp { text: "超人主義は".into(),       start: 1.4, end: 2.5, probability: None },
                WordTimestamp { text: "最も重要な".into(),       start: 2.5, end: 3.2, probability: None },
                WordTimestamp { text: "課題であり".into(),       start: 3.2, end: 4.0, probability: None },
                WordTimestamp { text: "、".into(),              start: 4.0, end: 4.0, probability: None },
                // 0.4s pause after comma — above half of split_gap_sec
                WordTimestamp { text: "社会の進化に".into(),     start: 4.4, end: 5.5, probability: None },
                WordTimestamp { text: "不可欠な".into(),         start: 5.5, end: 6.3, probability: None },
                WordTimestamp { text: "ものです".into(),         start: 6.3, end: 7.0, probability: None },
                WordTimestamp { text: "。".into(),              start: 7.0, end: 7.1, probability: None },
            ]),
        };

        let cues = process_segments(&[seg], &cfg);

        eprintln!("=== CJK cues (CPL={}) ===", cfg.max_chars_per_line);
        for (i, cue) in cues.iter().enumerate() {
            eprintln!("  cue {}: {:?}", i, cue.text);
        }

        // Should break on commas and terminal punct (≥3 cues)
        assert!(cues.len() >= 3, "expected ≥3 cues for CJK, got {}: {:?}",
            cues.len(), cues.iter().map(|c| &c.text).collect::<Vec<_>>());

        // No line should exceed CPL (using grapheme count for CJK)
        for cue in &cues {
            for line in cue.text.split('\n') {
                let gc = UnicodeSegmentation::graphemes(line, true).count();
                assert!(gc <= cfg.max_chars_per_line + 2, // small tolerance for CJK punctuation
                    "CJK line too long ({} > {} graphemes): {:?}", gc, cfg.max_chars_per_line, line);
            }
        }
    }

    #[test]
    fn terminal_punct_forces_line_break() {
        let mut cfg = PostProcessConfig::default();
        cfg.max_lines = 1;

        let seg = Segment {
            start: 0.0,
            end: 3.0,
            text: String::new(),
            speaker_id: None,
            words: Some(vec![
                WordTimestamp { text: "Hello".into(),   start: 0.0, end: 0.3, probability: None },
                WordTimestamp { text: ".".into(),       start: 0.3, end: 0.4, probability: None },
                WordTimestamp { text: " Goodbye".into(),start: 0.5, end: 1.0, probability: None },
                WordTimestamp { text: ".".into(),       start: 1.0, end: 1.1, probability: None },
            ]),
        };

        let cues = process_segments(&[seg], &cfg);
        assert!(cues.len() >= 2, "expected separate cues after terminal punct, got {}: {:?}",
            cues.len(), cues.iter().map(|c| &c.text).collect::<Vec<_>>());
    }

    #[test]
    fn min_sub_dur_extends_short_cues() {
        let mut cfg = PostProcessConfig::default();
        cfg.min_sub_dur = 1.0;

        // A very short cue (0.4s) followed by another cue starting at 2.0s
        let seg = Segment {
            start: 0.0,
            end: 3.0,
            text: String::new(),
            speaker_id: None,
            words: Some(vec![
                WordTimestamp { text: "Hi".into(),     start: 0.0, end: 0.2, probability: None },
                WordTimestamp { text: ".".into(),      start: 0.2, end: 0.3, probability: None },
                WordTimestamp { text: " Welcome".into(), start: 2.0, end: 2.5, probability: None },
                WordTimestamp { text: " back".into(),  start: 2.5, end: 3.0, probability: None },
            ]),
        };

        let cues = process_segments(&[seg], &cfg);
        eprintln!("=== min_sub_dur cues ===");
        for (i, cue) in cues.iter().enumerate() {
            eprintln!("  cue {}: {:?} [{:.3} - {:.3}]", i, cue.text, cue.start, cue.end);
        }

        // First cue should be extended to at least min_sub_dur (1.0s)
        assert!(cues.len() >= 2, "expected ≥2 cues");
        let first_dur = cues[0].end - cues[0].start;
        assert!(first_dur >= 0.99, "first cue duration {:.3} should be ≥ min_sub_dur (1.0)", first_dur);
        // But should not overlap the next cue
        if cues.len() > 1 {
            assert!(cues[0].end <= cues[1].start + 0.001,
                "first cue end {:.3} should not exceed second cue start {:.3}", cues[0].end, cues[1].start);
        }
    }

    #[test]
    fn max_sub_dur_splits_long_cues() {
        let mut cfg = PostProcessConfig::default();
        cfg.max_sub_dur = 3.0;
        cfg.max_lines = 1;

        // A single long segment spanning 8 seconds with many words
        let seg = Segment {
            start: 0.0,
            end: 8.0,
            text: String::new(),
            speaker_id: None,
            words: Some(vec![
                WordTimestamp { text: "This".into(),      start: 0.0, end: 0.5, probability: None },
                WordTimestamp { text: " is".into(),       start: 0.5, end: 1.0, probability: None },
                WordTimestamp { text: " a".into(),        start: 1.0, end: 1.3, probability: None },
                WordTimestamp { text: " very".into(),     start: 1.3, end: 1.8, probability: None },
                WordTimestamp { text: " long".into(),     start: 1.8, end: 2.3, probability: None },
                WordTimestamp { text: " subtitle".into(), start: 2.3, end: 3.0, probability: None },
                WordTimestamp { text: " that".into(),     start: 3.0, end: 3.5, probability: None },
                WordTimestamp { text: " should".into(),   start: 3.5, end: 4.0, probability: None },
                WordTimestamp { text: " be".into(),       start: 4.0, end: 4.5, probability: None },
                WordTimestamp { text: " split".into(),    start: 4.5, end: 5.0, probability: None },
                WordTimestamp { text: " into".into(),     start: 5.0, end: 5.5, probability: None },
                WordTimestamp { text: " multiple".into(), start: 5.5, end: 6.5, probability: None },
                WordTimestamp { text: " parts".into(),    start: 6.5, end: 7.5, probability: None },
            ]),
        };

        let cues = process_segments(&[seg], &cfg);
        eprintln!("=== max_sub_dur cues ===");
        for (i, cue) in cues.iter().enumerate() {
            let dur = cue.end - cue.start;
            eprintln!("  cue {}: {:?} [{:.3} - {:.3}] dur={:.3}", i, cue.text, cue.start, cue.end, dur);
        }

        // No cue should exceed max_sub_dur (with small tolerance for rounding)
        for cue in &cues {
            let dur = cue.end - cue.start;
            assert!(dur <= cfg.max_sub_dur + 0.1,
                "cue duration {:.3} exceeds max_sub_dur {:.1}: {:?}", dur, cfg.max_sub_dur, cue.text);
        }
    }

    #[test]
    fn french_function_word_breaking() {
        let mut cfg = PostProcessConfig::for_language("fr");
        cfg.max_lines = 1;

        // French text: "Le transhumanisme est de la plus grande importance pour l'évolution de l'humanité"
        let seg = Segment {
            start: 0.0,
            end: 6.0,
            text: String::new(),
            speaker_id: None,
            words: Some(vec![
                WordTimestamp { text: "Le".into(),              start: 0.0, end: 0.3, probability: None },
                WordTimestamp { text: " transhumanisme".into(), start: 0.3, end: 1.2, probability: None },
                WordTimestamp { text: " est".into(),            start: 1.2, end: 1.5, probability: None },
                WordTimestamp { text: " de".into(),             start: 1.5, end: 1.7, probability: None },
                WordTimestamp { text: " la".into(),             start: 1.7, end: 1.9, probability: None },
                WordTimestamp { text: " plus".into(),           start: 1.9, end: 2.2, probability: None },
                WordTimestamp { text: " grande".into(),         start: 2.2, end: 2.6, probability: None },
                WordTimestamp { text: " importance".into(),     start: 2.6, end: 3.2, probability: None },
                WordTimestamp { text: " pour".into(),           start: 3.2, end: 3.5, probability: None },
                WordTimestamp { text: " l'évolution".into(),    start: 3.5, end: 4.2, probability: None },
                WordTimestamp { text: " de".into(),             start: 4.2, end: 4.4, probability: None },
                WordTimestamp { text: " l'humanité".into(),     start: 4.4, end: 5.5, probability: None },
            ]),
        };

        let cues = process_segments(&[seg], &cfg);
        eprintln!("=== French cues (CPL={}) ===", cfg.max_chars_per_line);
        for (i, cue) in cues.iter().enumerate() {
            eprintln!("  cue {}: {:?}", i, cue.text);
        }

        // Should have multiple cues (text is ~70 chars, CPL=38)
        assert!(cues.len() >= 2, "expected ≥2 cues for French text, got {}", cues.len());

        // French function words like "de", "pour" should not be orphaned at end of line
        for cue in &cues {
            for line in cue.text.split('\n') {
                let trimmed = line.trim();
                assert!(!trimmed.ends_with(" de"), "line ends with orphaned 'de': {:?}", trimmed);
                assert!(!trimmed.ends_with(" pour"), "line ends with orphaned 'pour': {:?}", trimmed);
            }
        }
    }

    #[test]
    fn kinsoku_prevents_bad_line_starts() {
        // Verify the kinsoku helper function works correctly
        assert!(violates_kinsoku_start('。'));
        assert!(violates_kinsoku_start('、'));
        assert!(violates_kinsoku_start('っ'));
        assert!(violates_kinsoku_start('ー'));
        assert!(!violates_kinsoku_start('私'));
        assert!(!violates_kinsoku_start('A'));

        // Verify adjust_kinsoku shifts the break point
        let toks = vec![
            Tok { word: "テスト".into(), punc: "".into(), start: 0.0, end: 0.5, prob: None, speaker: None, leading_space: false },
            Tok { word: "ー".into(), punc: "".into(), start: 0.5, end: 0.6, prob: None, speaker: None, leading_space: false },
            Tok { word: "データ".into(), punc: "".into(), start: 0.6, end: 1.0, prob: None, speaker: None, leading_space: false },
        ];
        // Breaking at index 1 would put 'ー' at line start — kinsoku should shift to 2
        let adjusted = adjust_kinsoku(&toks, 1);
        assert_eq!(adjusted, 2, "kinsoku should shift break past prolonged sound mark");
    }

    #[test]
    fn lang_field_set_correctly() {
        let cfg = PostProcessConfig::for_language("fr");
        assert_eq!(cfg.lang, "fr");

        let cfg = PostProcessConfig::for_language("ja");
        assert_eq!(cfg.lang, "ja");
        assert!(cfg.enforce_kinsoku);

        let cfg = PostProcessConfig::default();
        assert_eq!(cfg.lang, "en");
    }
}
