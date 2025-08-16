use crate::transcribe::{transcribe_audio, FrontendTranscribeOptions};
use tauri::test::{mock_builder, mock_context, noop_assets};
use std::process::Command;
use std::fs;

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(flavor = "multi_thread")]
    async fn transcribe_audio_smoke() {
        let app = mock_builder()
            .plugin(tauri_plugin_shell::init())
            .build(mock_context(noop_assets()))
            .expect("failed to build test app");
        let handle = app.handle().clone();

        // Ensure ffprobe is available in PATH (sidecars are not used under mock runtime)
        let has_ffprobe = Command::new("ffprobe").arg("-version").output().is_ok();

        if !has_ffprobe {
            eprintln!("Skipping transcribe_audio_smoke: ffprobe not found in PATH.");
            return;
        }

        // Use a portable test asset path (avoid absolute machine paths)
        let wav = format!("{}/tests/data/test-audio.wav", env!("CARGO_MANIFEST_DIR"));

        let options = FrontendTranscribeOptions {
            audio_path: wav,
            offset: None,
            model: "tiny".into(),
            lang: Some("en".into()),
            translate: Some(true),
            enable_dtw: Some(true),
            enable_gpu: Some(false), // usually off in CI
            enable_diarize: Some(false),
            max_speakers: None,
        };

        let res = transcribe_audio(handle, options).await;
        assert!(res.is_ok(), "transcription failed: {:?}", res.err());

        // Save resulting transcript to tests/data for inspection
        if let Ok(transcript) = res {
            let out_path = format!(
                "{}/tests/data/transcript-smoke.json",
                env!("CARGO_MANIFEST_DIR")
            );
            let json = serde_json::to_string_pretty(&transcript)
                .expect("failed to serialize transcript");
            fs::write(&out_path, json).expect("failed to write transcript file");
            eprintln!("Saved transcript to {}", out_path);
        }
    }
}