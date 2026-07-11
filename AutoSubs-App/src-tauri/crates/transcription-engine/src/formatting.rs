// Subtitle post-processing for timestamped transcription output.
//
// Pipeline: normalize engine tokens, establish speaker/pause/sentence boundaries,
// apply content transforms, wrap at punctuation or balanced legal boundaries,
// then schedule minimum display duration without overlapping the next cue.
//
// Input words are assumed to be chronological. Punctuation may be attached or
// emitted as standalone tokens; both forms are normalized here.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use crate::types::{WordTimestamp, Segment};
use unicode_segmentation::UnicodeSegmentation;
use once_cell::sync::Lazy;
use regex::Regex;

/// Matches any run of characters that are NOT letters, digits, whitespace, apostrophe, or
/// asterisk. The asterisk is preserved so that censor markers (e.g. "f******k") survive
/// an optional punctuation-removal pass. This is a superset of the old JS regex
/// `[^\p{L}\p{N}\s']+`, which accidentally stripped censor asterisks.
static PUNCT_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"[^\p{L}\p{N}\s'*]+").expect("valid punctuation regex"));

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
    /// True if this token is the first word of a new whisper segment that was
    /// preceded by a meaningful pause. Used to force line + cue breaks so the
    /// formatter respects whisper's natural utterance boundaries instead of
    /// re-merging short utterances across silence gaps.
    pub segment_break: bool,
}

/// Minimum inter-segment silence (seconds) for a whisper segment boundary to
/// be promoted to a forced cue break. Below this we assume whisper sub-split
/// the same phrase rather than detecting a real pause.
const SEGMENT_BREAK_GAP_SEC: f64 = 0.3;

/// Maximum gap between two tokens for the right token to be treated as a BPE
/// sub-word continuation of the left token. Larger gaps are treated as separate
/// words, which prevents a token that merely has no leading space from being
/// treated as a continuation and suppressing sentence-end line breaks.
const SUBWORD_GAP_SEC: f64 = 0.03;

#[inline]
fn round3(x: f64) -> f64 { (x * 1000.0).round() / 1000.0 }

/// User-facing text density control that scales `max_chars_per_line`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TextDensity {
    Less,
    Standard,
    More,
    Single,
    Custom,
}

impl Default for TextDensity {
    fn default() -> Self { Self::Standard }
}

/// User-facing case transform applied after structural line-wrapping.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextCase {
    None,
    Lowercase,
    Uppercase,
    Titlecase,
}

impl Default for TextCase {
    fn default() -> Self { Self::None }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostProcessConfig {
    /// Max characters per rendered line (CPL)
    pub max_chars_per_line: usize, // e.g., 38
    /// Max lines per subtitle cue (commonly 2)
    pub max_lines: usize,          // e.g., 2
    /// If a pause between words >= this, we consider it a strong split candidate
    pub split_gap_sec: f64,        // e.g., 0.5
    /// Minimum duration per subtitle cue
    pub min_sub_dur: f64,          // e.g., 1.0
    /// Maximum duration per subtitle cue
    pub max_sub_dur: f64,          // e.g., 6.0
    pub insert_interword_space: bool,   // false for CJK
    pub enforce_kinsoku: bool,          // true for JA
    /// When true, emit one word per subtitle cue (set by TextDensity::Single)
    pub single_word: bool,
    /// Content formatting: case transform applied to rendered words.
    #[serde(default)]
    pub text_case: TextCase,
    /// Content formatting: strip non-letter/digit/whitespace/apostrophe characters from rendered text.
    #[serde(default)]
    pub remove_punctuation: bool,
    /// Content formatting: case-insensitive list of words to censor (replaced with first+***+last).
    #[serde(default)]
    pub censored_words: Vec<String>,
}

impl Default for PostProcessConfig {
    fn default() -> Self {
        Self {
            max_chars_per_line: 38,
            max_lines: 1,
            split_gap_sec: 0.5,
            min_sub_dur: 1.0,
            max_sub_dur: 6.0,
            insert_interword_space: true,
            enforce_kinsoku: false,
            single_word: false,
            text_case: TextCase::None,
            remove_punctuation: false,
            censored_words: Vec::new(),
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

    /// Build a config by scanning the transcribed text for the dominant script.
    /// Used when the engine reports no detected language (e.g. `language = "auto"`
    /// with SenseVoice/Canary/Cohere/Parakeet), so CJK/Korean/RTL/Indic/SE-Asian
    /// output is not formatted with Latin spacing/wrapping rules.
    pub fn for_text(text: &str) -> Self {
        Self::with_profile(profile_for_text(text))
    }

    /// Scale `max_chars_per_line` by density factor (~0.7 / 1.0 / 1.3).
    pub fn apply_density(&mut self, density: TextDensity) {
        match density {
            TextDensity::Single => {
                self.single_word = true;
            }
            TextDensity::Custom => {
                // Custom density doesn't modify max_chars_per_line here;
                // it should be set directly by the caller using custom_max_chars_per_line
            }
            other => {
                let factor = match other {
                    TextDensity::Less => 0.7,
                    TextDensity::Standard => 1.0,
                    TextDensity::More => 1.3,
                    TextDensity::Single | TextDensity::Custom => unreachable!(),
                };
                self.max_chars_per_line = ((self.max_chars_per_line as f64) * factor).round() as usize;
            }
        }
    }

    /// Convenience constructors for common profiles
    pub fn latin() -> Self { Self::with_profile(ScriptProfile::Latin) }
    pub fn cjk() -> Self { Self::with_profile(ScriptProfile::CJK) }
    pub fn korean() -> Self { Self::with_profile(ScriptProfile::Korean) }
    pub fn se_asian_no_space() -> Self { Self::with_profile(ScriptProfile::SEAsianNoSpace) }
    pub fn rtl() -> Self { Self::with_profile(ScriptProfile::RTL) }
    pub fn indic() -> Self { Self::with_profile(ScriptProfile::Indic) }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScriptProfile { Latin, CJK, Korean, SEAsianNoSpace, RTL, Indic }

pub fn apply_profile(cfg: &mut PostProcessConfig, p: ScriptProfile) {
    match p {
        ScriptProfile::Latin => {
            cfg.max_chars_per_line = 38; // previously 36..=40; pick 38
            cfg.insert_interword_space = true;
            cfg.enforce_kinsoku = false;
        }
        ScriptProfile::CJK => {
            cfg.max_chars_per_line = 20; // previously 16..=22; pick 20
            cfg.insert_interword_space = false;
            cfg.enforce_kinsoku = true; // simple blacklist rules
        }
        ScriptProfile::Korean => {
            // Korean uses Hangul (CJK-width characters) but, unlike Chinese/Japanese,
            // separates words with spaces (eojeol). Treat width like CJK but keep spaces.
            cfg.max_chars_per_line = 22;
            cfg.insert_interword_space = true;
            cfg.enforce_kinsoku = false; // kinsoku is a Japanese convention
        }
        ScriptProfile::SEAsianNoSpace => { // Thai, Khmer, Lao, etc.
            cfg.max_chars_per_line = 22; // previously 18..=26; pick 22
            cfg.insert_interword_space = true; // tokens likely presegmented
            cfg.enforce_kinsoku = false;
        }
        ScriptProfile::RTL => { // Arabic, Hebrew
            cfg.max_chars_per_line = 28; // previously 24..=32; pick 28
            cfg.insert_interword_space = true;
            cfg.enforce_kinsoku = false;
        }
        ScriptProfile::Indic => {
            cfg.max_chars_per_line = 30; // previously 26..=34; pick 30
            cfg.insert_interword_space = true;
            cfg.enforce_kinsoku = false;
        }
    }
}

pub fn profile_for_lang(lang: &str) -> ScriptProfile {
    let primary = lang
        .split(['-', '_'])
        .next()
        .unwrap_or(lang)
        .to_ascii_lowercase();
    match primary.as_str() {
        // CJK (Chinese & Japanese — no inter-word spaces)
        "zh" | "ja" => ScriptProfile::CJK,
        // Korean uses Hangul but separates words with spaces (eojeol)
        "ko" => ScriptProfile::Korean,
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

/// Infer a `ScriptProfile` by scanning the transcribed text and returning the
/// dominant writing-system profile. Used when the engine
/// does not surface a detected language (e.g. SenseVoice/Canary/Cohere/Parakeet
/// with `language = "auto"`), so CJK/Korean/RTL/Indic/SE-Asian output is not
/// accidentally formatted with Latin spacing/wrapping rules.
///
/// Latin and Cyrillic both use inter-word spaces and map to `Latin`, so
/// European/Cyrillic output (e.g. Parakeet) correctly keeps Latin formatting.
pub fn profile_for_text(text: &str) -> ScriptProfile {
    let mut cjk = 0u32;
    let mut korean = 0u32;
    let mut rtl = 0u32;
    let mut se_asian = 0u32;
    let mut indic = 0u32;
    let mut spaced = 0u32;

    for c in text.chars() {
        let cp = c as u32;
        // CJK: Unified Ideographs + Hiragana + Katakana + CJK punctuation
        if (0x4E00..=0x9FFF).contains(&cp)
            || (0x3040..=0x309F).contains(&cp)
            || (0x30A0..=0x30FF).contains(&cp)
            || (0x3400..=0x4DBF).contains(&cp)
            || (0xF900..=0xFAFF).contains(&cp)
            || (0xFF66..=0xFF9F).contains(&cp)
        {
            cjk += 1;
        }
        // Hangul syllables + Jamo
        else if (0xAC00..=0xD7AF).contains(&cp)
            || (0x1100..=0x11FF).contains(&cp)
            || (0x3130..=0x318F).contains(&cp)
        {
            korean += 1;
        }
        // Arabic + Hebrew (RTL)
        else if (0x0600..=0x06FF).contains(&cp)
            || (0x0750..=0x077F).contains(&cp)
            || (0x0590..=0x05FF).contains(&cp)
            || (0xFB50..=0xFDFF).contains(&cp)
            || (0xFE70..=0xFEFF).contains(&cp)
        {
            rtl += 1;
        }
        // Thai + Lao + Khmer + Myanmar (SE Asian, no inter-word spaces)
        else if (0x0E00..=0x0E7F).contains(&cp)
            || (0x0E80..=0x0EFF).contains(&cp)
            || (0x1780..=0x17FF).contains(&cp)
            || (0x1000..=0x109F).contains(&cp)
        {
            se_asian += 1;
        }
        // Indic: Devanagari + Bengali + Tamil + Telugu + Malayalam + others
        else if (0x0900..=0x097F).contains(&cp)
            || (0x0980..=0x09FF).contains(&cp)
            || (0x0A00..=0x0A7F).contains(&cp)
            || (0x0A80..=0x0AFF).contains(&cp)
            || (0x0B00..=0x0B7F).contains(&cp)
            || (0x0B80..=0x0BFF).contains(&cp)
            || (0x0C00..=0x0C7F).contains(&cp)
            || (0x0C80..=0x0CFF).contains(&cp)
            || (0x0D00..=0x0D7F).contains(&cp)
            || (0x0D80..=0x0DFF).contains(&cp)
        {
            indic += 1;
        } else if c.is_alphabetic() {
            // Latin, Cyrillic, Greek, and other scripts that use spaces. This
            // count is essential: one CJK character in an otherwise English
            // transcript must not disable all inter-word spacing.
            spaced += 1;
        }
    }

    let best_non_latin = [
        (cjk, ScriptProfile::CJK),
        (korean, ScriptProfile::Korean),
        (rtl, ScriptProfile::RTL),
        (se_asian, ScriptProfile::SEAsianNoSpace),
        (indic, ScriptProfile::Indic),
    ]
    .into_iter()
    .max_by_key(|&(n, _)| n);

    match best_non_latin {
        // Ties intentionally preserve spaces for mixed-script text.
        Some((n, profile)) if n > spaced => profile,
        // No dominant non-Latin script: preserve spaces conservatively.
        _ => ScriptProfile::Latin,
    }
}

/// Main entry: post-process timestamped transcription segments into readable cues.
pub fn process_segments(
    segments: &[Segment],
    cfg: &PostProcessConfig,
) -> Vec<Segment> {
    // 1) Normalize all engine outputs into real word tokens. Segment text is
    //    tokenized as a fallback for engines that do not provide word data.
    let mut all: Vec<(Option<String>, WordTimestamp, bool)> = Vec::new();
    let mut prev_end: Option<f64> = None;
    for (seg_idx, seg) in segments.iter().enumerate() {
        let speaker = seg.speaker_id.clone();
        let words: Vec<WordTimestamp> = match &seg.words {
            Some(ws) if !ws.is_empty() => ws.clone(),
            _ => {
                let fallback_end = if seg.end > seg.start {
                    seg.end
                } else {
                    seg.start + cfg.min_sub_dur.max(0.0)
                };
                interpolate_segment_words(
                    &seg.text,
                    seg.start,
                    fallback_end,
                    cfg.insert_interword_space,
                )
            }
        };
        for (w_idx, w) in words.into_iter().enumerate() {
            let is_first_in_seg = w_idx == 0;
            let segment_break = is_first_in_seg
                && seg_idx > 0
                && prev_end.map(|pe| (w.start - pe) >= SEGMENT_BREAK_GAP_SEC).unwrap_or(false);
            prev_end = Some(w.end);
            all.push((speaker.clone(), w, segment_break));
        }
    }
    if all.is_empty() { return Vec::new(); }

    // 2) Separate trailing punctuation and preserve the engine's explicit
    //    leading-space marker. That marker identifies both word boundaries and
    //    BPE continuation pieces.
    let mut toks: Vec<Tok> = Vec::with_capacity(all.len());
    for (speaker, w, segment_break) in all.into_iter() {
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
            segment_break,
        });
    }

    // 3) Merge BPE continuation pieces, but never across speakers or meaningful
    //    segment boundaries.
    merge_continuations(&mut toks, cfg.insert_interword_space);
    if !cfg.insert_interword_space {
        split_no_space_tokens(&mut toks);
    }

    // 4) Repair invalid timestamps without changing recognized word identity.
    sanitize_word_times(&mut toks);

    let censor_set = build_censor_set(&cfg.censored_words);

    // Fast path: single-word mode emits one cue per normalized word.
    if cfg.single_word {
        let mut cues: Vec<Segment> = toks.into_iter().map(|mut t| {
            apply_content_formatting(&mut t, cfg, &censor_set);
            segment_from_lines(&[vec![t]], cfg)
        }).collect();
        schedule_min_duration(&mut cues, cfg.min_sub_dur);
        return cues;
    }

    // 5) Hard boundaries are independent of visual line length: speakers,
    //    meaningful pauses, sentence endings, and maximum cue duration.
    let groups = split_into_cue_groups(toks, cfg);

    // 6) Transform and render each group exactly once. Wrapping happens after
    //    case conversion so Unicode case expansion cannot violate CPL.
    let mut cues = Vec::new();
    for mut group in groups {
        for t in &mut group {
                apply_content_formatting(t, cfg, &censor_set);
        }
        let lines = wrap_group(group, cfg);
        let max_lines = cfg.max_lines.max(1);
        for cue_lines in lines.chunks(max_lines) {
            cues.push(segment_from_lines(cue_lines, cfg));
        }
    }

    // 7) Minimum display duration is a scheduling concern and therefore runs
    //    last, while also clamping any natural overlap between adjacent cues.
    schedule_min_duration(&mut cues, cfg.min_sub_dur);

    cues
}

// === Implementation details ===

fn interpolate_segment_words(
    text: &str,
    start: f64,
    end: f64,
    uses_spaces: bool,
) -> Vec<WordTimestamp> {
    let words: Vec<&str> = if uses_spaces {
        text.split_whitespace().collect()
    } else {
        UnicodeSegmentation::graphemes(text.trim(), true)
            .filter(|grapheme| !grapheme.chars().all(char::is_whitespace))
            .collect()
    };
    if words.is_empty() {
        return Vec::new();
    }

    let duration = (end - start).max(0.0);
    let weights: Vec<usize> = words
        .iter()
        .map(|word| word.chars().count().max(1))
        .collect();
    let total_weight: usize = weights.iter().sum();
    let mut consumed = 0usize;

    words
        .iter()
        .enumerate()
        .map(|(index, word)| {
            let word_start = start + duration * consumed as f64 / total_weight as f64;
            consumed += weights[index];
            let word_end = start + duration * consumed as f64 / total_weight as f64;
            WordTimestamp {
                text: if uses_spaces && index > 0 {
                    format!(" {word}")
                } else {
                    (*word).to_string()
                },
                start: word_start,
                end: word_end,
                probability: None,
            }
        })
        .collect()
}

// ---- Content formatting (case, punctuation removal, censoring) ----

fn build_censor_set(words: &[String]) -> HashSet<String> {
    words
        .iter()
        .map(|w| w.trim().to_lowercase())
        .filter(|w| !w.is_empty())
        .collect()
}

/// Strip punctuation characters as defined by [`PUNCT_RE`] (non-letter/digit/whitespace/apostrophe).
fn strip_punct_chars(s: &str) -> String {
    PUNCT_RE.replace_all(s, "").into_owned()
}

/// Port of the JS `getCensoredVersion`: first + '*' * (len-2) + last, or all '*' if ≤3 chars.
fn censored_replacement(clean: &str) -> String {
    let chars: Vec<char> = clean.chars().collect();
    let n = chars.len();
    if n == 0 {
        return String::new();
    }
    if n > 3 {
        let mut out = String::with_capacity(n);
        out.push(chars[0]);
        for _ in 0..(n - 2) { out.push('*'); }
        out.push(chars[n - 1]);
        out
    } else {
        "*".repeat(n)
    }
}

/// Lowercase then uppercase the first letter of every "word" (separated by non-word chars).
/// Mirrors JS `.toLocaleLowerCase().replace(/\b\w/g, c => c.toUpperCase())`.
fn titlecase_latin(s: &str) -> String {
    let lower = s.to_lowercase();
    let mut out = String::with_capacity(lower.len());
    let mut prev_is_word = false;
    for c in lower.chars() {
        let is_word = c.is_alphanumeric() || c == '_';
        if is_word && !prev_is_word {
            for uc in c.to_uppercase() { out.push(uc); }
        } else {
            out.push(c);
        }
        prev_is_word = is_word;
    }
    out
}

/// Apply content formatting to a single token in place:
/// 1) censor (if core word matches), 2) strip punctuation, 3) case transform.
fn apply_content_formatting(t: &mut Tok, cfg: &PostProcessConfig, censor_set: &HashSet<String>) {
    // 1) Censor: check if the cleaned word (punctuation stripped, lowercased) is in the set.
    if !censor_set.is_empty() {
        let clean = strip_punct_chars(&t.word);
        let clean_trim = clean.trim();
        if !clean_trim.is_empty() && censor_set.contains(&clean_trim.to_lowercase()) {
            let replacement = censored_replacement(clean_trim);
            // Replace the first occurrence of `clean_trim` within `t.word` to preserve any
            // surrounding characters (e.g. internal apostrophes) — mirrors JS `word.replace(clean, censored)`.
            if let Some(idx) = t.word.find(clean_trim) {
                let mut new_word = String::with_capacity(t.word.len());
                new_word.push_str(&t.word[..idx]);
                new_word.push_str(&replacement);
                new_word.push_str(&t.word[idx + clean_trim.len()..]);
                t.word = new_word;
            } else {
                t.word = replacement;
            }
        }
    }

    // 2) Remove punctuation: clear the trailing punctuation field and strip any
    //    non-letter/digit/whitespace/apostrophe characters from the word body.
    if cfg.remove_punctuation {
        t.punc.clear();
        if !t.word.is_empty() {
            t.word = strip_punct_chars(&t.word);
        }
    }

    // 3) Apply case transform to the word (punctuation is case-insensitive in practice).
    match cfg.text_case {
        TextCase::None => {}
        TextCase::Lowercase => { t.word = t.word.to_lowercase(); }
        TextCase::Uppercase => { t.word = t.word.to_uppercase(); }
        TextCase::Titlecase => { t.word = titlecase_latin(&t.word); }
    }
}

/// Unicode-aware "is this a plain alphabetic word fragment" check used for
/// subword-continuation merging. Accepts any alphabetic codepoint (Latin,
/// Cyrillic, Greek, Armenian, etc.) plus apostrophe-like marks that commonly
/// appear inside words.
#[inline]
fn is_letter_word(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_alphabetic() || c == '\'' || c == '\u{2019}')
}

/// Merge tokens where the right token is a continuation piece (no leading space)
/// and both sides look like alphabetic words. This avoids outputs like
/// "trans" + "human" + "ism" and instead yields "transhumanism", and equally
/// fixes Cyrillic/Greek/etc. BPE fragments that Whisper emits without a leading
/// space (e.g. "при" + "ветствую" -> "приветствую").
fn merge_continuations(toks: &mut Vec<Tok>, uses_spaces: bool) {
    if toks.is_empty() { return; }
    let mut out: Vec<Tok> = Vec::with_capacity(toks.len());
    for t in std::mem::take(toks).into_iter() {
        if let Some(prev) = out.last_mut() {
            // Token adjacency is not stronger than an utterance or speaker
            // boundary. In particular, diarized segments often touch with no
            // measurable gap.
            if t.segment_break || prev.speaker != t.speaker {
                out.push(t);
                continue;
            }
            // Case 1: punctuation-only token -> append its punc to previous's
            // punc field rather than absorbing prev.punc into the word body.
            // This preserves terminal markers like "." when followed by a
            // closing quote/bracket (e.g. `같아요.` + `"` -> punc=`."`).
            if t.word.is_empty() && !t.punc.is_empty() {
                prev.punc.push_str(&t.punc);
                prev.end = prev.end.max(t.end);
                continue;
            }
            let right_cont = !t.leading_space;
            let both_letter_word = is_letter_word(&prev.word) && is_letter_word(&t.word);
            let no_prev_punc = prev.punc.is_empty();
            // Only merge if the boundary is essentially contiguous (tiny gap)
            let tiny_gap = (t.start - prev.end) <= SUBWORD_GAP_SEC;
            if uses_spaces && right_cont && both_letter_word && no_prev_punc && tiny_gap {
                // Merge t into prev without inserting a space.
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

/// No-space scripts can arrive as tokenizer fragments, words, or an entire
/// sentence in one timestamp. Grapheme tokens provide stable legal break
/// boundaries regardless of the upstream engine's tokenization.
fn split_no_space_tokens(toks: &mut Vec<Tok>) {
    let mut out = Vec::new();
    for token in std::mem::take(toks) {
        let graphemes: Vec<&str> = UnicodeSegmentation::graphemes(token.word.as_str(), true).collect();
        if graphemes.len() <= 1 {
            out.push(token);
            continue;
        }

        let duration = (token.end - token.start).max(0.0);
        let count = graphemes.len();
        for (index, grapheme) in graphemes.into_iter().enumerate() {
            out.push(Tok {
                word: grapheme.to_string(),
                punc: if index + 1 == count { token.punc.clone() } else { String::new() },
                start: token.start + duration * index as f64 / count as f64,
                end: token.start + duration * (index + 1) as f64 / count as f64,
                prob: token.prob,
                speaker: token.speaker.clone(),
                leading_space: index == 0 && token.leading_space,
                segment_break: index == 0 && token.segment_break,
            });
        }
    }
    *toks = out;
}

fn split_trailing_punct(s: &str) -> (&str, &str) {
    let is_punc = |c: char| matches!(c,
        '.' | '!' | '?' | ',' | ';' | ':' | '…' | '。' | '！' | '？' | '、' | '，' |
        '،' | '؛' | '؟' | '—' | '–' | ')' | ']' | '}' | '"' | '”' | '’' | '»'
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
    // Match if any character in the punc string is a sentence terminator.
    // Looser than equality so combos like `."`, `?)`, `…"` still trigger
    // line breaks when a closing quote/bracket trails the terminator.
    p.chars().any(|c| matches!(c, '.' | '!' | '?' | '…' | '。' | '！' | '？' | '؟'))
}

fn is_comma_like(p: &str) -> bool {
    p.chars().any(|c| matches!(c, ',' | '，' | '、' | ';' | '،' | '؛'))
}

fn sanitize_word_times(toks: &mut [Tok]) {
    for tok in toks {
        if !tok.start.is_finite() {
            tok.start = 0.0;
        }
        if !tok.end.is_finite() {
            tok.end = tok.start;
        }
        tok.start = tok.start.max(0.0);
        tok.end = tok.end.max(tok.start);
    }
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
    let core_len: usize = slice
        .iter()
        .map(|t| {
            UnicodeSegmentation::graphemes(t.word.as_str(), true).count()
                + UnicodeSegmentation::graphemes(t.punc.as_str(), true).count()
        })
        .sum();
    let spaces = if cfg.insert_interword_space { slice.iter().skip(1).filter(|t| t.leading_space).count() } else { 0 };
    core_len + spaces
}

/// Wrap one already-bounded cue group. Text remains on one line while it fits;
/// when it overflows, a legal boundary is selected using punctuation, pauses,
/// and line balance. No language dictionary is required.
fn wrap_group(mut remaining: Vec<Tok>, cfg: &PostProcessConfig) -> Vec<Vec<Tok>> {
    let cap = cfg.max_chars_per_line.max(1);
    let mut lines = Vec::new();

    while slice_chars(&remaining, cfg) > cap && remaining.len() > 1 {
        let split = choose_line_break(&remaining, cfg, cap);
        if split == 0 || split >= remaining.len() {
            break;
        }
        let carry = remaining.split_off(split);
        lines.push(remaining);
        remaining = carry;
    }

    if !remaining.is_empty() {
        lines.push(remaining);
    }
    lines
}

fn choose_line_break(tokens: &[Tok], cfg: &PostProcessConfig, cap: usize) -> usize {
    let mut candidates = Vec::new();
    for index in 1..tokens.len() {
        if cfg.insert_interword_space && !tokens[index].leading_space {
            continue;
        }
        let left_len = slice_chars(&tokens[..index], cfg);
        if left_len > cap {
            continue;
        }
        if cfg.enforce_kinsoku && !is_kinsoku_break(tokens, index) {
            continue;
        }
        candidates.push((index, left_len, break_priority(tokens, index, cfg)));
    }

    // If kinsoku rules leave no fitting boundary, preserving the width limit is
    // preferable to emitting an arbitrarily long line.
    if candidates.is_empty() && cfg.enforce_kinsoku {
        for index in 1..tokens.len() {
            if slice_chars(&tokens[..index], cfg) <= cap {
                candidates.push((index, slice_chars(&tokens[..index], cfg), 0));
            }
        }
    }

    let total_len = slice_chars(tokens, cfg);
    let line_count = total_len.div_ceil(cap);
    let target = total_len.div_ceil(line_count);
    let natural_tolerance = cap / 3;

    candidates
        .iter()
        .filter(|(_, len, priority)| {
            *priority > 0 && len.abs_diff(target) <= natural_tolerance
        })
        .max_by_key(|(_, len, priority)| (*priority, usize::MAX - len.abs_diff(target)))
        .or_else(|| candidates.iter().min_by_key(|(_, len, _)| len.abs_diff(target)))
        .map(|(index, _, _)| *index)
        .unwrap_or(1)
}

fn break_priority(tokens: &[Tok], index: usize, cfg: &PostProcessConfig) -> u8 {
    let left = &tokens[index - 1];
    let right = &tokens[index];
    if is_terminal_punct(&left.punc) {
        3
    } else if is_comma_like(&left.punc) || right.start - left.end >= cfg.split_gap_sec * 0.5 {
        2
    } else {
        0
    }
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

fn violates_kinsoku_end(c: char) -> bool {
    matches!(c,
        '（' | '(' | '「' | '『' | '【' | '〈' | '《' | '｛' | '[' | '{'
    )
}

fn is_kinsoku_break(tokens: &[Tok], index: usize) -> bool {
    let left_char = tokens[index - 1]
        .punc
        .chars()
        .last()
        .or_else(|| tokens[index - 1].word.chars().last());
    let right_char = tokens[index]
        .word
        .chars()
        .next()
        .or_else(|| tokens[index].punc.chars().next());

    !left_char.is_some_and(violates_kinsoku_end)
        && !right_char.is_some_and(violates_kinsoku_start)
}

/// Partition normalized words at boundaries that must survive visual wrapping.
/// A maximum-duration boundary is introduced before a word when adding that
/// word would exceed the configured duration. A single intrinsically long word
/// remains indivisible.
fn split_into_cue_groups(toks: Vec<Tok>, cfg: &PostProcessConfig) -> Vec<Vec<Tok>> {
    let mut groups = Vec::new();
    let mut current: Vec<Tok> = Vec::new();

    for tok in toks {
        if let Some(previous) = current.last() {
            let speaker_change = previous.speaker != tok.speaker;
            let long_pause = tok.start - previous.end >= cfg.split_gap_sec;
            let exceeds_max_duration = cfg.max_sub_dur > 0.0
                && tok.end - current[0].start > cfg.max_sub_dur;
            if speaker_change || tok.segment_break || long_pause || exceeds_max_duration {
                groups.push(std::mem::take(&mut current));
            }
        }

        let ends_sentence = is_terminal_punct(&tok.punc);
        current.push(tok);
        if ends_sentence {
            groups.push(std::mem::take(&mut current));
        }
    }

    if !current.is_empty() {
        groups.push(current);
    }
    groups
}

fn segment_from_lines(lines: &[Vec<Tok>], cfg: &PostProcessConfig) -> Segment {
    let tokens: Vec<&Tok> = lines.iter().flat_map(|line| line.iter()).collect();
    let start = tokens.first().map(|token| token.start).unwrap_or(0.0);
    let end = tokens.last().map(|token| token.end).unwrap_or(start);
    let speaker_id = tokens.first().and_then(|token| token.speaker.clone());
    let text = lines
        .iter()
        .map(|line| render_slice(line, cfg))
        .collect::<Vec<_>>()
        .join("\n");
    let words = tokens
        .into_iter()
        .map(|token| WordTimestamp {
            text: render_token(token),
            start: round3(token.start),
            end: round3(token.end),
            probability: token.prob,
        })
        .collect();

    Segment {
        start: round3(start),
        end: round3(end),
        text,
        words: Some(words),
        speaker_id,
    }
}

fn schedule_min_duration(cues: &mut [Segment], min_duration: f64) {
    let min_duration = min_duration.max(0.0);
    for index in 0..cues.len() {
        let next_start = cues.get(index + 1).map(|cue| cue.start).unwrap_or(f64::MAX);
        let desired_end = cues[index].end.max(cues[index].start + min_duration);
        cues[index].end = round3(desired_end.min(next_start).max(cues[index].start));

        let cue_end = cues[index].end;
        if let Some(words) = cues[index].words.as_mut() {
            for word in words {
                word.end = word.end.min(cue_end);
                word.start = word.start.min(word.end);
            }
        }
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
    fn french_text_wraps_without_language_dictionary() {
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

        // The formatter applies the same deterministic punctuation/balance
        // policy to every space-separated language.
        for cue in &cues {
            for line in cue.text.split('\n') {
                assert!(UnicodeSegmentation::graphemes(line, true).count() <= cfg.max_chars_per_line);
            }
        }
        let joined = cues.iter().map(|cue| cue.text.as_str()).collect::<Vec<_>>().join(" ");
        assert_eq!(joined.split_whitespace().collect::<Vec<_>>().join(" "),
            "Le transhumanisme est de la plus grande importance pour l'évolution de l'humanité");
    }

    #[test]
    fn kinsoku_prevents_bad_line_starts() {
        assert!(violates_kinsoku_start('。'));
        assert!(violates_kinsoku_start('、'));
        assert!(violates_kinsoku_start('っ'));
        assert!(violates_kinsoku_start('ー'));
        assert!(!violates_kinsoku_start('私'));
        assert!(!violates_kinsoku_start('A'));

        let toks = vec![
            Tok { word: "テスト".into(), punc: "".into(), start: 0.0, end: 0.5, prob: None, speaker: None, leading_space: false, segment_break: false },
            Tok { word: "ー".into(), punc: "".into(), start: 0.5, end: 0.6, prob: None, speaker: None, leading_space: false, segment_break: false },
            Tok { word: "データ".into(), punc: "".into(), start: 0.6, end: 1.0, prob: None, speaker: None, leading_space: false, segment_break: false },
        ];
        assert!(!is_kinsoku_break(&toks, 1));
        assert!(is_kinsoku_break(&toks, 2));
    }

    // --- Content formatting tests ---

    fn make_hello_world_seg() -> Segment {
        Segment {
            start: 0.0,
            end: 2.0,
            text: String::new(),
            speaker_id: None,
            words: Some(vec![
                WordTimestamp { text: "Hello".into(),  start: 0.0, end: 0.5, probability: None },
                WordTimestamp { text: ",".into(),      start: 0.5, end: 0.5, probability: None },
                WordTimestamp { text: " fantastic".into(), start: 0.6, end: 1.2, probability: None },
                WordTimestamp { text: " world".into(), start: 1.2, end: 1.8, probability: None },
                WordTimestamp { text: "!".into(),      start: 1.8, end: 1.9, probability: None },
            ]),
        }
    }

    #[test]
    fn content_formatting_uppercase() {
        let mut cfg = PostProcessConfig::default();
        cfg.text_case = TextCase::Uppercase;
        let cues = process_segments(&[make_hello_world_seg()], &cfg);
        assert!(!cues.is_empty());
        let joined: String = cues.iter().map(|c| c.text.clone()).collect::<Vec<_>>().join(" ");
        assert!(joined.contains("HELLO"), "expected HELLO in: {}", joined);
        assert!(joined.contains("WORLD"), "expected WORLD in: {}", joined);
        // Punctuation should still be present since remove_punctuation is false.
        assert!(joined.contains("!"), "expected ! in: {}", joined);
    }

    #[test]
    fn content_formatting_lowercase_preserves_word_timings() {
        let mut cfg = PostProcessConfig::default();
        cfg.text_case = TextCase::Lowercase;
        let cues = process_segments(&[make_hello_world_seg()], &cfg);
        for cue in &cues {
            let words = cue.words.as_ref().expect("words present");
            for w in words {
                assert!(w.end >= w.start, "word timing inverted: {:?}", w);
            }
        }
        let joined: String = cues.iter().map(|c| c.text.clone()).collect::<Vec<_>>().join(" ");
        assert!(joined.contains("hello"), "expected hello in: {}", joined);
        // No uppercase letters in the rendered text.
        assert!(joined.chars().all(|c| !c.is_ascii_uppercase()), "unexpected uppercase in: {}", joined);
    }

    #[test]
    fn content_formatting_titlecase() {
        let mut cfg = PostProcessConfig::default();
        cfg.text_case = TextCase::Titlecase;
        let cues = process_segments(&[make_hello_world_seg()], &cfg);
        let joined: String = cues.iter().map(|c| c.text.clone()).collect::<Vec<_>>().join(" ");
        assert!(joined.contains("Hello"), "expected Hello in: {}", joined);
        assert!(joined.contains("Fantastic"), "expected Fantastic in: {}", joined);
        assert!(joined.contains("World"), "expected World in: {}", joined);
    }

    #[test]
    fn content_formatting_remove_punctuation_strips_trailing_and_commas() {
        let mut cfg = PostProcessConfig::default();
        cfg.remove_punctuation = true;
        let cues = process_segments(&[make_hello_world_seg()], &cfg);
        let joined: String = cues.iter().map(|c| c.text.clone()).collect::<Vec<_>>().join(" ");
        assert!(!joined.contains('!'), "! should be removed: {}", joined);
        assert!(!joined.contains(','), ", should be removed: {}", joined);
        // Apostrophes are preserved by the regex (word chars kept).
        assert!(joined.contains("Hello"), "expected Hello retained: {}", joined);
    }

    #[test]
    fn content_formatting_censor_preserves_surrounding_punctuation() {
        let mut cfg = PostProcessConfig::default();
        cfg.censored_words = vec!["fantastic".to_string()];
        let cues = process_segments(&[make_hello_world_seg()], &cfg);
        let joined: String = cues.iter().map(|c| c.text.clone()).collect::<Vec<_>>().join(" ");
        // "fantastic" (9 chars) -> "f" + "*"*7 + "c"
        assert!(joined.contains("f*******c"), "expected censored word in: {}", joined);
        // Surrounding words untouched.
        assert!(joined.contains("Hello"), "expected Hello preserved: {}", joined);
        assert!(joined.contains("world"), "expected world preserved: {}", joined);
    }

    #[test]
    fn content_formatting_combines_all_three() {
        let mut cfg = PostProcessConfig::default();
        cfg.text_case = TextCase::Uppercase;
        cfg.remove_punctuation = true;
        cfg.censored_words = vec!["fantastic".to_string()];
        let cues = process_segments(&[make_hello_world_seg()], &cfg);
        let joined: String = cues.iter().map(|c| c.text.clone()).collect::<Vec<_>>().join(" ");
        // Censor runs BEFORE case (censor produces f*******c, then uppercase -> F*******C).
        assert!(joined.contains("F*******C"), "expected uppercased censored in: {}", joined);
        assert!(joined.contains("HELLO"), "expected HELLO in: {}", joined);
        assert!(!joined.contains('!'), "punctuation should be stripped: {}", joined);
        assert!(!joined.contains(','), "commas should be stripped: {}", joined);
    }

    #[test]
    fn language_tags_are_normalized_to_primary_subtags() {
        assert_eq!(profile_for_lang("en-US"), ScriptProfile::Latin);
        assert_eq!(profile_for_lang("PT_br"), ScriptProfile::Latin);
        assert_eq!(profile_for_lang("zh-TW"), ScriptProfile::CJK);
        assert_eq!(profile_for_lang("JA-jp"), ScriptProfile::CJK);
        assert_eq!(profile_for_lang("ko-KR"), ScriptProfile::Korean);
    }

    #[test]
    fn arabic_bpe_fragments_not_split() {
        // Regression for Arabic/RTL word splitting: BPE fragments emitted
        // without a leading space must be merged into a single word and not
        // split across subtitle lines.
        let mut cfg = PostProcessConfig::for_language("ar");
        cfg.max_lines = 1;

        let seg = Segment {
            start: 0.0,
            end: 3.0,
            text: String::new(),
            speaker_id: None,
            words: Some(vec![
                WordTimestamp { text: "ال".into(),    start: 0.0, end: 0.2, probability: None },
                // No leading space: continuation of the Arabic word "العالم" (the world).
                WordTimestamp { text: "عالم".into(),  start: 0.2, end: 0.7, probability: None },
                // Arabic comma as a standalone token.
                WordTimestamp { text: "،".into(),     start: 0.7, end: 0.8, probability: None },
                WordTimestamp { text: " مرحبا".into(), start: 1.0, end: 1.5, probability: None },
            ]),
        };

        let cues = process_segments(&[seg], &cfg);
        let joined: String = cues.iter().map(|c| c.text.clone()).collect::<Vec<_>>().join(" ");
        // BPE fragments should render as one word.
        assert!(joined.contains("العالم"), "expected merged Arabic word in: {}", joined);
        assert!(!joined.contains("ال عالم"), "Arabic BPE fragments should not be separated: {}", joined);
    }

    #[test]
    fn terminal_punct_breaks_with_no_leading_space_and_large_gap() {
        // A token with no leading space but a large gap after terminal
        // punctuation should not be treated as a continuation, and the
        // sentence boundary should still be respected.
        let mut cfg = PostProcessConfig::default();
        cfg.max_lines = 1;

        let seg = Segment {
            start: 0.0,
            end: 2.0,
            text: String::new(),
            speaker_id: None,
            words: Some(vec![
                WordTimestamp { text: "Hello".into(), start: 0.0, end: 0.3, probability: None },
                WordTimestamp { text: ".".into(),    start: 0.3, end: 0.4, probability: None },
                // 0.05s gap after the period, no leading space, but not a real BPE continuation.
                WordTimestamp { text: "World".into(), start: 0.45, end: 0.9, probability: None },
                WordTimestamp { text: ".".into(),    start: 0.9, end: 1.0, probability: None },
            ]),
        };

        let cues = process_segments(&[seg], &cfg);
        assert!(cues.len() >= 2,
            "expected separate cues after terminal punctuation, got {}: {:?}",
            cues.len(), cues.iter().map(|c| &c.text).collect::<Vec<_>>());
        let first = cues.first().unwrap().text.clone();
        let second = cues.get(1).unwrap().text.clone();
        assert!(first.contains("Hello"), "first cue should contain 'Hello': {:?}", first);
        assert!(second.contains("World"), "second cue should contain 'World': {:?}", second);
    }

    #[test]
    fn continuation_merge_never_crosses_speakers() {
        let cfg = PostProcessConfig::default();
        let first = Segment {
            start: 0.0,
            end: 0.5,
            text: String::new(),
            speaker_id: Some("A".into()),
            words: Some(vec![WordTimestamp {
                text: "Hello".into(), start: 0.0, end: 0.5, probability: None,
            }]),
        };
        let second = Segment {
            start: 0.5,
            end: 1.0,
            text: String::new(),
            speaker_id: Some("B".into()),
            // Deliberately no leading space and no gap: this looks exactly like
            // a BPE continuation except for the speaker boundary.
            words: Some(vec![WordTimestamp {
                text: "World".into(), start: 0.5, end: 1.0, probability: None,
            }]),
        };

        let cues = process_segments(&[first, second], &cfg);
        assert_eq!(cues.len(), 2);
        assert_eq!(cues[0].text, "Hello");
        assert_eq!(cues[0].speaker_id.as_deref(), Some("A"));
        assert_eq!(cues[1].text, "World");
        assert_eq!(cues[1].speaker_id.as_deref(), Some("B"));
    }

    #[test]
    fn strong_pause_inside_one_engine_segment_forces_new_cue() {
        let mut cfg = PostProcessConfig::default();
        cfg.split_gap_sec = 0.5;
        let segment = Segment {
            start: 0.0,
            end: 3.0,
            text: String::new(),
            speaker_id: None,
            words: Some(vec![
                WordTimestamp { text: "Hello".into(), start: 0.0, end: 0.3, probability: None },
                WordTimestamp { text: " again".into(), start: 2.0, end: 2.5, probability: None },
            ]),
        };

        let cues = process_segments(&[segment], &cfg);
        assert_eq!(cues.len(), 2);
        assert_eq!(cues[0].text, "Hello");
        assert_eq!(cues[1].text, "again");
    }

    #[test]
    fn mixed_latin_text_does_not_select_no_space_profile() {
        assert_eq!(
            profile_for_text("An English sentence mentioning 東京 once"),
            ScriptProfile::Latin
        );
        assert_eq!(profile_for_text("AB東京"), ScriptProfile::Latin);
        assert_eq!(profile_for_text("これは日本語の文章です"), ScriptProfile::CJK);
        assert_eq!(profile_for_text("ｶﾀｶﾅ"), ScriptProfile::CJK);
        assert_eq!(profile_for_text("ＦＵＬＬＷＩＤＴＨ"), ScriptProfile::Latin);
    }

    #[test]
    fn arabic_question_mark_ends_a_cue() {
        let cfg = PostProcessConfig::for_language("ar");
        let segment = Segment {
            start: 0.0,
            end: 2.0,
            text: String::new(),
            speaker_id: None,
            words: Some(vec![
                WordTimestamp { text: "مرحبا؟".into(), start: 0.0, end: 0.7, probability: None },
                WordTimestamp { text: " أهلا".into(), start: 0.8, end: 1.4, probability: None },
            ]),
        };

        let cues = process_segments(&[segment], &cfg);
        assert_eq!(cues.len(), 2);
        assert_eq!(cues[0].text, "مرحبا؟");
        assert_eq!(cues[1].text, "أهلا");
    }

    #[test]
    fn max_duration_also_splits_short_word_lists() {
        let mut cfg = PostProcessConfig::default();
        cfg.max_sub_dur = 2.5;
        cfg.min_sub_dur = 0.0;
        let segment = Segment {
            start: 0.0,
            end: 6.0,
            text: String::new(),
            speaker_id: None,
            words: Some(vec![
                WordTimestamp { text: "One".into(), start: 0.0, end: 2.0, probability: None },
                WordTimestamp { text: " two".into(), start: 2.0, end: 4.0, probability: None },
                WordTimestamp { text: " three".into(), start: 4.0, end: 6.0, probability: None },
            ]),
        };

        let cues = process_segments(&[segment], &cfg);
        assert_eq!(cues.len(), 3);
        assert!(cues.iter().all(|cue| cue.end - cue.start <= cfg.max_sub_dur));
    }

    #[test]
    fn text_only_segments_are_tokenized_before_wrapping() {
        let mut cfg = PostProcessConfig::default();
        cfg.max_chars_per_line = 12;
        cfg.max_lines = 1;
        cfg.min_sub_dur = 0.0;
        let segment = Segment {
            start: 0.0,
            end: 3.0,
            text: "Fallback text still wraps correctly".into(),
            speaker_id: None,
            words: None,
        };

        let cues = process_segments(&[segment], &cfg);
        assert!(cues.len() > 1);
        assert!(cues.iter().all(|cue| {
            UnicodeSegmentation::graphemes(cue.text.as_str(), true).count()
                <= cfg.max_chars_per_line
        }));
        assert_eq!(
            cues.iter().map(|cue| cue.text.as_str()).collect::<Vec<_>>().join(" "),
            "Fallback text still wraps correctly"
        );
    }

    #[test]
    fn zero_duration_text_only_segments_use_minimum_display_duration() {
        let mut cfg = PostProcessConfig::default();
        cfg.min_sub_dur = 2.0;
        let segment = Segment {
            start: 3.0,
            end: 3.0,
            text: "Fallback timing".into(),
            words: None,
            speaker_id: None,
        };

        let cues = process_segments(&[segment], &cfg);
        assert_eq!(cues.len(), 1);
        assert_eq!((cues[0].start, cues[0].end), (3.0, 5.0));
        let words = cues[0].words.as_ref().unwrap();
        assert_eq!(words.len(), 2);
        assert!(words.iter().all(|word| word.start < word.end));
        assert_eq!(words.last().unwrap().end, cues[0].end);
    }

    #[test]
    fn no_space_engine_tokens_remain_breakable() {
        let mut cfg = PostProcessConfig::for_language("ja");
        cfg.max_chars_per_line = 8;
        cfg.max_lines = 1;
        cfg.min_sub_dur = 0.0;
        let text = "これはとても長い日本語字幕のテストです";
        let segment = Segment {
            start: 0.0,
            end: 2.0,
            text: text.into(),
            // Some engines expose an entire no-space sentence as one word.
            words: Some(vec![WordTimestamp {
                text: text.into(), start: 0.0, end: 2.0, probability: None,
            }]),
            speaker_id: None,
        };

        let cues = process_segments(&[segment], &cfg);
        assert!(cues.len() > 1);
        assert!(cues.iter().all(|cue| {
            UnicodeSegmentation::graphemes(cue.text.as_str(), true).count()
                <= cfg.max_chars_per_line
        }));
        assert_eq!(cues.iter().map(|cue| cue.text.as_str()).collect::<String>(), text);
    }

    #[test]
    fn no_space_text_only_segments_wrap_by_grapheme() {
        let mut cfg = PostProcessConfig::for_language("ja");
        cfg.max_chars_per_line = 8;
        cfg.max_lines = 1;
        cfg.min_sub_dur = 0.0;
        let text = "これは単語時刻なしの日本語字幕です";
        let segment = Segment {
            start: 0.0,
            end: 3.0,
            text: text.into(),
            words: None,
            speaker_id: None,
        };

        let cues = process_segments(&[segment], &cfg);
        assert!(cues.len() > 1);
        assert!(cues.iter().all(|cue| {
            UnicodeSegmentation::graphemes(cue.text.as_str(), true).count()
                <= cfg.max_chars_per_line
        }));
        assert_eq!(cues.iter().map(|cue| cue.text.as_str()).collect::<String>(), text);
    }

    #[test]
    fn final_scheduling_clamps_natural_cue_overlap() {
        let cfg = PostProcessConfig::default();
        let first = Segment {
            start: 0.0,
            end: 2.0,
            text: String::new(),
            speaker_id: Some("A".into()),
            words: Some(vec![
                WordTimestamp {
                    text: "First".into(), start: 0.0, end: 2.0, probability: None,
                },
                WordTimestamp {
                    text: " overlap".into(), start: 0.5, end: 2.5, probability: None,
                },
                WordTimestamp {
                    text: " ends".into(), start: 1.0, end: 2.0, probability: None,
                },
            ]),
        };
        let second = Segment {
            start: 1.5,
            end: 3.0,
            text: String::new(),
            speaker_id: Some("B".into()),
            words: Some(vec![WordTimestamp {
                text: "Second".into(), start: 1.5, end: 3.0, probability: None,
            }]),
        };

        let cues = process_segments(&[first, second], &cfg);
        assert_eq!(cues.len(), 2);
        assert!(cues[0].end <= cues[1].start);
        assert!(cues[0].words.as_ref().unwrap().iter().all(|word| {
            word.start <= word.end && word.end <= cues[0].end
        }));
    }
}
