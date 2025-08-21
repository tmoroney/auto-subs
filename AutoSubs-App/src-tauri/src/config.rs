use core::fmt;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]

pub struct TranscribeOptions {
    pub path: String,
    pub offset: Option<f64>,
    pub lang: Option<String>,
    pub verbose: Option<bool>,
    pub vad_model_path: Option<String>,

    pub n_threads: Option<i32>,
    pub init_prompt: Option<String>,
    pub temperature: Option<f32>,
    pub translate: Option<bool>,
    pub max_text_ctx: Option<i32>,
    pub enable_dtw: Option<bool>,
    pub max_sentence_len: Option<i32>,
    pub sampling_strategy: Option<String>,
    pub sampling_bestof_or_beam_size: Option<i32>,
}

impl fmt::Debug for TranscribeOptions {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let json_string = serde_json::to_string_pretty(self).map_err(|_| fmt::Error)?;
        write!(f, "{}", json_string)
    }
}

#[derive(Debug, Clone)]
pub struct DiarizeOptions {
    pub segment_model_path: String,
    pub embedding_model_path: String,
    pub threshold: f32,
    pub max_speakers: usize,
}
