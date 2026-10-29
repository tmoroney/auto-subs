/// Greedy autoregressive token selection with repetition detection.
///
/// Wraps the common argmax + EOS + repeat-guard pattern shared by all
/// autoregressive decoder engines (Canary, Moonshine, Cohere).
///
/// Each engine still owns its KV cache and decoder session — this struct
/// only handles token selection and stopping decisions.
const DEFAULT_MAX_CONSECUTIVE_REPEATS: usize = 8;

pub struct GreedyDecoder {
    eos_id: i64,
    max_consecutive_repeats: usize,
    last_token: i64,
    consecutive_count: usize,
}

impl GreedyDecoder {
    pub fn new(eos_id: i64) -> Self {
        Self {
            eos_id,
            max_consecutive_repeats: DEFAULT_MAX_CONSECUTIVE_REPEATS,
            last_token: -1,
            consecutive_count: 0,
        }
    }

    pub fn with_max_repeats(mut self, n: usize) -> Self {
        self.max_consecutive_repeats = n;
        self
    }

    /// Given logits for the last decoder position, pick the next token.
    ///
    /// Returns `Some(token_id)` to continue decoding, or `None` to stop
    /// (EOS reached or repetition limit hit).
    pub fn next_token(&mut self, logits: &[f32]) -> Option<i64> {
        let token = argmax(logits) as i64;

        if token == self.eos_id {
            return None;
        }

        if token == self.last_token {
            self.consecutive_count += 1;
            if self.consecutive_count > self.max_consecutive_repeats {
                tracing::warn!(
                    "Greedy decode: token {} repeated {} consecutive times, stopping",
                    token,
                    self.consecutive_count
                );
                return None;
            }
        } else {
            self.consecutive_count = 1;
        }

        self.last_token = token;
        Some(token)
    }
}

fn argmax(logits: &[f32]) -> usize {
    let mut max_idx = 0;
    let mut max_val = f32::NEG_INFINITY;
    for (i, &v) in logits.iter().enumerate() {
        if v > max_val {
            max_val = v;
            max_idx = i;
        }
    }
    max_idx
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_argmax() {
        assert_eq!(argmax(&[1.0, 3.0, 2.0]), 1);
        assert_eq!(argmax(&[-1.0, -3.0, -0.5]), 2);
        assert_eq!(argmax(&[5.0]), 0);
    }

    #[test]
    fn test_eos_stops() {
        let mut dec = GreedyDecoder::new(2);
        // logits where token 2 (EOS) wins
        assert_eq!(dec.next_token(&[0.0, 0.0, 10.0, 0.0]), None);
    }

    #[test]
    fn test_normal_token() {
        let mut dec = GreedyDecoder::new(2);
        assert_eq!(dec.next_token(&[0.0, 10.0, 0.0, 0.0]), Some(1));
    }

    #[test]
    fn test_repeat_limit() {
        let mut dec = GreedyDecoder::new(99).with_max_repeats(3);
        let logits = [0.0, 10.0, 0.0]; // always picks token 1
        assert_eq!(dec.next_token(&logits), Some(1)); // count=1
        assert_eq!(dec.next_token(&logits), Some(1)); // count=2
        assert_eq!(dec.next_token(&logits), Some(1)); // count=3
        assert_eq!(dec.next_token(&logits), None); // count=4 > 3 → stop
    }

    #[test]
    fn test_repeat_resets_on_different_token() {
        let mut dec = GreedyDecoder::new(99).with_max_repeats(3);
        assert_eq!(dec.next_token(&[0.0, 10.0, 0.0]), Some(1)); // count=1
        assert_eq!(dec.next_token(&[0.0, 10.0, 0.0]), Some(1)); // count=2
        assert_eq!(dec.next_token(&[10.0, 0.0, 0.0]), Some(0)); // different, count=1
        assert_eq!(dec.next_token(&[0.0, 10.0, 0.0]), Some(1)); // count=1
        assert_eq!(dec.next_token(&[0.0, 10.0, 0.0]), Some(1)); // count=2
        assert_eq!(dec.next_token(&[0.0, 10.0, 0.0]), Some(1)); // count=3
        assert_eq!(dec.next_token(&[0.0, 10.0, 0.0]), None); // count=4 > 3 → stop
    }

    #[test]
    fn test_nan_handling() {
        let mut dec = GreedyDecoder::new(99);
        // NaN logits — argmax uses `>` which is false for NaN, so index 0 wins
        assert_eq!(dec.next_token(&[f32::NAN, f32::NAN, f32::NAN]), Some(0));
    }
}
