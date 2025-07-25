// use eyre::Result;
// use num::integer::div_floor;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WordTimestamp {
    pub word: String,
    pub start: f64,
    pub end: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub probability: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub words: Option<Vec<WordTimestamp>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Transcript {
    pub processing_time_sec: u64,
    pub segments: Vec<Segment>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonSegment {
    id: usize,
    seek: usize,
    start: f64,
    end: f64,
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    speaker: Option<String>,
    tokens: Vec<i32>,
    temperature: f32,
    avg_logprob: f64,
    compression_ratio: f64,
    no_speech_prob: f64,
    words: Vec<JsonWordTimestamp>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonWordTimestamp {
    word: String,
    start: f64,
    end: f64,
    probability: f32,
}

impl Transcript {
    pub fn to_json_segments(&self) -> Vec<JsonSegment> {
        self.segments
            .iter()
            .enumerate()
            .map(|(i, segment)| {
                let words = segment.words.as_ref().map(|words| {
                    words
                        .iter()
                        .map(|wt| JsonWordTimestamp {
                            word: wt.word.clone(),
                            start: wt.start,
                            end: wt.end,
                            probability: wt.probability.unwrap_or(0.0),
                        })
                        .collect()
                }).unwrap_or_default();

                JsonSegment {
                    id: i,
                    seek: 0, // This would need to be set based on your requirements
                    start: segment.start,
                    end: segment.end,
                    text: segment.text.clone(),
                    speaker: segment.speaker.clone(),
                    tokens: vec![], // Whisper tokens would need to be captured during transcription
                    temperature: 0.0, // Default value, should be set during transcription
                    avg_logprob: 0.0, // Default value, should be set during transcription
                    compression_ratio: 1.0, // Default value, should be set during transcription
                    no_speech_prob: 0.0, // Default value, should be set during transcription
                    words,
                }
            })
            .collect()
    }
}


// pub fn format_timestamp(seconds: i64, always_include_hours: bool, decimal_marker: &str) -> String {
//     assert!(seconds >= 0, "non-negative timestamp expected");
//     let mut milliseconds = seconds * 10;

//     let hours = div_floor(milliseconds, 3_600_000);
//     milliseconds -= hours * 3_600_000;

//     let minutes = div_floor(milliseconds, 60_000);
//     milliseconds -= minutes * 60_000;

//     let seconds = div_floor(milliseconds, 1_000);
//     milliseconds -= seconds * 1_000;

//     let hours_marker = if always_include_hours || hours != 0 {
//         format!("{:02}:", hours)
//     } else {
//         String::new()
//     };

//     format!("{hours_marker}{minutes:02}:{seconds:02}{decimal_marker}{milliseconds:03}")
// }


// impl Segment {
//     pub fn as_text(&self) -> String {
//         self.text.to_owned()
//     }

//     pub fn as_vtt(&self) -> String {
//         format!(
//             "{} --> {}\n{}\n",
//             format_timestamp(self.start, false, "."),
//             format_timestamp(self.end, false, "."),
//             self.text.trim().replace("-->", "->")
//         )
//     }

//     pub fn as_srt(&self, index: i32) -> String {
//         format!(
//             "\n{index}\n{} --> {}\n{}\n",
//             format_timestamp(self.start, true, ","),
//             format_timestamp(self.end, true, ","),
//             self.text.trim().replace("-->", "->")
//         )
//     }
// }

// impl Transcript {
//     pub fn as_text(&self) -> String {
//         self.segments
//             .iter()
//             .fold(String::new(), |transcript, fragment| transcript + fragment.text.as_str())
//     }

//     pub fn as_json(&self) -> Result<String> {
//         Ok(serde_json::to_string_pretty(self)?)
//     }

//     pub fn as_vtt(&self) -> String {
//         self.segments
//             .iter()
//             .fold(String::new(), |transcript, fragment| transcript + fragment.as_vtt().as_str())
//     }

//     pub fn as_srt(&self) -> String {
//         self.segments
//             .iter()
//             .fold((1, String::new()), |(i, transcript), fragment| {
//                 (i + 1, transcript + fragment.as_srt(i).as_str())
//             })
//             .1
//     }
// }