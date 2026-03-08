use eyre::{Result, eyre};
use std::sync::atomic::{AtomicU32, Ordering};
use transcription_engine::{Callbacks, Engine, EngineConfig, ProgressType, TranscribeOptions};

static DOWNLOAD_COUNT: AtomicU32 = AtomicU32::new(0);
static DIARIZE_COUNT: AtomicU32 = AtomicU32::new(0);
static TRANSCRIBE_COUNT: AtomicU32 = AtomicU32::new(0);
static TRANSLATE_COUNT: AtomicU32 = AtomicU32::new(0);

struct CliArgs {
    audio_path: String,
    model: String,
    translate_to: Option<String>,
    diarize: bool,
}

fn print_usage(program: &str) {
    eprintln!("Usage: {program} <audio-path> [options]");
    eprintln!("\nOptions:");
    eprintln!("  --model <name>         Model to use (default: tiny.en)");
    eprintln!("  --translate-to <code>  Enable translation progress with a target language");
    eprintln!("  --diarize              Enable speaker labeling progress");
}

fn parse_args() -> Result<CliArgs> {
    let mut args = std::env::args().skip(1);
    let program = std::env::args().next().unwrap_or_else(|| "cargo run --example progress --".into());

    let mut audio_path: Option<String> = None;
    let mut model = "tiny.en".to_string();
    let mut translate_to = None;
    let mut diarize = false;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--model" => {
                model = args.next().ok_or_else(|| eyre!("missing value for --model"))?;
            }
            "--translate-to" => {
                translate_to = Some(args.next().ok_or_else(|| eyre!("missing value for --translate-to"))?);
            }
            "--diarize" => {
                diarize = true;
            }
            "-h" | "--help" => {
                print_usage(&program);
                std::process::exit(0);
            }
            value if value.starts_with('-') => {
                return Err(eyre!("unknown option: {value}"));
            }
            value => {
                if audio_path.is_some() {
                    return Err(eyre!("unexpected extra positional argument: {value}"));
                }
                audio_path = Some(value.to_string());
            }
        }
    }

    let audio_path = match audio_path {
        Some(path) => path,
        None => {
            print_usage(&program);
            return Err(eyre!("missing required <audio-path> argument"));
        }
    };

    Ok(CliArgs {
        audio_path,
        model,
        translate_to,
        diarize,
    })
}

fn on_progress(percent: i32, progress_type: ProgressType, label: &str) {
    match progress_type {
        ProgressType::Download => {
            let count = DOWNLOAD_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
            println!("[DOWNLOAD #{count}] {percent}%: {label}");
        }
        ProgressType::Diarize => {
            let count = DIARIZE_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
            println!("[DIARIZE #{count}] {percent}%: {label}");
        }
        ProgressType::Transcribe => {
            let count = TRANSCRIBE_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
            println!("[TRANSCRIBE #{count}] {percent}%: {label}");
        }
        ProgressType::Translate => {
            let count = TRANSLATE_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
            println!("[TRANSLATE #{count}] {percent}%: {label}");
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = parse_args()?;

    let options = TranscribeOptions {
        model: args.model,
        lang: Some("en".to_string()),
        translate_target: args.translate_to,
        enable_vad: Some(true),
        enable_diarize: Some(args.diarize),
        ..Default::default()
    };

    let callbacks = Callbacks {
        progress: Some(&on_progress),
        new_segment_callback: None,
        is_cancelled: None,
    };

    let mut engine = Engine::new(EngineConfig::default());
    let segments = engine
        .transcribe_audio(&args.audio_path, options, None, None, Some(callbacks))
        .await?;

    println!("\nTranscribed {} segments", segments.len());
    println!("Download progress updates: {}", DOWNLOAD_COUNT.load(Ordering::Relaxed));
    println!("Diarize progress updates: {}", DIARIZE_COUNT.load(Ordering::Relaxed));
    println!("Transcribe progress updates: {}", TRANSCRIBE_COUNT.load(Ordering::Relaxed));
    println!("Translate progress updates: {}", TRANSLATE_COUNT.load(Ordering::Relaxed));

    Ok(())
}
