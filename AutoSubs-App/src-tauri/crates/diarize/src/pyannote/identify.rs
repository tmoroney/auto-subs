use eyre::{bail, Result};
use ndarray::Array1;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct EmbeddingManager {
    max_speakers: usize,
    speakers: HashMap<usize, Array1<f32>>,
    /// Cached `||speaker||` norms. Cosine similarity is `dot / (||a|| * ||b||)`;
    /// `||b||` is fixed per stored speaker, so caching it removes one dot product
    /// and one square root from every comparison against that speaker.
    speaker_norms: HashMap<usize, f32>,
    next_speaker_id: usize,
}

impl EmbeddingManager {
    pub fn new(max_speakers: usize) -> Self {
        Self {
            max_speakers,
            speakers: HashMap::new(),
            speaker_norms: HashMap::new(),
            next_speaker_id: 1,
        }
    }

    /// Cosine similarity using pre-computed `||a||` and `||b||` norms.
    /// Callers must pass `a.dot(a).sqrt()` and `b.dot(b).sqrt()` respectively,
    /// so results are bit-identical to the previous per-call computation.
    fn cosine_similarity(norm_a: f32, a: &Array1<f32>, b: &Array1<f32>, norm_b: f32) -> f32 {
        let dot_product = a.dot(b);
        dot_product / (norm_a * norm_b)
    }

    /// Search or create speaker
    pub fn search_speaker(&mut self, embedding: Vec<f32>, threshold: f32) -> Option<usize> {
        let embedding_array = Array1::from_vec(embedding);
        // `||a||` is invariant across the speaker loop: hoist it out so it is
        // computed once per query instead of once per speaker.
        let norm_a = embedding_array.dot(&embedding_array).sqrt();
        let mut best_speaker_id = None;
        let mut best_similarity = threshold;

        for (&speaker_id, speaker_embedding) in &self.speakers {
            let norm_b = *self
                .speaker_norms
                .get(&speaker_id)
                .expect("every stored speaker has a cached norm");
            let similarity =
                Self::cosine_similarity(norm_a, &embedding_array, speaker_embedding, norm_b);
            if similarity > best_similarity {
                best_speaker_id = Some(speaker_id);
                best_similarity = similarity;
            }
        }

        match best_speaker_id {
            Some(id) => Some(id),
            None if self.speakers.len() < self.max_speakers => {
                Some(self.add_speaker(embedding_array))
            }
            None => None,
        }
    }

    pub fn get_best_speaker_match(&mut self, embedding: Vec<f32>) -> Result<usize> {
        if self.speakers.is_empty() {
            bail!("no speakers")
        }
        let embedding_array = Array1::from_vec(embedding);
        let norm_a = embedding_array.dot(&embedding_array).sqrt();
        let mut best_speaker_id = 0;
        let mut best_similarity = f32::MIN; // Initialize to the lowest possible value

        for (&speaker_id, speaker_embedding) in &self.speakers {
            let norm_b = *self
                .speaker_norms
                .get(&speaker_id)
                .expect("every stored speaker has a cached norm");
            let similarity =
                Self::cosine_similarity(norm_a, &embedding_array, speaker_embedding, norm_b);
            if similarity > best_similarity {
                best_speaker_id = speaker_id;
                best_similarity = similarity;
            }
        }
        Ok(best_speaker_id)
    }

    fn add_speaker(&mut self, embedding: Array1<f32>) -> usize {
        let speaker_id = self.next_speaker_id;
        let norm = embedding.dot(&embedding).sqrt();
        self.speakers.insert(speaker_id, embedding);
        self.speaker_norms.insert(speaker_id, norm);
        self.next_speaker_id += 1;
        speaker_id
    }

    #[allow(unused)]
    pub fn get_all_speakers(&self) -> &HashMap<usize, Array1<f32>> {
        &self.speakers
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn emb(v: &[f32]) -> Array1<f32> {
        Array1::from_vec(v.to_vec())
    }

    #[test]
    fn search_speaker_picks_closest_speaker_above_threshold() {
        let mut m = EmbeddingManager::new(4);
        let id_a = m.add_speaker(emb(&[1.0, 0.0]));
        let id_b = m.add_speaker(emb(&[0.0, 1.0]));

        assert_eq!(m.search_speaker(vec![1.0, 0.0], 0.5), Some(id_a));
        assert_eq!(m.search_speaker(vec![0.0, 1.0], 0.5), Some(id_b));
        // Equidistant: HashMap order is arbitrary, so either speaker may win.
        assert!(
            matches!(
                m.search_speaker(vec![1.0, 1.0], 0.5),
                Some(id) if id == id_a || id == id_b
            )
        );
    }

    #[test]
    fn search_speaker_returns_none_only_at_capacity_with_no_match() {
        // `search_speaker` creates a new speaker below `max_speakers`, so fill
        // to capacity first: with no candidate above threshold it must return
        // None rather than adding another speaker.
        let mut m = EmbeddingManager::new(2);
        m.add_speaker(emb(&[1.0, 0.0]));
        m.add_speaker(emb(&[0.0, 1.0]));
        assert_eq!(m.search_speaker(vec![1.0, 1.0], 0.9), None);
    }

    #[test]
    fn get_best_speaker_match_always_returns_closest() {
        let mut m = EmbeddingManager::new(4);
        let id_a = m.add_speaker(emb(&[1.0, 0.0]));
        let id_b = m.add_speaker(emb(&[0.0, 1.0]));

        assert_eq!(m.get_best_speaker_match(vec![0.0, 1.0]).unwrap(), id_b);
        // Equidistant: HashMap order is arbitrary, so either speaker may win.
        assert!(
            matches!(
                m.get_best_speaker_match(vec![1.0, 1.0]).unwrap(),
                id if id == id_a || id == id_b
            )
        );
    }

    #[test]
    fn zero_norm_speaker_never_wins_as_before() {
        let mut m = EmbeddingManager::new(4);
        let id_zero = m.add_speaker(emb(&[0.0, 0.0]));
        let id_real = m.add_speaker(emb(&[1.0, 0.0]));

        assert_eq!(m.get_best_speaker_match(vec![1.0, 0.0]).unwrap(), id_real);
        // Zero-norm candidates yield NaN similarity; at capacity none can win.
        let mut full = EmbeddingManager::new(2);
        full.add_speaker(emb(&[0.0, 0.0]));
        full.add_speaker(emb(&[1.0, 0.0]));
        assert_eq!(full.search_speaker(vec![0.0, 0.0], 0.5), None);
        let _ = id_zero;
    }
}
