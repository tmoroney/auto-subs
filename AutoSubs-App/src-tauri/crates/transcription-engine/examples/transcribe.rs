use eyre::{Result, eyre};
use transcription_engine::{Callbacks, Engine, EngineConfig, ProgressType, Segment, TranscribeOptions};

struct CliArgs {
    audio_path: String,
    model: String,
    lang: Option<String>,
    translate_to: Option<String>,
    whisper_to_english: bool,
    diarize: bool,
    vad: Option<bool>,
    max_speakers: Option<usize>,
    output_path: String,
    use_gpu: Option<bool>,
}

fn print_usage(program: &str) {
    eprintln!("Usage: {program} <audio-path> [options]");
    eprintln!("\nOptions:");
    eprintln!("  --model <name>                 Model to use (default: tiny)");
    eprintln!("  --lang <code>                  Source language code (default: auto)");
    eprintln!("  --translate-to <code>          Translate transcript to target language");
    eprintln!("  --whisper-to-english           Use Whisper translation-to-English mode");
    eprintln!("  --diarize                      Enable speaker labeling");
    eprintln!("  --no-vad                       Disable voice activity detection");
    eprintln!("  --max-speakers <n>             Limit detected speakers when diarization is enabled");
    eprintln!("  --output <path>                Write JSON output to this path (default: segments.json)");
    eprintln!("  --no-gpu                       Disable GPU acceleration");
}

fn parse_args() -> Result<CliArgs> {
    let mut args = std::env::args().skip(1);
    let program = std::env::args().next().unwrap_or_else(|| "cargo run --example transcribe --".into());

    let mut audio_path: Option<String> = None;
    let mut model = "tiny".to_string();
    let mut lang = Some("auto".to_string());
    let mut translate_to: Option<String> = None;
    let mut whisper_to_english = false;
    let mut diarize = false;
    let mut vad = Some(true);
    let mut max_speakers: Option<usize> = None;
    let mut output_path = "segments.json".to_string();
    let mut use_gpu: Option<bool> = None;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--model" => {
                model = args.next().ok_or_else(|| eyre!("missing value for --model"))?;
            }
            "--lang" => {
                lang = Some(args.next().ok_or_else(|| eyre!("missing value for --lang"))?);
            }
            "--translate-to" => {
                translate_to = Some(args.next().ok_or_else(|| eyre!("missing value for --translate-to"))?);
            }
            "--whisper-to-english" => {
                whisper_to_english = true;
            }
            "--diarize" => {
                diarize = true;
            }
            "--no-vad" => {
                vad = Some(false);
            }
            "--max-speakers" => {
                let raw = args.next().ok_or_else(|| eyre!("missing value for --max-speakers"))?;
                max_speakers = Some(raw.parse()?);
            }
            "--output" => {
                output_path = args.next().ok_or_else(|| eyre!("missing value for --output"))?;
            }
            "--no-gpu" => {
                use_gpu = Some(false);
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
        lang,
        translate_to,
        whisper_to_english,
        diarize,
        vad,
        max_speakers,
        output_path,
        use_gpu,
    })
}

fn on_progress(percent: i32, progress_type: ProgressType, label: &str) {
    let prefix = match progress_type {
        ProgressType::Download => "📥",
        ProgressType::Diarize => "🗣️",
        ProgressType::Transcribe => "🎵",
        ProgressType::Translate => "🌍",
    };
    println!("{prefix} {label}: {percent}%");
}

fn on_new_segment(segment: &Segment) {
    match &segment.speaker_id {
        Some(speaker) => println!("[{speaker}] {}", segment.text),
        None => println!("{}", segment.text),
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    whisper_rs::install_logging_hooks();

    let args = parse_args()?;

    let mut config = EngineConfig::default();
    if let Some(use_gpu) = args.use_gpu {
        config.use_gpu = Some(use_gpu);
    }

    let options = TranscribeOptions {
        model: args.model,
        lang: args.lang,
        whisper_to_english: Some(args.whisper_to_english),
        translate_target: args.translate_to,
        enable_vad: args.vad,
        enable_diarize: Some(args.diarize),
        max_speakers: args.max_speakers,
        ..Default::default()
    };

    let callbacks = Callbacks {
        progress: Some(&on_progress),
        new_segment_callback: Some(&on_new_segment),
        is_cancelled: None,
    };

    let mut engine = Engine::new(config);
    let segments = engine
        .transcribe_audio(&args.audio_path, options, None, None, Some(callbacks))
        .await?;

    println!("\nTranscribed {} segments", segments.len());

    let json = serde_json::to_string_pretty(&segments)?;
    std::fs::write(&args.output_path, json)?;
    println!("Saved transcript JSON to {}", args.output_path);

    Ok(())
}
