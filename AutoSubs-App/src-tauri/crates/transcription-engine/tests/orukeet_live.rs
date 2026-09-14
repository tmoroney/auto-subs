//! Opt-in real download and transcription test; ordinary CI stays offline.
//! Set AUTOSUBS_ORUKEET_TEST_AUDIO to a 16 kHz mono PCM16 speech WAV,
//! AUTOSUBS_ORUKEET_TEST_CACHE to a disposable cache, then run with --ignored.
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use transcription_engine::{Callbacks, Engine, EngineConfig, ModelManager, TranscribeOptions};

#[tokio::test]
#[ignore = "downloads model weights and requires a real speech WAV"]
async fn orukeet_download_cache_chunking_vad_and_cancellation() -> eyre::Result<()> {
    let cache: std::path::PathBuf = std::env::var("AUTOSUBS_ORUKEET_TEST_CACHE")?.into();
    let audio = std::env::var("AUTOSUBS_ORUKEET_TEST_AUDIO")?;
    let manager = ModelManager::new(cache.clone());
    let entry = transcription_engine::manifest::get("orukeet").unwrap();
    let path = manager.ensure_model(entry, None, None).await?;
    assert_eq!(manager.ensure_model(entry, None, None).await?, path);
    assert!(manager.ensure_model(entry, None, Some(&|| true)).await.is_err());

    let mut engine = Engine::new(EngineConfig { cache_dir: cache, use_gpu: Some(false), ..Default::default() });
    for vad in [false, true] {
        let options = TranscribeOptions { model: "orukeet".into(), enable_vad: Some(vad), offset: Some(10.0), ..Default::default() };
        let (segments, _, _) = engine.transcribe_audio(&audio, options, None, None, None, None, None).await?;
        assert!(!segments.is_empty());
        let text = segments.iter().map(|s| s.text.as_str()).collect::<Vec<_>>().join(" ");
        assert!(text.to_lowercase().contains("satellite"), "{text}");
        assert!(segments.iter().all(|s|s.start >= 10.0 && s.end >= s.start));
        assert!(segments.iter().flat_map(|s|s.words.iter().flatten()).all(|w|w.start >= 10.0 && w.end >= w.start));
        println!("VAD={vad}: {} segments, offset and word timestamps passed", segments.len());
    }

    let cancelled = Arc::new(AtomicBool::new(true));
    let check = cancelled.clone();
    let callbacks = Callbacks { is_cancelled: Some(Arc::new(move ||check.load(Ordering::Relaxed))), ..Default::default() };
    let options = TranscribeOptions { model: "orukeet".into(), enable_vad: Some(false), ..Default::default() };
    assert!(engine.transcribe_audio(&audio, options.clone(), None, None, None, None, Some(callbacks)).await.is_err());

    // A malformed runtime configuration fails cleanly and can be repaired.
    let config_path = path.join("config.json");
    let config = std::fs::read(&config_path)?;
    std::fs::write(&config_path, b"{}")?;
    let bad = engine.transcribe_audio(&audio, options.clone(), None, None, None, None, None).await;
    std::fs::write(&config_path, config)?;
    assert!(bad.is_err());
    assert!(!engine.transcribe_audio(&audio, options, None, None, None, None, None).await?.0.is_empty());
    Ok(())
}
