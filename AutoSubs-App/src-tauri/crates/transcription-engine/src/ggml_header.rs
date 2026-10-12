//! Reads the header of a whisper.cpp GGML model file.
//!
//! Imported models are fine-tunes whose file name says nothing about the model
//! they were trained from, but word timing (DTW) needs that base model: its
//! alignment heads and memory budget are keyed by name. The header carries the
//! shape of the network, which is enough to tell the base models apart.
//!
//! The layout mirrors `whisper_model_load` in whisper.cpp's `src/whisper.cpp`:
//! a little-endian u32 magic followed by eleven i32 hyperparameters, then the
//! mel filters, the vocabulary and the tensors.

use std::io::{Read, Seek, SeekFrom};
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
    /// The header is fine but the rest of the file isn't a complete model,
    /// typically a download that didn't finish.
    Incomplete,
}

impl std::fmt::Display for HeaderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            HeaderError::NotFound => "model_file_not_found",
            HeaderError::Unreadable => "model_file_unreadable",
            HeaderError::NotGgml => "model_file_not_ggml",
            HeaderError::Incomplete => "model_file_incomplete",
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

    /// Read the header and check that the rest of the file is a complete
    /// model, so a partial download is caught at import rather than when
    /// whisper.cpp loads it.
    ///
    /// Walks the mel filters, vocabulary and tensor headers the way
    /// `whisper_model_load` does, seeking over tensor data instead of reading
    /// it: the file must end exactly after the last tensor, and hold as many
    /// tensors as whisper.cpp expects for this shape. Tensor sizes come from
    /// ggml's own type table, so quantized files are checked the same way.
    pub fn inspect(path: &Path) -> Result<Self, HeaderError> {
        let header = Self::read(path)?;
        let file = std::fs::File::open(path).map_err(|_| HeaderError::Unreadable)?;
        let len = file.metadata().map_err(|_| HeaderError::Unreadable)?.len();
        let mut walker = Walker { inner: std::io::BufReader::with_capacity(1 << 16, file), pos: 0, len };
        walker.discard(HEADER_LEN as u64)?;
        header.check_layout(&mut walker)?;
        Ok(header)
    }

    /// The number of tensors whisper.cpp registers for this shape: seven
    /// encoder-wide and four decoder-wide, plus fifteen per encoder layer and
    /// twenty-four per decoder layer (see `whisper_model_load`).
    fn expected_tensors(&self) -> Option<u64> {
        let audio = u64::try_from(self.n_audio_layer).ok()?;
        let text = u64::try_from(self.n_text_layer).ok()?;
        Some(11 + 15 * audio + 24 * text)
    }

    fn check_layout<R: Read + Seek>(&self, r: &mut Walker<R>) -> Result<(), HeaderError> {
        let expected = self.expected_tensors().ok_or(HeaderError::Incomplete)?;

        // Mel filters: n_mel x n_fft f32 values.
        let n_mel = r.count()?;
        let n_fft = r.count()?;
        r.discard(n_mel.checked_mul(n_fft).and_then(|n| n.checked_mul(4)).ok_or(HeaderError::Incomplete)?)?;

        // Vocabulary: length-prefixed token bytes.
        for _ in 0..r.count()? {
            let len = r.i32()? as u32;
            r.discard(u64::from(len))?;
        }

        // Tensors until the end of the file.
        let mut loaded = 0u64;
        while r.remaining() > 0 {
            let n_dims = r.i32()?;
            let name_len = r.count()?;
            let ttype = r.i32()?;
            if !(1..=4).contains(&n_dims) {
                return Err(HeaderError::Incomplete);
            }
            let mut elements = 1u64;
            for _ in 0..n_dims {
                elements = elements.checked_mul(r.count()?).ok_or(HeaderError::Incomplete)?;
            }
            r.discard(name_len)?;
            r.skip(tensor_bytes(ttype, elements).ok_or(HeaderError::Incomplete)?)?;
            loaded += 1;
            if loaded > expected {
                return Err(HeaderError::Incomplete);
            }
        }
        if loaded == expected { Ok(()) } else { Err(HeaderError::Incomplete) }
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

/// A header with the given shape, for tests.
/// Bytes a tensor of `ttype` with `elements` values takes on disk, from the
/// same type table whisper.cpp sizes it with. `None` for types ggml doesn't
/// know or has retired, which whisper.cpp can't load either.
fn tensor_bytes(ttype: i32, elements: u64) -> Option<u64> {
    use whisper_rs::whisper_rs_sys as sys;
    let t = sys::ggml_type::try_from(ttype).ok()?;
    if t >= sys::ggml_type_GGML_TYPE_COUNT {
        return None;
    }
    // SAFETY: both are lookups in ggml's static type table, in range above.
    let (size, block) = unsafe { (sys::ggml_type_size(t) as u64, sys::ggml_blck_size(t)) };
    let block = u64::try_from(block).ok().filter(|&b| b > 0)?;
    if size == 0 || elements % block != 0 {
        return None;
    }
    (elements / block).checked_mul(size)
}

/// Reads through a model file while tracking how much of it is left, so a
/// section that runs past the end is reported as an incomplete file rather
/// than an I/O error.
struct Walker<R> {
    inner: R,
    pos: u64,
    len: u64,
}

impl<R: Read + Seek> Walker<R> {
    fn remaining(&self) -> u64 {
        self.len.saturating_sub(self.pos)
    }

    fn take(&mut self, n: u64) -> Result<(), HeaderError> {
        if n > self.remaining() {
            return Err(HeaderError::Incomplete);
        }
        self.pos += n;
        Ok(())
    }

    fn i32(&mut self) -> Result<i32, HeaderError> {
        self.take(4)?;
        let mut b = [0u8; 4];
        self.inner.read_exact(&mut b).map_err(|_| HeaderError::Unreadable)?;
        Ok(i32::from_le_bytes(b))
    }

    /// An i32 that counts something, so it can't be negative.
    fn count(&mut self) -> Result<u64, HeaderError> {
        u64::try_from(self.i32()?).map_err(|_| HeaderError::Incomplete)
    }

    /// Step over a short run of bytes, keeping the read buffer.
    fn discard(&mut self, n: u64) -> Result<(), HeaderError> {
        self.take(n)?;
        let copied = std::io::copy(&mut (&mut self.inner).take(n), &mut std::io::sink())
            .map_err(|_| HeaderError::Unreadable)?;
        if copied == n { Ok(()) } else { Err(HeaderError::Unreadable) }
    }

    /// Seek over tensor data without reading it.
    fn skip(&mut self, n: u64) -> Result<(), HeaderError> {
        self.take(n)?;
        let offset = i64::try_from(n).map_err(|_| HeaderError::Incomplete)?;
        self.inner.seek(SeekFrom::Current(offset)).map_err(|_| HeaderError::Unreadable)?;
        Ok(())
    }
}

#[cfg(test)]
pub(crate) fn synthetic_header(n_vocab: i32, n_audio_layer: i32, n_text_layer: i32, n_mels: i32) -> Vec<u8> {
    let mut bytes = GGML_FILE_MAGIC.to_le_bytes().to_vec();
    for v in [n_vocab, 1500, 384, 6, n_audio_layer, 448, 384, 6, n_text_layer, n_mels, 1] {
        bytes.extend_from_slice(&v.to_le_bytes());
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::synthetic_header as header;

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

    /// A complete model file for this header: mel filters, a vocabulary of
    /// one-byte tokens, and every tensor whisper.cpp expects, each holding
    /// `elements` values of `ttype` (`bytes` on disk).
    fn complete_model(header_bytes: Vec<u8>, ttype: i32, elements: i32, bytes: usize) -> Vec<u8> {
        let h = WhisperHeader::parse(&header_bytes).unwrap();
        let mut out = header_bytes;
        let push = |out: &mut Vec<u8>, v: i32| out.extend_from_slice(&v.to_le_bytes());
        push(&mut out, h.n_mels);
        push(&mut out, 2);
        out.extend(std::iter::repeat_n(0u8, h.n_mels as usize * 2 * 4));
        push(&mut out, h.n_vocab);
        for _ in 0..h.n_vocab {
            push(&mut out, 1);
            out.push(b'a');
        }
        for _ in 0..h.expected_tensors().unwrap() {
            let name = b"tensor";
            push(&mut out, 1);
            push(&mut out, name.len() as i32);
            push(&mut out, ttype);
            push(&mut out, elements);
            out.extend_from_slice(name);
            out.extend(std::iter::repeat_n(0u8, bytes));
        }
        out
    }

    fn inspect_bytes(bytes: &[u8]) -> Result<WhisperHeader, HeaderError> {
        let header = WhisperHeader::parse(bytes)?;
        let mut walker = Walker { inner: std::io::Cursor::new(bytes), pos: 0, len: bytes.len() as u64 };
        walker.discard(HEADER_LEN as u64)?;
        header.check_layout(&mut walker)?;
        Ok(header)
    }

    // ggml type ids: F16 = 1 (2 bytes a value), Q5_0 = 6 (22 bytes per 32).
    const F16: i32 = 1;
    const Q5_0: i32 = 6;

    #[test]
    fn complete_files_pass_inspection_including_quantized() {
        let f16 = complete_model(header(51865, 4, 4, 80), F16, 32, 64);
        assert_eq!(inspect_bytes(&f16).unwrap().base_model(), Some("tiny"));
        let q5 = complete_model(header(51866, 32, 4, 128), Q5_0, 64, 44);
        assert_eq!(inspect_bytes(&q5).unwrap().base_model(), Some("large-v3-turbo"));
    }

    #[test]
    fn partial_files_fail_inspection() {
        let full = complete_model(header(51865, 4, 4, 80), F16, 32, 64);

        // Header only.
        assert_eq!(inspect_bytes(&full[..HEADER_LEN]), Err(HeaderError::Incomplete));
        // A download cut off mid-tensor, in the vocabulary, or in the filters.
        assert_eq!(inspect_bytes(&full[..full.len() - 1]), Err(HeaderError::Incomplete));
        assert_eq!(inspect_bytes(&full[..full.len() / 2]), Err(HeaderError::Incomplete));
        assert_eq!(inspect_bytes(&full[..HEADER_LEN + 20]), Err(HeaderError::Incomplete));
        // Cut off exactly at a tensor boundary: one tensor short.
        let one_tensor = 4 * 4 + "tensor".len() + 64;
        assert_eq!(inspect_bytes(&full[..full.len() - one_tensor]), Err(HeaderError::Incomplete));
        // Trailing bytes after the last tensor.
        let mut extra = full.clone();
        extra.extend_from_slice(&[0u8; 8]);
        assert_eq!(inspect_bytes(&extra), Err(HeaderError::Incomplete));
    }

    #[test]
    fn tensors_with_impossible_sizes_fail_inspection() {
        // A tensor type ggml retired (Q4_2) and one it never had.
        assert_eq!(inspect_bytes(&complete_model(header(51865, 4, 4, 80), 4, 32, 18)), Err(HeaderError::Incomplete));
        assert_eq!(inspect_bytes(&complete_model(header(51865, 4, 4, 80), 999, 32, 64)), Err(HeaderError::Incomplete));
        // A quantized tensor whose element count isn't a whole number of blocks.
        assert_eq!(inspect_bytes(&complete_model(header(51865, 4, 4, 80), Q5_0, 33, 22)), Err(HeaderError::Incomplete));
        // Data that is the right total size but declared with the wrong type.
        assert_eq!(inspect_bytes(&complete_model(header(51865, 4, 4, 80), Q5_0, 32, 64)), Err(HeaderError::Incomplete));
    }

    /// Real whisper.cpp files, which the repo doesn't ship: point
    /// `AUTOSUBS_TEST_GGML` at one or more (`:`-separated) and run with
    /// `--ignored`.
    #[test]
    #[ignore]
    fn inspects_real_model_files() {
        let paths = std::env::var("AUTOSUBS_TEST_GGML").expect("set AUTOSUBS_TEST_GGML");
        for path in paths.split(':') {
            let header = WhisperHeader::inspect(Path::new(path)).unwrap_or_else(|e| panic!("{path}: {e}"));
            assert!(header.base_model().is_some(), "{path}: {header:?}");
        }
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
        // The header reads, but tensor data alone isn't a complete model.
        assert_eq!(WhisperHeader::inspect(&good), Err(HeaderError::Incomplete));

        let complete = dir.join("complete.bin");
        std::fs::write(&complete, complete_model(header(51864, 6, 6, 80), F16, 32, 64)).unwrap();
        assert_eq!(WhisperHeader::inspect(&complete).unwrap().base_model(), Some("base.en"));

        let short = dir.join("short.bin");
        std::fs::write(&short, &bytes[..10]).unwrap();
        assert_eq!(WhisperHeader::read(&short), Err(HeaderError::NotGgml));

        assert_eq!(WhisperHeader::read(&dir.join("missing.bin")), Err(HeaderError::NotFound));
        assert_eq!(WhisperHeader::inspect(&dir.join("missing.bin")), Err(HeaderError::NotFound));

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
