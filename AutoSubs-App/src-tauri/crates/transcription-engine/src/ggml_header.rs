//! Reads the header of a whisper.cpp GGML model file.
//!
//! Imported models are fine-tunes whose file name says nothing about the model
//! they were trained from, but word timing (DTW) needs that base model: its
//! alignment heads and memory budget are keyed by name. The header carries the
//! shape of the network, which is enough to tell the base models apart.
//!
//! The layout mirrors `whisper_model_load` in whisper.cpp's `src/whisper.cpp`:
//! a little-endian u32 magic followed by eleven i32 hyperparameters.

use std::io::Read;
use std::path::Path;

/// `GGML_FILE_MAGIC` in whisper.cpp's `ggml.h` ("ggml").
const GGML_FILE_MAGIC: u32 = 0x6767_6d6c;

/// Magic plus eleven i32 hyperparameters.
pub const HEADER_LEN: usize = 4 + 11 * 4;

/// Why a file can't be used as a Whisper model. The `Display` strings are
/// stable codes the frontend maps to translated messages.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HeaderError {
    /// The file doesn't exist.
    NotFound,
    /// The file exists but couldn't be read.
    Unreadable,
    /// The file is too short or doesn't start with the GGML magic.
    NotGgml,
}

impl std::fmt::Display for HeaderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            HeaderError::NotFound => "model_file_not_found",
            HeaderError::Unreadable => "model_file_unreadable",
            HeaderError::NotGgml => "model_file_not_ggml",
        })
    }
}

impl std::error::Error for HeaderError {}

/// The hyperparameters from a GGML Whisper header.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WhisperHeader {
    pub n_vocab: i32,
    pub n_audio_ctx: i32,
    pub n_audio_state: i32,
    pub n_audio_head: i32,
    pub n_audio_layer: i32,
    pub n_text_ctx: i32,
    pub n_text_state: i32,
    pub n_text_head: i32,
    pub n_text_layer: i32,
    pub n_mels: i32,
    pub ftype: i32,
}

impl WhisperHeader {
    /// Parse the first [`HEADER_LEN`] bytes of a model file.
    pub fn parse(bytes: &[u8]) -> Result<Self, HeaderError> {
        if bytes.len() < HEADER_LEN {
            return Err(HeaderError::NotGgml);
        }
        let word = |i: usize| {
            let at = 4 + i * 4;
            i32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
        };
        let magic = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        if magic != GGML_FILE_MAGIC {
            return Err(HeaderError::NotGgml);
        }
        Ok(Self {
            n_vocab: word(0),
            n_audio_ctx: word(1),
            n_audio_state: word(2),
            n_audio_head: word(3),
            n_audio_layer: word(4),
            n_text_ctx: word(5),
            n_text_state: word(6),
            n_text_head: word(7),
            n_text_layer: word(8),
            n_mels: word(9),
            ftype: word(10),
        })
    }

    /// Read and parse the header of the file at `path`.
    pub fn read(path: &Path) -> Result<Self, HeaderError> {
        let mut file = std::fs::File::open(path).map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => HeaderError::NotFound,
            _ => HeaderError::Unreadable,
        })?;
        if !path.is_file() {
            return Err(HeaderError::Unreadable);
        }
        let mut buf = Vec::with_capacity(HEADER_LEN);
        file.by_ref()
            .take(HEADER_LEN as u64)
            .read_to_end(&mut buf)
            .map_err(|_| HeaderError::Unreadable)?;
        Self::parse(&buf)
    }

    /// Same rule as `whisper_hparams::is_multilingual` in whisper.cpp.
    pub fn is_multilingual(&self) -> bool {
        self.n_vocab >= 51865
    }

    /// The whisper.cpp model this file was built from, as one of the names the
    /// DTW presets are keyed by, or `None` when the shape matches none of them.
    ///
    /// large-v1 and large-v2 share a shape, so both map to large-v2.
    pub fn base_model(&self) -> Option<&'static str> {
        let english = match self.n_vocab {
            51864 => true,
            51865 | 51866 => false,
            _ => return None,
        };
        let name = match (self.n_audio_layer, english) {
            (4, true) => "tiny.en",
            (4, false) => "tiny",
            (6, true) => "base.en",
            (6, false) => "base",
            (12, true) => "small.en",
            (12, false) => "small",
            (24, true) => "medium.en",
            (24, false) => "medium",
            (32, false) => match (self.n_mels, self.n_text_layer) {
                (80, 32) => "large-v2",
                (128, 32) => "large-v3",
                (128, 4) => "large-v3-turbo",
                _ => return None,
            },
            _ => return None,
        };
        // Below large, the text decoder mirrors the encoder and every model
        // uses 80 mel bins; anything else is a shape the presets don't cover.
        if self.n_audio_layer < 32 && (self.n_text_layer != self.n_audio_layer || self.n_mels != 80) {
            return None;
        }
        Some(name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header(n_vocab: i32, n_audio_layer: i32, n_text_layer: i32, n_mels: i32) -> Vec<u8> {
        let mut bytes = GGML_FILE_MAGIC.to_le_bytes().to_vec();
        for v in [n_vocab, 1500, 384, 6, n_audio_layer, 448, 384, 6, n_text_layer, n_mels, 1] {
            bytes.extend_from_slice(&v.to_le_bytes());
        }
        bytes
    }

    fn base(bytes: &[u8]) -> Option<&'static str> {
        WhisperHeader::parse(bytes).unwrap().base_model()
    }

    #[test]
    fn every_size_maps_to_its_base_model() {
        assert_eq!(base(&header(51865, 4, 4, 80)), Some("tiny"));
        assert_eq!(base(&header(51865, 6, 6, 80)), Some("base"));
        assert_eq!(base(&header(51865, 12, 12, 80)), Some("small"));
        assert_eq!(base(&header(51865, 24, 24, 80)), Some("medium"));
        assert_eq!(base(&header(51865, 32, 32, 80)), Some("large-v2"));
    }

    #[test]
    fn english_only_vocab_maps_to_en_models() {
        assert_eq!(base(&header(51864, 4, 4, 80)), Some("tiny.en"));
        assert_eq!(base(&header(51864, 6, 6, 80)), Some("base.en"));
        assert_eq!(base(&header(51864, 12, 12, 80)), Some("small.en"));
        assert_eq!(base(&header(51864, 24, 24, 80)), Some("medium.en"));
        assert!(!WhisperHeader::parse(&header(51864, 12, 12, 80)).unwrap().is_multilingual());
        assert!(WhisperHeader::parse(&header(51865, 12, 12, 80)).unwrap().is_multilingual());
    }

    #[test]
    fn large_v3_and_turbo_are_told_apart() {
        assert_eq!(base(&header(51866, 32, 32, 128)), Some("large-v3"));
        assert_eq!(base(&header(51866, 32, 4, 128)), Some("large-v3-turbo"));
        assert!(WhisperHeader::parse(&header(51866, 32, 4, 128)).unwrap().is_multilingual());
    }

    #[test]
    fn unknown_shapes_have_no_base_model() {
        // Distilled model: large encoder, two decoder layers.
        assert_eq!(base(&header(51866, 32, 2, 128)), None);
        // English-only large doesn't exist.
        assert_eq!(base(&header(51864, 32, 32, 80)), None);
        // Layer count no Whisper size uses.
        assert_eq!(base(&header(51865, 8, 8, 80)), None);
        // Small encoder with a trimmed decoder.
        assert_eq!(base(&header(51865, 12, 2, 80)), None);
        // Unexpected vocabulary size.
        assert_eq!(base(&header(50000, 12, 12, 80)), None);
    }

    #[test]
    fn bad_magic_is_rejected() {
        let mut bytes = header(51865, 12, 12, 80);
        bytes[..4].copy_from_slice(b"PK\x03\x04");
        assert_eq!(WhisperHeader::parse(&bytes), Err(HeaderError::NotGgml));
    }

    #[test]
    fn truncated_header_is_rejected() {
        let bytes = header(51865, 12, 12, 80);
        assert_eq!(WhisperHeader::parse(&bytes[..HEADER_LEN - 1]), Err(HeaderError::NotGgml));
        assert_eq!(WhisperHeader::parse(&[]), Err(HeaderError::NotGgml));
    }

    #[test]
    fn reads_from_disk_and_reports_missing_files() {
        let dir = std::env::temp_dir().join(format!("ggml-header-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let good = dir.join("ggml-model.bin");
        let mut bytes = header(51865, 24, 24, 80);
        bytes.extend_from_slice(&[0u8; 64]); // tensor data follows the header
        std::fs::write(&good, &bytes).unwrap();
        assert_eq!(WhisperHeader::read(&good).unwrap().base_model(), Some("medium"));

        let short = dir.join("short.bin");
        std::fs::write(&short, &bytes[..10]).unwrap();
        assert_eq!(WhisperHeader::read(&short), Err(HeaderError::NotGgml));

        assert_eq!(WhisperHeader::read(&dir.join("missing.bin")), Err(HeaderError::NotFound));

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
