/// Convert a sequence of SentencePiece tokens to readable text.
///
/// Handles the `▁` (U+2581) word boundary marker by replacing it with a space,
/// trims the result, and cleans up contraction spacing.
pub fn sentencepiece_to_text(tokens: &[&str]) -> String {
    let mut text = String::new();
    for &token in tokens {
        text.push_str(&token.replace('\u{2581}', " "));
    }
    let text = text.trim().to_string();
    // Clean up contraction spacing (e.g. "can 't" → "can't")
    text.replace(" '", "'")
}

/// Parse a byte-level BPE token like `<0xE5>` into its byte value.
///
/// SentencePiece tokenizers emit these for characters outside the base vocabulary
/// (e.g. CJK characters are split into individual UTF-8 bytes).
pub fn parse_byte_token(token: &str) -> Option<u8> {
    if token.starts_with("<0x") && token.ends_with('>') && token.len() == 6 {
        let hex = &token[3..5];
        u8::from_str_radix(hex, 16).ok()
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_byte_token_valid() {
        assert_eq!(parse_byte_token("<0xE5>"), Some(0xE5));
        assert_eq!(parse_byte_token("<0xB0>"), Some(0xB0));
        assert_eq!(parse_byte_token("<0xBC>"), Some(0xBC));
        assert_eq!(parse_byte_token("<0x00>"), Some(0x00));
        assert_eq!(parse_byte_token("<0xFF>"), Some(0xFF));
    }

    #[test]
    fn test_parse_byte_token_invalid() {
        assert_eq!(parse_byte_token("hello"), None);
        assert_eq!(parse_byte_token("<|en|>"), None);
        assert_eq!(parse_byte_token("<0x>"), None);
        assert_eq!(parse_byte_token("<0xEE"), None); // missing >
        assert_eq!(parse_byte_token("<0xGG>"), None); // invalid hex
    }

    #[test]
    fn test_byte_tokens_reassemble_chinese() {
        // 尼 = E5 B0 BC, 豪 = E8 B1 AA
        // Simulates what Cohere's decode_ids does with byte tokens
        let tokens = vec!["<0xE5>", "<0xB0>", "<0xBC>", "豪", "。"];
        let mut bytes: Vec<u8> = Vec::new();
        for token in &tokens {
            if let Some(byte_val) = parse_byte_token(token) {
                bytes.push(byte_val);
            } else {
                bytes.extend(token.as_bytes());
            }
        }
        let text = String::from_utf8_lossy(&bytes);
        assert_eq!(text, "尼豪。");
    }

    #[test]
    fn test_byte_tokens_full_cjk_sequence() {
        // 你好 = E4 BD A0 E5 A5 BD
        let tokens = vec!["<0xE4>", "<0xBD>", "<0xA0>", "<0xE5>", "<0xA5>", "<0xBD>"];
        let mut bytes: Vec<u8> = Vec::new();
        for token in &tokens {
            if let Some(byte_val) = parse_byte_token(token) {
                bytes.push(byte_val);
            } else {
                bytes.extend(token.as_bytes());
            }
        }
        let text = String::from_utf8_lossy(&bytes);
        assert_eq!(text, "你好");
    }

    #[test]
    fn test_sentencepiece_to_text_basic() {
        let tokens = vec![" Hello", " world"];
        assert_eq!(sentencepiece_to_text(&tokens), "Hello world");
    }

    #[test]
    fn test_sentencepiece_to_text_contractions() {
        let tokens = vec![" can", " 't"];
        assert_eq!(sentencepiece_to_text(&tokens), "can't");
    }
}
