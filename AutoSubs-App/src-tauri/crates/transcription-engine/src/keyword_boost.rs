//! Token-level keyword biasing ("boosting tree") for the ONNX engines.
//!
//! Mirrors the semantics of NeMo's GPU phrase boosting (GPU-PB, arXiv
//! 2508.07014) and Icefall's `ContextGraph`: the keywords are tokenized against
//! the model's own vocabulary and compiled into a weighted trie with
//! Aho-Corasick failure links. During decoding each emitted token advances the
//! hypothesis through the graph; the bonus contributed per token is the
//! difference in accumulated node scores, so a hypothesis automatically gives
//! back its boost when it diverges from a keyword path.
//!
//! Scoring follows NeMo's defaults for TDT/CTC models: every first token of a
//! phrase is worth `context_score` (1.0), later tokens are worth
//! `context_score * depth_scaling + ln(depth + 1)` (depth_scaling 2.0), so
//! completing an in-progress keyword is strongly preferred over starting a
//! lookalike word. `alpha` scales the whole bonus at decode time; 1.0 matches
//! the beam-search configuration validated on Orukeet/Parakeet — greedy
//! decoders may want a higher alpha for the same effect.

use std::collections::HashMap;

use transcribe_rs::decode::parse_byte_token;

/// Bonus for the first token of a phrase (NeMo `context_score`).
pub const CONTEXT_SCORE: f32 = 1.0;
/// Depth multiplier for later tokens (NeMo recommendation for TDT/CTC is 2.0,
/// for Canary 1.0 — we use 2.0 everywhere; the difference is modest).
pub const DEPTH_SCALING: f32 = 2.0;
/// Decode-time boost multiplier applied on top of graph scores.
pub const DEFAULT_BOOST_ALPHA: f32 = 1.0;
/// Beam width used by boosted beam-search decoders.
pub const DEFAULT_BEAM_SIZE: usize = 4;

/// Upper bounds mirroring the keyword validation in the reference API.
pub const MAX_KEYWORDS: usize = 500;
pub const MAX_KEYWORD_CHARS: usize = 100;
/// Cap on tokenized context injected into canary/cohere prompts: their
/// generation window is ~1024 positions and the prompt shares it.
pub const MAX_CONTEXT_TOKENS: usize = 400;

/// Split a free-form prompt into keyword phrases: comma- or newline-separated,
/// trimmed, deduplicated case-insensitively (first spelling wins).
pub fn parse_keywords(prompt: &str) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut keywords = Vec::new();
    for item in prompt.split([',', '\n']) {
        let phrase: String = item.split_whitespace().collect::<Vec<_>>().join(" ");
        if phrase.is_empty() {
            continue;
        }
        if phrase.chars().count() > MAX_KEYWORD_CHARS {
            // No content in the log: prompt phrases can contain private names.
            tracing::warn!("Keyword phrase over {MAX_KEYWORD_CHARS} chars skipped");
            continue;
        }
        if !seen.insert(phrase.to_lowercase()) {
            continue;
        }
        keywords.push(phrase);
        if keywords.len() >= MAX_KEYWORDS {
            tracing::warn!("Keyword limit of {MAX_KEYWORDS} reached; remaining phrases ignored");
            break;
        }
    }
    keywords
}

/// Index of a vocabulary for greedy-match tokenization. Pieces that can never
/// appear in keyword text (empty strings, `<...>` specials, byte tokens) are
/// left out.
struct PieceIndex<'a> {
    piece_to_id: HashMap<&'a str, i32>,
    /// SentencePiece byte-fallback pieces (`<0xNN>`), keyed by byte value —
    /// the only `<...>` pieces that can appear inside real text.
    byte_to_id: HashMap<u8, i32>,
    lengths: Vec<usize>,
}

impl<'a> PieceIndex<'a> {
    fn new(vocab: &'a [String]) -> Self {
        let mut piece_to_id: HashMap<&str, i32> = HashMap::with_capacity(vocab.len());
        let mut byte_to_id: HashMap<u8, i32> = HashMap::new();
        let mut lengths: Vec<usize> = Vec::new();
        for (id, piece) in vocab.iter().enumerate() {
            if piece.is_empty() {
                continue;
            }
            if piece.starts_with('<') {
                if let Some(byte) = parse_byte_token(piece) {
                    byte_to_id.entry(byte).or_insert(id as i32);
                }
                continue;
            }
            if piece_to_id.insert(piece.as_str(), id as i32).is_none() {
                lengths.push(piece.len());
            }
        }
        lengths.sort_unstable_by(|a, b| b.cmp(a));
        lengths.dedup();
        Self {
            piece_to_id,
            byte_to_id,
            lengths,
        }
    }

    /// Greedy-match `bytes` starting at `pos`. When `shortest` is true the
    /// smallest matching piece wins, otherwise the largest. Byte-fallback
    /// pieces match last: a single raw byte only when no piece covers it.
    fn match_at(&self, bytes: &[u8], pos: usize, shortest: bool) -> Option<(i32, usize)> {
        let lens: &[usize] = &self.lengths;
        let iter: Box<dyn Iterator<Item = &usize>> = if shortest {
            Box::new(lens.iter().rev())
        } else {
            Box::new(lens.iter())
        };
        for &len in iter {
            if len == 0 || pos + len > bytes.len() {
                continue;
            }
            if let Ok(candidate) = std::str::from_utf8(&bytes[pos..pos + len]) {
                if let Some(&id) = self.piece_to_id.get(candidate) {
                    return Some((id, len));
                }
            }
        }
        self.byte_to_id.get(&bytes[pos]).map(|&id| (id, 1))
    }
}

fn tokenize_text_with(index: &PieceIndex, text: &str) -> Vec<i32> {
    let bytes = text.as_bytes();
    let mut ids = Vec::new();
    let mut pos = 0;
    while pos < bytes.len() {
        match index.match_at(bytes, pos, false) {
            Some((id, len)) => {
                ids.push(id);
                pos += len;
            }
            None => pos += 1,
        }
    }
    ids
}

/// Tokenize arbitrary text into model piece ids by greedy longest-match.
/// Characters that match no piece are skipped rather than failing, so this
/// always succeeds; used for canary/cohere context-slot injection where a
/// partial tokenization is still useful.
pub fn tokenize_text(vocab: &[String], text: &str) -> Vec<i32> {
    tokenize_text_with(&PieceIndex::new(vocab), text)
}

/// Tokenize keyword phrases for context-slot injection (canary/cohere),
/// producing " kw1, kw2, ...". Only whole phrases are included: once the
/// context would exceed `max_tokens`, remaining keywords are dropped with a
/// warning rather than cut mid-phrase.
pub fn tokenize_context(vocab: &[String], keywords: &[String], max_tokens: usize) -> Vec<i32> {
    let index = PieceIndex::new(vocab);
    let sep = tokenize_text_with(&index, ",");
    let mut ids = Vec::new();
    let mut first = true;
    for kw in keywords {
        let mut piece_ids = tokenize_text_with(&index, &format!(" {}", kw.trim()));
        if !first {
            piece_ids.splice(0..0, sep.iter().copied());
        }
        first = false;
        if ids.len() + piece_ids.len() > max_tokens {
            tracing::warn!(
                "Keyword context truncated at {max_tokens} tokens; remaining phrases omitted"
            );
            break;
        }
        ids.extend(piece_ids);
    }
    ids
}

/// Tokenize a keyword into model piece ids by greedy longest-match against the
/// vocabulary, the same strategy sherpa-onnx uses for hotword tokenization.
///
/// A leading space is prepended so the first matched piece carries the
/// word-start marker on BPE vocabularies (" Kal" rather than mid-word "Kal"),
/// and acts as an explicit boundary token on character vocabularies. Returns
/// `None` when any position cannot be matched — the caller skips such keywords.
pub fn tokenize_keyword(vocab: &[String], text: &str) -> Option<Vec<i32>> {
    let index = PieceIndex::new(vocab);
    let spaced = format!(" {}", text.trim());
    let bytes = spaced.as_bytes();
    let mut ids = Vec::new();
    let mut pos = 0;
    while pos < bytes.len() {
        match index.match_at(bytes, pos, false) {
            Some((id, len)) => {
                ids.push(id);
                pos += len;
            }
            None => return None,
        }
    }
    Some(ids)
}

/// Tokenize a keyword into up to two piece-id sequences: greedy longest-match
/// and greedy shortest-match. NeMo's universal graph enumerates alternative
/// BPE splits explicitly; with only the vocab list available (no tokenizer
/// model) two extreme segmentations capture most of the variation the model
/// may emit. On character vocabularies both coincide and one path is returned.
fn tokenize_keyword_variants(index: &PieceIndex, text: &str) -> Vec<Vec<i32>> {
    let spaced = format!(" {}", text.trim());
    let bytes = spaced.as_bytes();
    let mut variants = Vec::new();
    for shortest in [false, true] {
        let mut ids = Vec::new();
        let mut pos = 0;
        let mut ok = true;
        while pos < bytes.len() {
            match index.match_at(bytes, pos, shortest) {
                Some((id, len)) => {
                    ids.push(id);
                    pos += len;
                }
                None => {
                    ok = false;
                    break;
                }
            }
        }
        if ok && !ids.is_empty() && !variants.contains(&ids) {
            variants.push(ids);
        }
    }
    variants
}

struct Node {
    /// Bonus granted for emitting the token that leads to this node.
    token_score: f32,
    /// Accumulated bonus along the best path from the root to this node.
    node_score: f32,
    /// This node completes at least one keyword.
    terminal: bool,
    /// Longest proper suffix of this node that is also a keyword prefix.
    fail: usize,
    next: HashMap<i32, usize>,
}

/// The compiled boosting tree: a trie of tokenized keywords with failure links.
pub struct KeywordGraph {
    nodes: Vec<Node>,
}

impl KeywordGraph {
    /// Build a graph from model piece vocab + pre-tokenized keyword sequences.
    /// Returns `None` when nothing was inserted.
    pub fn build(token_ids: impl IntoIterator<Item = Vec<i32>>) -> Option<Self> {
        let mut graph = KeywordGraph {
            nodes: vec![Node {
                token_score: 0.0,
                node_score: 0.0,
                terminal: false,
                fail: 0,
                next: HashMap::new(),
            }],
        };

        let mut inserted = false;
        for tokens in token_ids {
            if tokens.is_empty() {
                continue;
            }
            inserted = true;
            let mut node = 0usize;
            for (depth, token) in tokens.iter().enumerate() {
                let token_score = if depth == 0 {
                    CONTEXT_SCORE
                } else {
                    CONTEXT_SCORE * DEPTH_SCALING + ((depth + 1) as f32).ln()
                };
                match graph.nodes[node].next.get(token) {
                    Some(&child) => {
                        // Shared prefix: keep the maximum accumulated score.
                        let candidate = graph.nodes[node].node_score + token_score;
                        if candidate > graph.nodes[child].node_score {
                            graph.nodes[child].token_score = token_score;
                            graph.nodes[child].node_score = candidate;
                        }
                        node = child;
                    }
                    None => {
                        let node_score = graph.nodes[node].node_score + token_score;
                        graph.nodes.push(Node {
                            token_score,
                            node_score,
                            terminal: false,
                            fail: 0,
                            next: HashMap::new(),
                        });
                        let child = graph.nodes.len() - 1;
                        graph.nodes[node].next.insert(*token, child);
                        node = child;
                    }
                }
            }
            graph.nodes[node].terminal = true;
        }
        if !inserted {
            return None;
        }

        graph.fill_fail_links();
        Some(graph)
    }

    /// Tokenize each keyword against `vocab` and build the graph. Keywords that
    /// cannot be tokenized are skipped; BPE vocabularies contribute both the
    /// longest- and shortest-match tokenization of each keyword so the graph
    /// still rewards the piece split the model actually emits.
    pub fn from_keywords(vocab: &[String], keywords: &[String]) -> Option<Self> {
        // One vocabulary index shared across every keyword — building it per
        // phrase would re-allocate the whole table up to MAX_KEYWORDS times.
        let index = PieceIndex::new(vocab);
        Self::build(
            keywords
                .iter()
                .flat_map(|k| tokenize_keyword_variants(&index, k)),
        )
    }

    /// Aho-Corasick failure links via BFS from the root.
    fn fill_fail_links(&mut self) {
        let mut queue: std::collections::VecDeque<usize> =
            self.nodes[0].next.values().copied().collect();
        while let Some(current) = queue.pop_front() {
            let children: Vec<(i32, usize)> = self.nodes[current]
                .next
                .iter()
                .map(|(&t, &c)| (t, c))
                .collect();
            for (token, child) in children {
                let mut fail = self.nodes[current].fail;
                while fail != 0 && !self.nodes[fail].next.contains_key(&token) {
                    fail = self.nodes[fail].fail;
                }
                self.nodes[child].fail = self.nodes[fail]
                    .next
                    .get(&token)
                    .copied()
                    .filter(|&n| n != child)
                    .unwrap_or(0);
                queue.push_back(child);
            }
        }
    }

    /// Follow `token` from `state` (walking failure links until an arc matches),
    /// returning `(bonus, next_state)`. The bonus equals the difference in
    /// accumulated node scores, so partial matches that die out contribute
    /// nothing net. Tokens that start no keyword path land on the root.
    pub fn advance(&self, state: usize, token: i32) -> (f32, usize) {
        let mut node = state;
        while node != 0 && !self.nodes[node].next.contains_key(&token) {
            node = self.nodes[node].fail;
        }
        let next = self.nodes[node].next.get(&token).copied().unwrap_or(0);
        (self.nodes[next].node_score - self.nodes[state].node_score, next)
    }

    /// The state a hypothesis starts in, given the vocab's word-boundary
    /// convention. `boundary_token` is the standalone space token on
    /// character vocabularies: starting "post-space" lets keywords match at
    /// utterance start while still requiring a word boundary otherwise.
    /// BPE vocabularies encode word-start inside the piece itself, so the
    /// initial state is the root (`0`) for them.
    pub fn initial_state(&self, boundary_token: Option<i32>) -> usize {
        match boundary_token {
            Some(token) => self.advance(0, token).1,
            None => 0,
        }
    }

    /// For every token that would extend a keyword match from `state`, the
    /// node score it would land on (deepest match along the failure closure
    /// wins, matching `advance`). Tokens absent from the map carry bonus 0.
    /// Scoring a whole frame then only needs `logit + alpha * bonus` per
    /// candidate — the constant `-node_score(state)` term cancels.
    pub fn transitions(&self, state: usize) -> HashMap<i32, f32> {
        let mut out = HashMap::new();
        let mut node = state;
        loop {
            for (&token, &child) in &self.nodes[node].next {
                out.entry(token).or_insert(self.nodes[child].node_score);
            }
            if node == 0 {
                break;
            }
            node = self.nodes[node].fail;
        }
        out
    }

    /// Argmax over `log_softmax(logits) + alpha * bonus(state, token)` for
    /// greedy decoders (CTC frames, autoregressive next-token). Returns the
    /// winning token and the graph state it leads to; the caller decides
    /// whether the token is actually emitted (blank/repeat frames keep the
    /// previous state). Log-softmax normalizing puts every engine's outputs
    /// on the same scale as the graph scores.
    pub fn boosted_argmax(&self, logits: &[f32], state: usize, alpha: f32) -> (i32, usize) {
        self.boosted_argmax_except(logits, state, alpha, -1)
    }

    /// Same as `boosted_argmax` but never selects `exclude` — used when the
    /// top boosted token cannot emit (e.g. a CTC repeat that would collapse)
    /// and the next-best emittable boosted token should win instead.
    pub fn boosted_argmax_except(
        &self,
        logits: &[f32],
        state: usize,
        alpha: f32,
        exclude: i32,
    ) -> (i32, usize) {
        let transitions = self.transitions(state);
        let max = logits.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        let sum: f32 = logits.iter().map(|&l| (l - max).exp()).sum();
        let log_z = max + sum.ln();

        let mut best = f32::NEG_INFINITY;
        let mut best_id = -1i32;
        for (v, &l) in logits.iter().enumerate() {
            if v as i32 == exclude {
                continue;
            }
            let bonus = transitions.get(&(v as i32)).copied().unwrap_or(0.0);
            let score = l - log_z + alpha * bonus;
            if score > best {
                best = score;
                best_id = v as i32;
            }
        }
        (best_id, self.advance(state, best_id).1)
    }

    /// Whether `state` completes a keyword. Beam decoders lock a completed
    /// phrase's bonus into their permanent credit at this point.
    pub fn is_terminal(&self, state: usize) -> bool {
        self.nodes[state].terminal
    }

    #[cfg(test)]
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }
}

/// CTC greedy decode with keyword boosting — same collapse semantics and
/// result contract as `transcribe_rs::decode::ctc_greedy_decode`, but each
/// frame's argmax runs over `log_softmax(logits) + alpha * bonus` instead of
/// raw logits. The graph state only advances when a token is actually emitted
/// (blank and collapsed repeat frames keep it).
///
/// `boundary_token` is the standalone space piece on character vocabularies
/// (`initial_state` explains why); pass `None` for BPE vocabularies.
pub fn ctc_greedy_decode_boosted(
    logits: &ndarray::ArrayView3<f32>,
    logits_lengths: &[i64],
    blank_id: i64,
    graph: &KeywordGraph,
    alpha: f32,
    boundary_token: Option<i32>,
) -> Vec<transcribe_rs::decode::CtcDecoderResult> {
    let batch_size = logits.shape()[0];
    let vocab_size = logits.shape()[2];
    let mut results = Vec::with_capacity(batch_size);

    for b in 0..batch_size {
        let num_frames = logits_lengths[b] as usize;
        let mut result = transcribe_rs::decode::CtcDecoderResult {
            tokens: Vec::new(),
            timestamps: Vec::new(),
        };
        let mut prev_id: i64 = -1;
        let mut state = graph.initial_state(boundary_token);
        let mut frame_buf = vec![0f32; vocab_size];

        for t in 0..num_frames {
            for v in 0..vocab_size {
                frame_buf[v] = logits[[b, t, v]];
            }
            let (mut max_id, mut next_state) = graph.boosted_argmax(&frame_buf, state, alpha);

            // A boosted argmax that lands on the previous token can never emit
            // (it would collapse as a repeat), and keeping it would starve the
            // blank the model wants between doubled letters (the two `l`s in
            // "ball"). If the raw argmax is not the repeat, re-pick the best
            // boosted token excluding it so other keyword candidates still
            // outrank the raw choice; if the raw pick is also the repeat,
            // normal collapse semantics apply.
            if max_id as i64 == prev_id {
                let raw_id = frame_buf
                    .iter()
                    .enumerate()
                    .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
                    .map(|(idx, _)| idx as i32)
                    .unwrap_or(blank_id as i32);
                if raw_id as i64 != prev_id {
                    let (id, state2) =
                        graph.boosted_argmax_except(&frame_buf, state, alpha, max_id);
                    max_id = id;
                    next_state = state2;
                }
            }
            let max_id = max_id as i64;

            if max_id != blank_id && max_id != prev_id {
                result.tokens.push(max_id);
                result.timestamps.push(t as i32);
                state = next_state;
            }
            prev_id = max_id;
        }

        results.push(result);
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vocab() -> Vec<String> {
        // BPE-style: pieces with leading space start words.
        vec![
            "<blk>".into(),
            " K".into(),
            "ali".into(),
            "ko".into(),
            " calico".into(),
            " the".into(),
            " re".into(),
            "solver".into(),
            " ".into(),
            "a".into(),
        ]
    }

    #[test]
    fn tokenizes_longest_match() {
        let v = vocab();
        assert_eq!(tokenize_keyword(&v, "Kaliko"), Some(vec![1, 2, 3]));
        assert_eq!(tokenize_keyword(&v, "calico"), Some(vec![4]));
        assert_eq!(tokenize_keyword(&v, "unmatchable!"), None);
    }

    #[test]
    fn ctc_boost_does_not_suppress_doubled_letters() {
        // Vocab: 0=blank, 3="l" is the boosted keyword token.
        let graph = KeywordGraph::build(vec![vec![3]]).unwrap();
        // f0: l loses to b raw, wins boosted. f1: blank wins raw but l wins
        // boosted — the repeat must collapse as a blank, not starve it.
        // f2: l wins plainly and must emit a second time.
        let logits = ndarray::Array3::from_shape_vec(
            (1, 3, 4),
            vec![
                0.0f32, 0.1, 0.9, 0.8, // f0
                0.9, 0.0, 0.0, 0.85, // f1
                0.0, 0.0, 0.0, 0.9, // f2
            ],
        )
        .unwrap();
        let res = ctc_greedy_decode_boosted(&logits.view(), &[3], 0, &graph, 1.0, None);
        assert_eq!(res[0].tokens, vec![3, 3]);
    }

    #[test]
    fn advance_grants_and_refunds_bonus() {
        let v = vocab();
        let graph = KeywordGraph::from_keywords(&v, &["Kaliko".to_string()]).unwrap();
        // Emitting " K","ali","ko" collects the full path score; a competing
        // path (" calico") gets nothing.
        let (b1, s1) = graph.advance(0, 1);
        assert!(b1 > 0.0);
        let (_b2, s2) = graph.advance(s1, 2);
        let (b3, _s3) = graph.advance(s2, 3);
        assert!(b3 > b1, "deeper tokens carry the depth-scaled bonus");
        let (b4, s4) = graph.advance(s2, 5); // diverge at the last token
        assert!(b4 < 0.0, "diverging refunds the partial match");
        assert_eq!(s4, graph.advance(0, 5).1);
    }

    #[test]
    fn initial_state_uses_boundary_token() {
        // Char-style vocab: space is its own token.
        let v: Vec<String> = ["<blk>", " ", "K", "a", "l", "i", "k", "o", "b"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let graph = KeywordGraph::from_keywords(&v, &["Kaliko".to_string()]).unwrap();
        let init = graph.initial_state(Some(1));
        assert_ne!(init, 0);
        // From the post-space state, "K" starts the match.
        let (bonus, _) = graph.advance(init, 2);
        assert!(bonus > 0.0);
        // From root, "K" alone (mid-word) does not match.
        let (bonus, _) = graph.advance(0, 2);
        assert_eq!(bonus, 0.0);
    }

    #[test]
    fn parse_keywords_splits_and_dedupes() {
        let kw = parse_keywords("Kaliko, DaVinci Resolve,\ncalico, KALIKO");
        assert_eq!(kw, vec!["Kaliko", "DaVinci Resolve", "calico"]);
    }
}
