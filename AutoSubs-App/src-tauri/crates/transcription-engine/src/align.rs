use crate::types::WordTimestamp;
use eyre::{Context, ContextCompat, Result, bail, eyre};
use ndarray::{Array2, ArrayView2, s};
use ort::session::Session;
use ort::session::builder::GraphOptimizationLevel;
use ort::value::{Tensor, ValueType};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};
use uroman::{Uroman, rom_format};

const SAMPLE_RATE: usize = 16_000;
const INPUTS_TO_LOGITS_RATIO: usize = 320;
const WINDOW_SAMPLES: usize = 30 * SAMPLE_RATE;
const CONTEXT_SAMPLES: usize = 2 * SAMPLE_RATE;
const FRAME_SECONDS: f64 = INPUTS_TO_LOGITS_RATIO as f64 / SAMPLE_RATE as f64;
const MODEL_CLASSES: usize = 31;
const MAX_DP_BYTES: usize = 512 * 1024 * 1024;

type Cancellation<'a> = Option<&'a (dyn Fn() -> bool + Send + Sync)>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AlignmentUnit {
    pub original_text: String,
    pub normalized_tokens: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AlignmentPath {
    pub labels: Vec<usize>,
    pub scores: Vec<f32>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TokenSegment {
    pub label: usize,
    pub start: usize,
    pub end: usize,
    pub score: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AlignmentSpan {
    pub start: usize,
    pub end: usize,
    pub score: f32,
}

pub struct Aligner {
    session: Session,
    vocabulary: HashMap<String, usize>,
    blank_id: usize,
    star_id: usize,
    sample_rate: usize,
    inputs_to_logits_ratio: usize,
    do_normalize: bool,
    uroman: Uroman,
}

impl Aligner {
    pub fn load(model_dir: impl AsRef<Path>) -> Result<Self> {
        let model_dir = model_dir.as_ref();
        let vocabulary = load_vocabulary(&model_dir.join("vocab.json"))?;
        let blank_id = vocabulary
            .get("<blank>")
            .copied()
            .context("vocab.json does not contain <blank>")?;
        if blank_id >= vocabulary.len() {
            bail!("blank token ID {blank_id} is outside the vocabulary");
        }
        let star_id = vocabulary.len();

        let config = read_json(&model_dir.join("config.json"))?;
        let ratio = config_ratio(&config)?;
        if ratio != INPUTS_TO_LOGITS_RATIO {
            bail!("unsupported inputs_to_logits_ratio {ratio}; expected {INPUTS_TO_LOGITS_RATIO}");
        }

        let preprocessor = read_json(&model_dir.join("preprocessor_config.json"))?;
        let sample_rate = json_usize(&preprocessor, "sampling_rate")?;
        if sample_rate != SAMPLE_RATE {
            bail!("unsupported model sample rate {sample_rate}; expected {SAMPLE_RATE}");
        }
        let do_normalize = preprocessor
            .get("do_normalize")
            .and_then(Value::as_bool)
            .context("preprocessor_config.json is missing boolean do_normalize")?;
        if !do_normalize {
            bail!("model preprocessor must enable waveform normalization");
        }

        let model_path = model_dir.join("onnx/model_int8.onnx");
        let session = Session::builder()
            .map_err(|error| eyre!("failed to create ONNX session builder: {error}"))?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|error| eyre!("failed to set ONNX optimization level: {error}"))?
            .with_intra_threads(1)
            .map_err(|error| eyre!("failed to set ONNX intra-op threads: {error}"))?
            .with_inter_threads(1)
            .map_err(|error| eyre!("failed to set ONNX inter-op threads: {error}"))?
            .commit_from_file(&model_path)
            .map_err(|error| eyre!("failed to load {}: {error}", model_path.display()))?;
        validate_session(&session, vocabulary.len())?;

        Ok(Self {
            session,
            vocabulary,
            blank_id,
            star_id,
            sample_rate,
            inputs_to_logits_ratio: ratio,
            do_normalize,
            uroman: Uroman::new(),
        })
    }

    pub fn blank_id(&self) -> usize {
        self.blank_id
    }

    pub fn star_id(&self) -> usize {
        self.star_id
    }

    pub fn vocabulary(&self) -> &HashMap<String, usize> {
        &self.vocabulary
    }

    pub fn generate_emissions(
        &mut self,
        samples: &[f32],
        cancellation: Cancellation<'_>,
    ) -> Result<Array2<f32>> {
        if samples.is_empty() {
            bail!("cannot generate emissions for empty audio");
        }
        if samples.iter().any(|sample| !sample.is_finite()) {
            bail!("audio contains non-finite samples");
        }
        if self.sample_rate != SAMPLE_RATE
            || self.inputs_to_logits_ratio != INPUTS_TO_LOGITS_RATIO
            || !self.do_normalize
        {
            bail!("aligner preprocessing metadata is inconsistent");
        }

        let mut chunks = Vec::new();
        let mut extension = 0usize;
        let chunked = samples.len() >= WINDOW_SAMPLES;
        if chunked {
            let windows = samples
                .len()
                .checked_add(WINDOW_SAMPLES - 1)
                .context("audio length overflow")?
                / WINDOW_SAMPLES;
            let padded_len = windows
                .checked_mul(WINDOW_SAMPLES)
                .and_then(|length| length.checked_add(2 * CONTEXT_SAMPLES))
                .context("padded audio length overflow")?;
            extension = windows * WINDOW_SAMPLES - samples.len();
            let mut padded = vec![0.0; padded_len];
            let end = CONTEXT_SAMPLES
                .checked_add(samples.len())
                .context("audio copy range overflow")?;
            padded[CONTEXT_SAMPLES..end].copy_from_slice(samples);
            let chunk_len = WINDOW_SAMPLES + 2 * CONTEXT_SAMPLES;
            for index in 0..windows {
                let start = index * WINDOW_SAMPLES;
                let end = start + chunk_len;
                chunks.push(padded[start..end].to_vec());
            }
        } else {
            chunks.push(samples.to_vec());
        }

        let context_frames = CONTEXT_SAMPLES / INPUTS_TO_LOGITS_RATIO;
        let window_frames = WINDOW_SAMPLES / INPUTS_TO_LOGITS_RATIO;
        let mut retained = Vec::new();
        for chunk in chunks {
            check_cancelled(cancellation)?;
            let logits = self.run_chunk(&chunk)?;
            let (start, end) = if chunked {
                let end = context_frames
                    .checked_add(window_frames)
                    .context("frame trim range overflow")?;
                if logits.nrows() < end {
                    bail!(
                        "model returned {} frames, fewer than required chunk trim endpoint {end}",
                        logits.nrows()
                    );
                }
                (context_frames, end)
            } else {
                (0, logits.nrows())
            };
            retained.extend(logits.slice(s![start..end, ..]).iter().copied());
        }

        let mut frames = retained.len() / MODEL_CLASSES;
        if retained.len() % MODEL_CLASSES != 0 {
            bail!("stitched logits are not rectangular");
        }
        if extension > 0 {
            let trim = extension / INPUTS_TO_LOGITS_RATIO;
            frames = frames
                .checked_sub(trim)
                .context("final extension exceeds generated frames")?;
            retained.truncate(frames * MODEL_CLASSES);
        }
        let logits = Array2::from_shape_vec((frames, MODEL_CLASSES), retained)
            .context("failed to shape stitched logits")?;
        augment_log_probs(logits.view(), self.star_id)
    }

    pub fn prepare_text(&self, text: &str, language: Option<&str>) -> Result<Vec<AlignmentUnit>> {
        prepare_text_with(&self.uroman, &self.vocabulary, text, language)
    }

    pub fn align_words(
        &mut self,
        samples: &[i16],
        text: &str,
        language: Option<&str>,
        cancellation: Cancellation<'_>,
    ) -> Result<Vec<WordTimestamp>> {
        check_cancelled(cancellation)?;
        let normalized = normalize_samples(samples);
        if normalized.is_empty() {
            bail!("cannot align empty audio");
        }
        let units = self.prepare_text(text, language)?;
        let (targets, unit_ranges) = build_targets(&units, self.star_id)?;
        let emissions = self.generate_emissions(&normalized, cancellation)?;
        let path = forced_align(emissions.view(), &targets, self.blank_id, cancellation)?;
        let segments = merge_repeats(&path)?;
        let spans = get_spans(&targets, &segments, self.blank_id)?;
        if spans.len() != targets.len() {
            bail!(
                "alignment produced {} spans for {} targets",
                spans.len(),
                targets.len()
            );
        }

        let mut words = Vec::with_capacity(units.len());
        for (unit, range) in units.iter().zip(unit_ranges) {
            let selected = spans
                .get(range.clone())
                .context("unit span range is outside aligned targets")?;
            let start = selected
                .first()
                .context("alignment unit has no spans")?
                .start;
            let end = selected.last().context("alignment unit has no spans")?.end;
            let score_sum: f32 = selected.iter().map(|span| span.score).sum();
            let probability = (score_sum / selected.len() as f32).exp().clamp(0.0, 1.0);
            words.push(WordTimestamp {
                text: unit.original_text.clone(),
                start: start as f64 * FRAME_SECONDS,
                end: end as f64 * FRAME_SECONDS,
                probability: Some(probability),
            });
        }
        Ok(words)
    }

    fn run_chunk(&mut self, samples: &[f32]) -> Result<Array2<f32>> {
        let tensor = Tensor::from_array(([1usize, samples.len()], samples.to_vec()))
            .map_err(|error| eyre!("failed to prepare input_values: {error}"))?;
        let outputs = self
            .session
            .run(ort::inputs!["input_values" => tensor])
            .map_err(|error| eyre!("ONNX aligner inference failed: {error}"))?;
        let output = outputs
            .get("logits")
            .or_else(|| outputs.get("output_0"))
            .context("ONNX aligner output 'logits' was not found")?;
        let (shape, data) = output
            .try_extract_tensor::<f32>()
            .map_err(|error| eyre!("failed to extract aligner logits: {error}"))?;
        if shape.len() != 3 || shape[0] != 1 || shape[2] != MODEL_CLASSES as i64 {
            bail!("expected logits shape [1,T,{MODEL_CLASSES}], got {shape:?}");
        }
        let frames =
            usize::try_from(shape[1]).context("negative or oversized logits frame count")?;
        let expected = frames
            .checked_mul(MODEL_CLASSES)
            .context("logits element count overflow")?;
        if data.len() != expected {
            bail!("logits contain {} values, expected {expected}", data.len());
        }
        if data.iter().any(|value| !value.is_finite()) {
            bail!("model returned non-finite logits");
        }
        Array2::from_shape_vec((frames, MODEL_CLASSES), data.to_vec())
            .context("failed to shape model logits")
    }
}

pub fn load_vocabulary(path: &Path) -> Result<HashMap<String, usize>> {
    let value = read_json(path)?;
    let object = value
        .as_object()
        .context("vocab.json must contain a token-to-ID object")?;
    if object.len() != MODEL_CLASSES {
        bail!(
            "vocab.json contains {} entries; expected {MODEL_CLASSES}",
            object.len()
        );
    }
    let mut vocabulary = HashMap::with_capacity(object.len());
    let mut ids = HashSet::with_capacity(object.len());
    for (token, value) in object {
        let raw = value
            .as_u64()
            .ok_or_else(|| eyre!("vocabulary ID for {token:?} is not an unsigned integer"))?;
        let id = usize::try_from(raw).context("vocabulary ID does not fit usize")?;
        if id >= MODEL_CLASSES {
            bail!("vocabulary ID {id} for {token:?} is outside 0..{MODEL_CLASSES}");
        }
        if !ids.insert(id) {
            bail!("duplicate vocabulary ID {id}");
        }
        let normalized_token = token.to_lowercase();
        if vocabulary.insert(normalized_token.clone(), id).is_some() {
            bail!("duplicate vocabulary token after lowercasing: {normalized_token:?}");
        }
    }
    if vocabulary.len() != MODEL_CLASSES
        || ids.len() != MODEL_CLASSES
        || !(0..MODEL_CLASSES).all(|id| ids.contains(&id))
    {
        bail!("vocabulary IDs must cover every value in 0..{MODEL_CLASSES}");
    }
    Ok(vocabulary)
}

pub fn normalize_samples(samples: &[i16]) -> Vec<f32> {
    if samples.is_empty() {
        return Vec::new();
    }
    let mut normalized: Vec<f32> = samples
        .iter()
        .map(|sample| *sample as f32 / 32768.0)
        .collect();
    let mean = normalized.iter().map(|value| *value as f64).sum::<f64>() / normalized.len() as f64;
    let variance = normalized
        .iter()
        .map(|value| {
            let difference = *value as f64 - mean;
            difference * difference
        })
        .sum::<f64>()
        / normalized.len() as f64;
    let denominator = (variance + 1e-7).sqrt() as f32;
    for value in &mut normalized {
        *value = (*value - mean as f32) / denominator;
    }
    normalized
}

pub fn log_softmax(logits: ArrayView2<'_, f32>) -> Result<Array2<f32>> {
    if logits.nrows() == 0 || logits.ncols() == 0 {
        bail!("logits must have non-empty frame and class dimensions");
    }
    if logits.iter().any(|value| !value.is_finite()) {
        bail!("logits contain non-finite values");
    }
    let mut result = Array2::zeros(logits.raw_dim());
    for (mut output, input) in result.rows_mut().into_iter().zip(logits.rows()) {
        let maximum = input.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        let sum = input
            .iter()
            .map(|value| (*value - maximum).exp())
            .sum::<f32>();
        let normalizer = maximum + sum.ln();
        for (destination, source) in output.iter_mut().zip(input) {
            *destination = *source - normalizer;
        }
    }
    Ok(result)
}

pub fn augment_log_probs(logits: ArrayView2<'_, f32>, star_id: usize) -> Result<Array2<f32>> {
    if star_id != logits.ncols() {
        bail!(
            "synthetic star ID {star_id} must equal model class count {}",
            logits.ncols()
        );
    }
    let normalized = log_softmax(logits)?;
    let mut emissions = Array2::zeros((normalized.nrows(), normalized.ncols() + 1));
    emissions.slice_mut(s![.., ..star_id]).assign(&normalized);
    Ok(emissions)
}

pub fn forced_align(
    log_probs: ArrayView2<'_, f32>,
    targets: &[usize],
    blank: usize,
    cancellation: Cancellation<'_>,
) -> Result<AlignmentPath> {
    let frames = log_probs.nrows();
    let classes = log_probs.ncols();
    if frames == 0 || classes == 0 {
        bail!("log probabilities must be non-empty");
    }
    if log_probs.iter().any(|value| !value.is_finite()) {
        bail!("log probabilities contain non-finite values");
    }
    if targets.is_empty() {
        bail!("alignment target must not be empty");
    }
    if blank >= classes {
        bail!("blank ID {blank} is outside {classes} classes");
    }
    for &target in targets {
        if target >= classes {
            bail!("target ID {target} is outside {classes} classes");
        }
        if target == blank {
            bail!("alignment target must not contain blank ID {blank}");
        }
    }
    let repeats = targets.windows(2).filter(|pair| pair[0] == pair[1]).count();
    let required = targets
        .len()
        .checked_add(repeats)
        .context("target feasibility bound overflow")?;
    if frames < required {
        bail!(
            "{frames} frames cannot align {} targets with {repeats} adjacent repeats",
            targets.len()
        );
    }

    let states = targets
        .len()
        .checked_mul(2)
        .and_then(|value| value.checked_add(1))
        .context("expanded target state count overflow")?;
    let backtrace_len = frames
        .checked_mul(states)
        .context("alignment workspace size overflow")?;
    let bytes = backtrace_len
        .checked_mul(std::mem::size_of::<u8>())
        .and_then(|value| {
            value.checked_add(
                states
                    .checked_mul(2)?
                    .checked_mul(std::mem::size_of::<f32>())?,
            )
        })
        .context("alignment workspace byte count overflow")?;
    if bytes > MAX_DP_BYTES {
        bail!("alignment workspace requires {bytes} bytes, exceeding {MAX_DP_BYTES} byte limit");
    }
    check_cancelled(cancellation)?;

    let mut backtrace = vec![u8::MAX; backtrace_len];
    let mut previous = vec![f32::NEG_INFINITY; states];
    let mut current = vec![f32::NEG_INFINITY; states];
    previous[0] = log_probs[(0, blank)];
    if states > 1 {
        previous[1] = log_probs[(0, targets[0])];
    }

    for frame in 1..frames {
        if frame & 63 == 0 {
            check_cancelled(cancellation)?;
        }
        current.fill(f32::NEG_INFINITY);
        let max_state = (2 * frame + 1).min(states - 1);
        for state in 0..=max_state {
            let label = if state % 2 == 0 {
                blank
            } else {
                targets[state / 2]
            };
            let mut best = previous[state];
            let mut step = 0u8;
            if state >= 1 && previous[state - 1] > best {
                best = previous[state - 1];
                step = 1;
            }
            if state >= 2
                && state % 2 == 1
                && targets[state / 2] != targets[state / 2 - 1]
                && previous[state - 2] > best
            {
                best = previous[state - 2];
                step = 2;
            }
            if best.is_finite() {
                current[state] = best + log_probs[(frame, label)];
                backtrace[frame * states + state] = step;
            }
        }
        std::mem::swap(&mut previous, &mut current);
    }

    let last_blank = states - 1;
    let last_token = states - 2;
    let mut state = if previous[last_token] >= previous[last_blank] {
        last_token
    } else {
        last_blank
    };
    if !previous[state].is_finite() {
        bail!("no valid CTC alignment path exists");
    }
    let mut labels = vec![blank; frames];
    let mut scores = vec![0.0; frames];
    for frame in (0..frames).rev() {
        let label = if state % 2 == 0 {
            blank
        } else {
            targets[state / 2]
        };
        labels[frame] = label;
        scores[frame] = log_probs[(frame, label)];
        if frame > 0 {
            let step = backtrace[frame * states + state];
            if step == u8::MAX || usize::from(step) > state {
                bail!("invalid CTC traceback at frame {frame}, state {state}");
            }
            state -= usize::from(step);
        }
    }
    if state > 1 {
        bail!("CTC traceback did not reach an initial state");
    }
    Ok(AlignmentPath { labels, scores })
}

pub fn merge_repeats(path: &AlignmentPath) -> Result<Vec<TokenSegment>> {
    if path.labels.is_empty() || path.labels.len() != path.scores.len() {
        bail!("alignment path labels and scores must be non-empty and equally sized");
    }
    if path.scores.iter().any(|score| !score.is_finite()) {
        bail!("alignment path contains non-finite scores");
    }
    let mut segments = Vec::new();
    let mut start = 0usize;
    while start < path.labels.len() {
        let label = path.labels[start];
        let mut end = start + 1;
        while end < path.labels.len() && path.labels[end] == label {
            end += 1;
        }
        let score = path.scores[start..end].iter().sum::<f32>() / (end - start) as f32;
        segments.push(TokenSegment {
            label,
            start,
            end,
            score,
        });
        start = end;
    }
    Ok(segments)
}

pub fn get_spans(
    targets: &[usize],
    segments: &[TokenSegment],
    blank: usize,
) -> Result<Vec<AlignmentSpan>> {
    if targets.is_empty() || segments.is_empty() {
        bail!("targets and segments must be non-empty");
    }
    let mut target_segments = Vec::with_capacity(targets.len());
    let mut target_index = 0usize;
    for (segment_index, segment) in segments.iter().enumerate() {
        if segment.end <= segment.start {
            bail!("segment {segment_index} has an invalid frame range");
        }
        if segment.label == blank {
            continue;
        }
        let expected = targets
            .get(target_index)
            .copied()
            .context("alignment path contains more non-blank runs than targets")?;
        if segment.label != expected {
            bail!(
                "alignment run {} has label {}, expected {expected}",
                segment_index,
                segment.label
            );
        }
        target_segments.push(segment_index);
        target_index += 1;
    }
    if target_index != targets.len() {
        bail!(
            "alignment path contains {target_index} target runs, expected {}",
            targets.len()
        );
    }

    let mut spans = Vec::with_capacity(targets.len());
    for (index, &segment_index) in target_segments.iter().enumerate() {
        let segment = &segments[segment_index];
        let mut start = segment.start;
        let mut end = segment.end;
        let mut weighted_score = segment.score * (segment.end - segment.start) as f32;
        let mut score_frames = segment.end - segment.start;
        if segment_index > 0 && segments[segment_index - 1].label == blank {
            let previous = &segments[segment_index - 1];
            let padded_start = if index == 0 {
                previous.start
            } else {
                (previous.start + previous.end) / 2
            };
            if padded_start < start {
                weighted_score += previous.score * (start - padded_start) as f32;
                score_frames += start - padded_start;
                start = padded_start;
            }
        }
        if segment_index + 1 < segments.len() && segments[segment_index + 1].label == blank {
            let next = &segments[segment_index + 1];
            let padded_end = if index + 1 == targets.len() {
                next.end
            } else {
                (next.start + next.end) / 2
            };
            if padded_end > end {
                weighted_score += next.score * (padded_end - end) as f32;
                score_frames += padded_end - end;
                end = padded_end;
            }
        }
        spans.push(AlignmentSpan {
            start,
            end,
            score: weighted_score / score_frames as f32,
        });
    }
    Ok(spans)
}

pub fn iso_639_3(language: Option<&str>) -> Option<&'static str> {
    let code = language?.trim().to_ascii_lowercase();
    match code.as_str() {
        "af" | "afr" => Some("afr"),
        "sq" | "sqi" | "alb" => Some("sqi"),
        "am" | "amh" => Some("amh"),
        "ar" | "ara" | "arb" => Some("ara"),
        "hy" | "hye" | "arm" => Some("hye"),
        "as" | "asm" => Some("asm"),
        "az" | "aze" => Some("aze"),
        "eu" | "eus" | "baq" => Some("eus"),
        "ba" | "bak" => Some("bak"),
        "be" | "bel" => Some("bel"),
        "bn" | "ben" => Some("ben"),
        "bs" | "bos" => Some("bos"),
        "br" | "bre" => Some("bre"),
        "bg" | "bul" => Some("bul"),
        "yue" => Some("yue"),
        "ca" | "cat" => Some("cat"),
        "zh" | "zho" | "chi" | "cmn" | "zh-cn" | "zh-tw" => Some("zho"),
        "hr" | "hrv" => Some("hrv"),
        "cs" | "ces" | "cze" => Some("ces"),
        "da" | "dan" => Some("dan"),
        "nl" | "nld" | "dut" => Some("nld"),
        "en" | "eng" => Some("eng"),
        "et" | "est" => Some("est"),
        "fo" | "fao" => Some("fao"),
        "fi" | "fin" => Some("fin"),
        "fr" | "fra" | "fre" => Some("fra"),
        "gl" | "glg" => Some("glg"),
        "ka" | "kat" | "geo" => Some("kat"),
        "de" | "deu" | "ger" => Some("deu"),
        "el" | "ell" | "gre" => Some("ell"),
        "gu" | "guj" => Some("guj"),
        "ht" | "hat" => Some("hat"),
        "ha" | "hau" => Some("hau"),
        "haw" => Some("haw"),
        "he" | "heb" => Some("heb"),
        "hi" | "hin" => Some("hin"),
        "hu" | "hun" => Some("hun"),
        "is" | "isl" | "ice" => Some("isl"),
        "id" | "ind" => Some("ind"),
        "it" | "ita" => Some("ita"),
        "ja" | "jpn" => Some("jpn"),
        "jw" | "jv" | "jav" => Some("jav"),
        "kn" | "kan" => Some("kan"),
        "kk" | "kaz" => Some("kaz"),
        "km" | "khm" => Some("khm"),
        "ko" | "kor" => Some("kor"),
        "lo" | "lao" => Some("lao"),
        "la" | "lat" => Some("lat"),
        "lv" | "lav" => Some("lav"),
        "lt" | "lit" => Some("lit"),
        "ln" | "lin" => Some("lin"),
        "lb" | "ltz" => Some("ltz"),
        "mk" | "mkd" | "mac" => Some("mkd"),
        "mg" | "mlg" => Some("mlg"),
        "ms" | "msa" | "may" => Some("msa"),
        "ml" | "mal" => Some("mal"),
        "mt" | "mlt" => Some("mlt"),
        "mi" | "mri" | "mao" => Some("mri"),
        "mr" | "mar" => Some("mar"),
        "mn" | "mon" => Some("mon"),
        "my" | "mya" | "bur" => Some("mya"),
        "ne" | "nep" => Some("nep"),
        "no" | "nor" => Some("nor"),
        "nn" | "nno" => Some("nno"),
        "oc" | "oci" => Some("oci"),
        "ps" | "pus" => Some("pus"),
        "fa" | "fas" | "per" => Some("fas"),
        "pl" | "pol" => Some("pol"),
        "pt" | "por" => Some("por"),
        "pa" | "pan" => Some("pan"),
        "ro" | "ron" | "rum" => Some("ron"),
        "ru" | "rus" => Some("rus"),
        "sa" | "san" => Some("san"),
        "sr" | "srp" => Some("srp"),
        "sn" | "sna" => Some("sna"),
        "sd" | "snd" => Some("snd"),
        "si" | "sin" => Some("sin"),
        "sk" | "slk" | "slo" => Some("slk"),
        "sl" | "slv" => Some("slv"),
        "so" | "som" => Some("som"),
        "es" | "spa" => Some("spa"),
        "su" | "sun" => Some("sun"),
        "sw" | "swa" => Some("swa"),
        "sv" | "swe" => Some("swe"),
        "tl" | "fil" | "tgl" => Some("fil"),
        "tg" | "tgk" => Some("tgk"),
        "ta" | "tam" => Some("tam"),
        "tt" | "tat" => Some("tat"),
        "te" | "tel" => Some("tel"),
        "th" | "tha" => Some("tha"),
        "bo" | "bod" | "tib" => Some("bod"),
        "tr" | "tur" => Some("tur"),
        "tk" | "tuk" => Some("tuk"),
        "uk" | "ukr" => Some("ukr"),
        "ur" | "urd" => Some("urd"),
        "uz" | "uzb" => Some("uzb"),
        "vi" | "vie" => Some("vie"),
        "cy" | "cym" | "wel" => Some("cym"),
        "yi" | "yid" => Some("yid"),
        "yo" | "yor" => Some("yor"),
        "auto" | "und" | "" => None,
        _ => None,
    }
}

fn prepare_text_with(
    uroman: &Uroman,
    vocabulary: &HashMap<String, usize>,
    text: &str,
    language: Option<&str>,
) -> Result<Vec<AlignmentUnit>> {
    if text.trim().is_empty() {
        bail!("transcript is empty or whitespace-only");
    }
    let iso = iso_639_3(language);
    let is_cjk = matches!(iso, Some("jpn" | "zho" | "yue"));
    let source_units = split_display_units(text, is_cjk);
    let mut units = Vec::new();
    for original_text in source_units {
        let normalized = normalize_text_unit(&original_text);
        if normalized.is_empty() {
            continue;
        }
        let romanized = uroman
            .romanize_string::<rom_format::Str>(&normalized, iso)
            .to_string();
        let filtered = filter_romanized(&romanized);
        if filtered.is_empty() {
            if is_cjk {
                units.push(AlignmentUnit {
                    original_text,
                    normalized_tokens: vec![vocabulary.len()],
                });
            }
            continue;
        }
        let mut normalized_tokens = Vec::new();
        for character in filtered
            .chars()
            .filter(|character| !character.is_whitespace())
        {
            let token = character.to_string();
            let id = vocabulary.get(&token).copied().ok_or_else(|| {
                eyre!("normalized character {character:?} is not in the model vocabulary")
            })?;
            normalized_tokens.push(id);
        }
        if !normalized_tokens.is_empty() {
            units.push(AlignmentUnit {
                original_text,
                normalized_tokens,
            });
        }
    }
    if units.is_empty() {
        bail!("transcript contains no alignable text after normalization");
    }
    Ok(units)
}

fn split_display_units(text: &str, character_units: bool) -> Vec<String> {
    let mut units = Vec::new();
    let mut pending_space = String::new();
    if character_units {
        for character in text.chars() {
            if character.is_whitespace() {
                pending_space.push(character);
            } else {
                let mut unit = std::mem::take(&mut pending_space);
                unit.push(character);
                units.push(unit);
            }
        }
    } else {
        let mut current = String::new();
        for character in text.chars() {
            if character.is_whitespace() {
                if !current.is_empty() {
                    units.push(std::mem::take(&mut current));
                }
                pending_space.push(character);
            } else {
                if current.is_empty() {
                    current.push_str(&pending_space);
                    pending_space.clear();
                }
                current.push(character);
            }
        }
        if !current.is_empty() {
            units.push(current);
        }
    }
    units
}

fn normalize_text_unit(text: &str) -> String {
    let text = remove_numeric_parentheticals(text);
    let mapped: String = text
        .nfkc()
        .flat_map(char::to_lowercase)
        .map(|character| match character {
            '\u{2018}' | '\u{2019}' | '\u{201b}' | '\u{02bc}' => '\'',
            '\u{066c}' | '\u{060c}' | '\u{061b}' | '\u{061f}' | '\u{0964}' | '\u{3001}'
            | '\u{3002}' => ' ',
            '\u{200b}' | '\u{200c}' | '\u{200d}' | '\u{200e}' | '\u{200f}' | '\u{202a}'
            | '\u{202c}' | '\u{0640}' => '\0',
            other => other,
        })
        .filter(|character| *character != '\0' && !is_combining_mark(*character))
        .map(|character| {
            if is_punctuation(character) {
                ' '
            } else {
                character
            }
        })
        .collect();
    let mut words = Vec::new();
    for word in mapped.split_whitespace() {
        if word.chars().all(is_numeric_character) {
            continue;
        }
        words.push(word);
    }
    words.join(" ")
}

fn remove_numeric_parentheticals(text: &str) -> String {
    let characters: Vec<char> = text.chars().collect();
    let mut output = String::with_capacity(text.len());
    let mut index = 0usize;
    while index < characters.len() {
        if characters[index] == '(' {
            if let Some(relative_end) = characters[index + 1..]
                .iter()
                .position(|character| *character == ')')
            {
                let end = index + relative_end + 1;
                if characters[index + 1..end]
                    .iter()
                    .any(|character| character.is_numeric())
                {
                    output.push(' ');
                    index = end + 1;
                    continue;
                }
            }
        }
        output.push(characters[index]);
        index += 1;
    }
    output
}

fn filter_romanized(text: &str) -> String {
    let mut output = String::new();
    let mut previous_space = true;
    for character in text.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_lowercase() || character == '\'' {
            output.push(character);
            previous_space = false;
        } else if character.is_whitespace() && !previous_space {
            output.push(' ');
            previous_space = true;
        }
    }
    output.trim().to_string()
}

fn is_numeric_character(character: char) -> bool {
    character.is_numeric() || matches!(character, '\u{2170}'..='\u{2179}' | '\u{ff10}'..='\u{ff19}')
}

fn is_punctuation(character: char) -> bool {
    if character == '\'' {
        return false;
    }
    character.is_ascii_punctuation()
        || matches!(
            character,
            '\u{00a1}' | '\u{00ab}' | '\u{00bb}' | '\u{00bf}'
                | '\u{055a}'..='\u{055f}' | '\u{0589}' | '\u{2000}'..='\u{206f}'
                | '\u{2500}' | '\u{3000}'..='\u{303f}' | '\u{fe4f}'
                | '\u{ff01}'..='\u{ff0f}' | '\u{ff1a}'..='\u{ff20}'
                | '\u{ff3b}'..='\u{ff40}' | '\u{ff5b}'..='\u{ff65}'
        )
}

fn build_targets(
    units: &[AlignmentUnit],
    star_id: usize,
) -> Result<(Vec<usize>, Vec<std::ops::Range<usize>>)> {
    let target_capacity = units
        .iter()
        .try_fold(0usize, |total, unit| {
            total
                .checked_add(1)?
                .checked_add(unit.normalized_tokens.len())
        })
        .context("target length overflow")?;
    let mut targets = Vec::with_capacity(target_capacity);
    let mut ranges = Vec::with_capacity(units.len());
    for unit in units {
        targets.push(star_id);
        let start = targets.len();
        targets.extend_from_slice(&unit.normalized_tokens);
        ranges.push(start..targets.len());
    }
    Ok((targets, ranges))
}

fn read_json(path: &Path) -> Result<Value> {
    let contents =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    serde_json::from_str(&contents).with_context(|| format!("failed to parse {}", path.display()))
}

fn json_usize(value: &Value, key: &str) -> Result<usize> {
    let raw = value
        .get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| eyre!("configuration is missing unsigned integer {key}"))?;
    usize::try_from(raw).with_context(|| format!("configuration value {key} does not fit usize"))
}

fn config_ratio(config: &Value) -> Result<usize> {
    if let Some(value) = config.get("inputs_to_logits_ratio").and_then(Value::as_u64) {
        return usize::try_from(value).context("inputs_to_logits_ratio does not fit usize");
    }
    let strides = config
        .get("conv_stride")
        .and_then(Value::as_array)
        .context("config.json has neither inputs_to_logits_ratio nor conv_stride")?;
    strides.iter().try_fold(1usize, |ratio, stride| {
        let stride = stride
            .as_u64()
            .context("conv_stride entries must be unsigned integers")?;
        ratio
            .checked_mul(usize::try_from(stride).context("conv_stride does not fit usize")?)
            .context("convolution stride product overflow")
    })
}

fn validate_session(session: &Session, classes: usize) -> Result<()> {
    let input = session
        .inputs()
        .iter()
        .find(|input| input.name() == "input_values")
        .context("ONNX model does not have input_values input")?;
    match input.dtype() {
        ValueType::Tensor { shape, .. } if shape.len() == 2 => {}
        other => bail!("input_values must be a rank-2 tensor, got {other:?}"),
    }
    let output = session
        .outputs()
        .iter()
        .find(|output| output.name() == "logits" || output.name() == "output_0")
        .context("ONNX model does not have logits output")?;
    match output.dtype() {
        ValueType::Tensor { shape, .. } if shape.len() == 3 => {
            let output_classes = shape[2];
            if output_classes >= 0 && output_classes != classes as i64 {
                bail!(
                    "model declares {output_classes} output classes, but vocabulary has {classes}"
                );
            }
        }
        other => bail!("logits must be a rank-3 tensor, got {other:?}"),
    }
    Ok(())
}

fn check_cancelled(cancellation: Cancellation<'_>) -> Result<()> {
    if cancellation.is_some_and(|is_cancelled| is_cancelled()) {
        bail!("Alignment cancelled");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::array;
    use std::sync::atomic::{AtomicBool, Ordering};

    fn vocabulary() -> HashMap<String, usize> {
        let mut vocabulary = HashMap::new();
        vocabulary.insert("<blank>".to_string(), 0);
        for (index, character) in ('a'..='z').enumerate() {
            vocabulary.insert(character.to_string(), index + 1);
        }
        vocabulary.insert("'".to_string(), 27);
        vocabulary.insert("|".to_string(), 28);
        vocabulary.insert("<unk>".to_string(), 29);
        vocabulary.insert("<pad>".to_string(), 30);
        vocabulary
    }

    #[test]
    fn sample_normalization_matches_golden_values() {
        let result = normalize_samples(&[-32768, 0, 32767]);
        let expected = [-1.2247635, 0.00001246, 1.224751];
        for (actual, expected) in result.iter().zip(expected) {
            assert!((actual - expected).abs() < 2e-5, "{actual} != {expected}");
        }
        assert_eq!(normalize_samples(&[0, 0, 0]), vec![0.0; 3]);
        assert!(normalize_samples(&[]).is_empty());
    }

    #[test]
    fn log_softmax_and_star_column_match_golden_matrix() {
        let logits = array![[1.0, 2.0, 3.0], [1000.0, 1000.0, 999.0]];
        let result = augment_log_probs(logits.view(), 3).expect("augmentation should succeed");
        let expected = array![
            [-2.407606, -1.407606, -0.407606, 0.0],
            [-0.861995, -0.861995, -1.861995, 0.0]
        ];
        assert_eq!(result.dim(), (2, 4));
        for (actual, expected) in result.iter().zip(expected.iter()) {
            assert!((actual - expected).abs() < 1e-5);
            assert!(actual.is_finite());
        }
        assert!(log_softmax(array![[f32::NAN]].view()).is_err());
    }

    #[test]
    fn forced_alignment_matches_golden_normal_path() {
        let emissions = array![
            [-0.1, -3.0, -4.0],
            [-2.0, -0.1, -4.0],
            [-0.2, -2.0, -3.0],
            [-2.0, -3.0, -0.1],
            [-0.1, -3.0, -2.0]
        ];
        let result =
            forced_align(emissions.view(), &[1, 2], 0, None).expect("alignment should succeed");
        assert_eq!(result.labels, vec![0, 1, 0, 2, 0]);
        assert_eq!(result.scores, vec![-0.1, -0.1, -0.2, -0.1, -0.1]);
    }

    #[test]
    fn forced_alignment_handles_repeats_blank_heavy_and_star() {
        let repeated = array![[-2.0, -0.1], [-0.1, -3.0], [-3.0, -0.1]];
        let result = forced_align(repeated.view(), &[1, 1], 0, None).expect("repeat should align");
        assert_eq!(result.labels, vec![1, 0, 1]);

        let blank_heavy = array![
            [-0.1, -4.0, -4.0],
            [-0.1, -3.0, -4.0],
            [-2.0, -0.1, -4.0],
            [-0.1, -3.0, -4.0],
            [-0.1, -4.0, -3.0],
            [-2.0, -4.0, -0.1],
            [-0.1, -4.0, -3.0]
        ];
        let result = forced_align(blank_heavy.view(), &[1, 2], 0, None)
            .expect("blank-heavy path should align");
        assert_eq!(result.labels, vec![0, 0, 1, 0, 0, 2, 0]);

        let star = array![[-2.0, 0.0], [-2.0, 0.0], [-0.1, 0.0]];
        let result = forced_align(star.view(), &[1], 0, None).expect("star target should align");
        assert_eq!(result.labels, vec![1, 1, 1]);
    }

    #[test]
    fn forced_alignment_rejects_invalid_and_cancelled_inputs() {
        let emissions = Array2::zeros((2, 3));
        assert!(forced_align(emissions.view(), &[], 0, None).is_err());
        assert!(forced_align(emissions.view(), &[0], 0, None).is_err());
        assert!(forced_align(emissions.view(), &[3], 0, None).is_err());
        assert!(forced_align(emissions.view(), &[1, 1], 0, None).is_err());
        assert!(forced_align(emissions.view(), &[1], 3, None).is_err());
        let cancelled = AtomicBool::new(true);
        let callback = || cancelled.load(Ordering::Relaxed);
        assert!(forced_align(emissions.view(), &[1], 0, Some(&callback)).is_err());
        assert!(Array2::<f32>::from_shape_vec((usize::MAX, 2), Vec::new()).is_err());
    }

    #[test]
    fn merge_and_midpoint_spans_match_golden_output() {
        let path = AlignmentPath {
            labels: vec![0, 0, 1, 1, 0, 0, 0, 2, 0, 0],
            scores: vec![-0.2, -0.2, -0.1, -0.3, -0.4, -0.4, -0.4, -0.2, -0.5, -0.5],
        };
        let segments = merge_repeats(&path).expect("merge should succeed");
        assert_eq!(
            segments
                .iter()
                .map(|segment| (segment.label, segment.start, segment.end))
                .collect::<Vec<_>>(),
            vec![(0, 0, 2), (1, 2, 4), (0, 4, 7), (2, 7, 8), (0, 8, 10)]
        );
        let spans = get_spans(&[1, 2], &segments, 0).expect("span extraction should succeed");
        assert_eq!((spans[0].start, spans[0].end), (0, 5));
        assert_eq!((spans[1].start, spans[1].end), (5, 10));
        assert!((spans[0].score - -0.24).abs() < 1e-6);
        assert!((spans[1].score - -0.4).abs() < 1e-6);
    }

    #[test]
    fn normalization_covers_latin_apostrophes_digits_and_punctuation() {
        assert_eq!(normalize_text_unit(" HéLLo,  WORLD! "), "héllo world");
        assert_eq!(normalize_text_unit("l’amour"), "l'amour");
        assert_eq!(normalize_text_unit("123"), "");
        assert_eq!(normalize_text_unit("version2"), "version2");
        assert_eq!(normalize_text_unit("(Sam 23:17)"), "");
    }

    #[test]
    fn language_mapping_covers_selectable_aliases() {
        assert_eq!(iso_639_3(Some("en")), Some("eng"));
        assert_eq!(iso_639_3(Some("zh-CN")), Some("zho"));
        assert_eq!(iso_639_3(Some("chi")), Some("zho"));
        assert_eq!(iso_639_3(Some("jw")), Some("jav"));
        assert_eq!(iso_639_3(Some("auto")), None);
        assert_eq!(iso_639_3(Some("unknown")), None);
    }

    #[test]
    fn text_preparation_romanizes_and_preserves_display_units() {
        let uroman = Uroman::new();
        let vocabulary = vocabulary();
        let latin = prepare_text_with(&uroman, &vocabulary, "Hello, world!", Some("en"))
            .expect("Latin text should prepare");
        assert_eq!(
            latin
                .iter()
                .map(|unit| unit.original_text.as_str())
                .collect::<Vec<_>>(),
            vec!["Hello,", " world!"]
        );
        assert_eq!(latin[0].normalized_tokens, vec![8, 5, 12, 12, 15]);

        let cyrillic = prepare_text_with(&uroman, &vocabulary, "Привет", Some("ru"))
            .expect("Cyrillic text should romanize");
        assert_eq!(cyrillic[0].original_text, "Привет");
        assert!(cyrillic[0].normalized_tokens.len() >= 6);

        let arabic = prepare_text_with(&uroman, &vocabulary, "مرحبا", Some("ar"))
            .expect("Arabic text should romanize");
        assert_eq!(arabic[0].original_text, "مرحبا");
        assert!(!arabic[0].normalized_tokens.is_empty());

        let japanese = prepare_text_with(&uroman, &vocabulary, "日本", Some("ja"))
            .expect("Japanese text should prepare by character");
        assert_eq!(japanese.len(), 2);
        assert_eq!(japanese[0].original_text, "日");
        assert_eq!(japanese[1].original_text, "本");

        let chinese = prepare_text_with(&uroman, &vocabulary, "中文", Some("zh"))
            .expect("Chinese text should prepare by character");
        assert_eq!(chinese.len(), 2);
        assert_eq!(chinese[0].original_text, "中");
    }

    #[test]
    fn romanization_expansion_stays_attached_to_original_unit() {
        let units = prepare_text_with(&Uroman::new(), &vocabulary(), "ユーロマン", Some("ja"))
            .expect("Japanese should romanize");
        assert_eq!(units.len(), 5);
        assert_eq!(
            units
                .iter()
                .map(|unit| unit.original_text.clone())
                .collect::<String>(),
            "ユーロマン"
        );
        assert!(units.iter().any(|unit| unit.normalized_tokens.len() > 1));
    }

    #[test]
    fn text_preparation_rejects_unalignable_text_without_panicking() {
        let uroman = Uroman::new();
        let vocabulary = vocabulary();
        assert!(prepare_text_with(&uroman, &vocabulary, "", None).is_err());
        assert!(prepare_text_with(&uroman, &vocabulary, "   ", None).is_err());
        assert!(prepare_text_with(&uroman, &vocabulary, "!!!", None).is_err());
        assert!(prepare_text_with(&uroman, &vocabulary, "12345", None).is_err());
        assert!(prepare_text_with(&uroman, &vocabulary, "✨", None).is_err());
    }

    #[test]
    fn timestamps_use_fixed_twenty_millisecond_frames() {
        assert_eq!(FRAME_SECONDS, 0.02);
        let frame = 123_456usize;
        assert!((frame as f64 * FRAME_SECONDS - 2469.12).abs() < 1e-9);
    }
}
