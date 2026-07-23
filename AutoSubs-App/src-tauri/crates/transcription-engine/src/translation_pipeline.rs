use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::task::JoinHandle;
use tokio::time::{Duration, interval};

use crate::types::{Callbacks, NewSegmentFn, Segment};

const BATCH_SIZE: usize = 5;
const BATCH_TIMEOUT_MS: u64 = 1500;

struct TranslationJob {
    index: usize,
    segment: Segment,
}

#[derive(Clone)]
pub struct TranslationSubmitter {
    sender: UnboundedSender<TranslationJob>,
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

        if let Some(cb) = &self.new_segment_callback {
            cb(index, &segment);
        }

        let _ = self.sender.send(TranslationJob { index, segment });
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
        let (tx, rx) = unbounded_channel();
        let results = Arc::new(Mutex::new(BTreeMap::new()));
        let submitter = TranslationSubmitter {
            sender: tx,
            results: Arc::clone(&results),
            new_segment_callback: callbacks.new_segment_callback,
            is_cancelled: callbacks.is_cancelled,
        };

        let worker_submitter = submitter.clone();
        let handle = tokio::spawn(run_worker(
            rx,
            worker_submitter,
            results,
            source_lang,
            target_lang,
        ));

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
    source_lang: String,
    target_lang: String,
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
                            flush(&submitter, &mut buffer, &source_lang, &target_lang).await?;
                        }
                    }
                    None => {
                        if !buffer.is_empty() {
                            flush(&submitter, &mut buffer, &source_lang, &target_lang).await?;
                        }
                        break;
                    }
                }
            }
            _ = tick.tick() => {
                if !buffer.is_empty() {
                    flush(&submitter, &mut buffer, &source_lang, &target_lang).await?;
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
    source_lang: &str,
    target_lang: &str,
) -> eyre::Result<()> {
    if buffer.is_empty() {
        return Ok(());
    }

    let jobs = std::mem::take(buffer);
    let texts: Vec<String> = jobs.iter().map(|j| j.segment.text.clone()).collect();

    if submitter.is_cancelled.as_ref().map(|c| c()).unwrap_or(false) {
        eyre::bail!("Translation cancelled");
    }

    let translated = crate::translate::translate_batch(texts, source_lang, target_lang)
        .await
        .map_err(|e| eyre::eyre!("{}", e))?;

    for (i, job) in jobs.into_iter().enumerate() {
        let mut seg = job.segment;
        seg.text = translated.get(i).cloned().unwrap_or_default();
        crate::translate::regenerate_words_uniform(&mut seg);

        {
            let mut map = submitter.results.lock().unwrap();
            map.insert(job.index, seg.clone());
        }

        if let Some(cb) = &submitter.new_segment_callback {
            cb(job.index, &seg);
        }
    }

    Ok(())
}
