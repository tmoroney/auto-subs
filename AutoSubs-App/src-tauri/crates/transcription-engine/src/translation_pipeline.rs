use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use futures::future::BoxFuture;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::task::JoinHandle;
use tokio::time::{Duration, interval};

use crate::types::{Callbacks, NewSegmentFn, Segment, SegmentStage};

const BATCH_SIZE: usize = 5;
const BATCH_TIMEOUT_MS: u64 = 1500;

/// The translation service could not be reached. Returned by
/// [`TranslationPipeline::finish`] so the caller can keep the transcription in
/// the source language instead of discarding it.
#[derive(Debug)]
pub struct TranslationUnavailable(pub String);

impl std::fmt::Display for TranslationUnavailable {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "translation unavailable: {}", self.0)
    }
}

impl std::error::Error for TranslationUnavailable {}

pub(crate) type Translator =
    Arc<dyn Fn(Vec<String>) -> BoxFuture<'static, eyre::Result<Vec<String>>> + Send + Sync>;

struct TranslationJob {
    index: usize,
    segment: Segment,
}

#[derive(Clone)]
pub struct TranslationSubmitter {
    sender: Option<UnboundedSender<TranslationJob>>,
    results: Arc<Mutex<BTreeMap<usize, Segment>>>,
    new_segment_callback: Option<Arc<NewSegmentFn>>,
    is_cancelled: Option<Arc<dyn Fn() -> bool + Send + Sync>>,
}

impl TranslationSubmitter {
    pub fn submit(&self, index: usize, segment: Segment) {
        {
            let mut map = self.results.lock().unwrap();
            map.insert(index, segment.clone());
        }

        // Emitted as `Transcribe`: this is still the untranslated text, shown
        // immediately so the user is not waiting on the translation round-trip.
        if let Some(cb) = &self.new_segment_callback {
            cb(index, &segment, SegmentStage::Transcribe);
        }

        if let Some(sender) = &self.sender {
            let _ = sender.send(TranslationJob { index, segment });
        }
    }
}

pub struct TranslationPipeline {
    submitter: TranslationSubmitter,
    handle: JoinHandle<eyre::Result<Vec<Segment>>>,
}

impl TranslationPipeline {
    pub fn new(
        source_lang: String,
        target_lang: String,
        callbacks: Callbacks,
    ) -> Self {
        let translator: Translator = Arc::new(move |texts| {
            let (from, to) = (source_lang.clone(), target_lang.clone());
            Box::pin(async move {
                crate::translation_client::translate_batch(texts, &from, &to).await
            })
        });
        Self::with_translator(translator, callbacks)
    }

    pub(crate) fn with_translator(translator: Translator, callbacks: Callbacks) -> Self {
        let (tx, rx) = unbounded_channel();
        let results = Arc::new(Mutex::new(BTreeMap::new()));
        let submitter = TranslationSubmitter {
            sender: Some(tx),
            results: Arc::clone(&results),
            new_segment_callback: callbacks.new_segment_callback,
            is_cancelled: callbacks.is_cancelled,
        };

        // The worker must not own a sender clone, otherwise the channel can never
        // close and finish() will wait forever.
        let worker_submitter = TranslationSubmitter {
            sender: None,
            results: Arc::clone(&results),
            new_segment_callback: submitter.new_segment_callback.clone(),
            is_cancelled: submitter.is_cancelled.clone(),
        };
        let handle = tokio::spawn(run_worker(rx, worker_submitter, results, translator));

        Self {
            submitter,
            handle,
        }
    }

    pub fn submitter(&self) -> &TranslationSubmitter {
        &self.submitter
    }

    pub async fn finish(self) -> eyre::Result<Vec<Segment>> {
        drop(self.submitter);
        self.handle.await?
    }
}

async fn run_worker(
    mut rx: UnboundedReceiver<TranslationJob>,
    submitter: TranslationSubmitter,
    results: Arc<Mutex<BTreeMap<usize, Segment>>>,
    translator: Translator,
) -> eyre::Result<Vec<Segment>> {
    let mut buffer: Vec<TranslationJob> = Vec::with_capacity(BATCH_SIZE);
    let mut tick = interval(Duration::from_millis(BATCH_TIMEOUT_MS));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        tokio::select! {
            biased;
            job = rx.recv() => {
                match job {
                    Some(j) => {
                        buffer.push(j);
                        if buffer.len() >= BATCH_SIZE {
                            flush(&submitter, &mut buffer, &translator).await?;
                        }
                    }
                    None => {
                        if !buffer.is_empty() {
                            flush(&submitter, &mut buffer, &translator).await?;
                        }
                        break;
                    }
                }
            }
            _ = tick.tick() => {
                if !buffer.is_empty() {
                    flush(&submitter, &mut buffer, &translator).await?;
                }
            }
        }
    }

    let map = results.lock().unwrap();
    Ok(map.values().cloned().collect())
}

async fn flush(
    submitter: &TranslationSubmitter,
    buffer: &mut Vec<TranslationJob>,
    translator: &Translator,
) -> eyre::Result<()> {
    if buffer.is_empty() {
        return Ok(());
    }

    let jobs = std::mem::take(buffer);
    let texts: Vec<String> = jobs.iter().map(|j| j.segment.text.clone()).collect();

    if submitter.is_cancelled.as_ref().map(|c| c()).unwrap_or(false) {
        eyre::bail!("Translation cancelled");
    }

    // translate_batch only errors when the service itself is down. Returning
    // here also stops the worker, so later batches don't each wait out the
    // full retry backoff against a service that is known to be unreachable.
    let translated = translator(texts)
        .await
        .map_err(|e| eyre::Report::new(TranslationUnavailable(format!("{e:#}"))))?;

    for (i, job) in jobs.into_iter().enumerate() {
        let mut seg = job.segment;
        seg.text = translated.get(i).cloned().unwrap_or_default();
        crate::translation_client::regenerate_words_uniform(&mut seg);

        {
            let mut map = submitter.results.lock().unwrap();
            map.insert(job.index, seg.clone());
        }

        // Emit the translated segment so the live draft matures from the
        // source text into the target language as each batch completes.
        if let Some(cb) = &submitter.new_segment_callback {
            cb(job.index, &seg, SegmentStage::Translate);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn segment(i: usize) -> Segment {
        Segment {
            start: i as f64,
            end: i as f64 + 1.0,
            text: format!("line {i}"),
            words: None,
            speaker_id: None,
        }
    }

    /// Uppercases each batch, failing the calls whose 0-based number is in `fail_on`.
    fn translator(calls: Arc<AtomicUsize>, fail_on: &'static [usize]) -> Translator {
        Arc::new(move |texts: Vec<String>| {
            let call = calls.fetch_add(1, Ordering::SeqCst);
            Box::pin(async move {
                if fail_on.contains(&call) {
                    Err(eyre::eyre!("translate_text failed after retries: HTTP 429"))
                } else {
                    Ok(texts.iter().map(|t| t.to_uppercase()).collect())
                }
            })
        })
    }

    async fn run(translator: Translator, callbacks: Callbacks, count: usize) -> eyre::Result<Vec<Segment>> {
        let pipeline = TranslationPipeline::with_translator(translator, callbacks);
        for i in 0..count {
            pipeline.submitter().submit(i, segment(i));
        }
        pipeline.finish().await
    }

    #[tokio::test]
    async fn translates_every_segment_in_order() {
        let calls = Arc::new(AtomicUsize::new(0));
        let out = run(translator(calls.clone(), &[]), Callbacks::default(), 7).await.unwrap();

        let texts: Vec<&str> = out.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(texts, ["LINE 0", "LINE 1", "LINE 2", "LINE 3", "LINE 4", "LINE 5", "LINE 6"]);
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn an_outage_is_reported_as_unavailable_and_stops_further_calls() {
        let calls = Arc::new(AtomicUsize::new(0));
        let err = run(translator(calls.clone(), &[0, 1, 2]), Callbacks::default(), 12)
            .await
            .unwrap_err();

        let unavailable = err.downcast_ref::<TranslationUnavailable>().expect("typed outage error");
        assert!(unavailable.0.contains("HTTP 429"), "cause kept: {}", unavailable.0);
        assert_eq!(calls.load(Ordering::SeqCst), 1, "no batches after the outage");
    }

    #[tokio::test]
    async fn an_outage_after_some_batches_succeeded_is_still_unavailable() {
        let calls = Arc::new(AtomicUsize::new(0));
        let err = run(translator(calls.clone(), &[1]), Callbacks::default(), 12)
            .await
            .unwrap_err();

        assert!(err.downcast_ref::<TranslationUnavailable>().is_some());
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn cancellation_is_not_reported_as_an_outage() {
        let calls = Arc::new(AtomicUsize::new(0));
        let callbacks = Callbacks {
            is_cancelled: Some(Arc::new(|| true)),
            ..Callbacks::default()
        };
        let err = run(translator(calls.clone(), &[]), callbacks, 5).await.unwrap_err();

        assert!(err.downcast_ref::<TranslationUnavailable>().is_none());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}
