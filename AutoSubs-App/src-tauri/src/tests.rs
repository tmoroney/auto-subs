use crate::transcribe::{transcribe_audio, FrontendTranscribeOptions};
use tauri::test::{mock_builder, mock_context, noop_assets};
use std::process::Command;
use std::fs;

#[cfg(test)]
mod tests {
    use super::*;

    // run with cargo test transcribe_audio_smoke -- --nocapture
    #[tokio::test(flavor = "multi_thread")]
    async fn transcribe_audio_smoke() {
        whisper_rs::install_logging_hooks();
        println!("whisper.cpp version: {}", whisper_rs::WHISPER_CPP_VERSION);
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
            model: "tiny.en".into(),
            lang: Some("en".into()),
            translate: Some(false),
            enable_dtw: Some(false),
            enable_gpu: Some(true),
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

    // Runs transcription while ensuring VAD model is present; saves a VAD transcript snapshot.
    // run with: cargo test transcribe_audio_with_vad -- --nocapture
    #[tokio::test(flavor = "multi_thread")]
    async fn transcribe_audio_with_vad() {
        //whisper_rs::install_logging_hooks();
        let app = mock_builder()
            .plugin(tauri_plugin_shell::init())
            .build(mock_context(noop_assets()))
            .expect("failed to build test app");
        let handle = app.handle().clone();

        // Ensure ffprobe is available in PATH (sidecars are not used under mock runtime)
        let has_ffprobe = Command::new("ffprobe").arg("-version").output().is_ok();
        if !has_ffprobe {
            eprintln!("Skipping transcribe_audio_with_vad: ffprobe not found in PATH.");
            return;
        }

        let wav = format!("{}/tests/data/jfk.wav", env!("CARGO_MANIFEST_DIR"));

        let options = FrontendTranscribeOptions {
            audio_path: wav,
            offset: None,
            model: "tiny.en".into(),
            lang: Some("en".into()),
            translate: Some(false),
            enable_dtw: Some(false),
            enable_gpu: Some(true),
            enable_diarize: Some(false),
            max_speakers: None,
        };

        let res = transcribe_audio(handle, options).await;
        assert!(res.is_ok(), "VAD transcription failed: {:?}", res.err());

        if let Ok(transcript) = res {
            let out_path = format!(
                "{}/tests/data/transcript-vad.json",
                env!("CARGO_MANIFEST_DIR")
            );
            let json = serde_json::to_string_pretty(&transcript)
                .expect("failed to serialize VAD transcript");
            fs::write(&out_path, json).expect("failed to write VAD transcript file");
            eprintln!("Saved VAD transcript to {}", out_path);
        }
    }
}