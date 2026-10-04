//! whisper-bench: compare the Whisper path AutoSubs ships today
//! (whisper-rs / whisper.cpp) against transcribe.cpp, one engine per binary.
//!
//! Build with exactly one of `--features wcpp` or `--features tcpp`.

#[cfg(all(feature = "wcpp", feature = "tcpp"))]
compile_error!(
    "features `wcpp` and `tcpp` are mutually exclusive: whisper-rs and transcribe-cpp \
     each statically link their own ggml (0.9.5 vs 0.25.3). Build two separate binaries."
);
#[cfg(not(any(feature = "wcpp", feature = "tcpp")))]
compile_error!("enable exactly one engine feature: `wcpp` (whisper-rs) or `tcpp` (transcribe-cpp)");

use std::env;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process;
use std::time::Instant;

#[derive(Debug)]
struct Args {
    model: PathBuf,
    audio: Vec<PathBuf>,
    lang: String,
    decode: String, // "beam5" | "greedy"
    threads: usize,
    no_dtw: bool,
    label: String,
    out: PathBuf,
}

fn usage() -> ! {
    eprintln!(
        "usage: whisper-bench --model <path> --audio <wav> [--audio <wav> ...] \
         [--lang <code|auto>] [--decode beam5|greedy] [--threads N] [--no-dtw] \
         [--label <str>] --out <results.jsonl>"
    );
    process::exit(2);
}

fn parse_args() -> Args {
    let mut model: Option<PathBuf> = None;
    let mut audio = Vec::new();
    let mut lang = "en".to_string();
    let mut decode = "beam5".to_string();
    let mut threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let mut no_dtw = false;
    let mut label = String::new();
    let mut out: Option<PathBuf> = None;

    let mut it = env::args().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "--model" => model = Some(PathBuf::from(it.next().unwrap_or_else(|| usage()))),
            "--audio" => audio.push(PathBuf::from(it.next().unwrap_or_else(|| usage()))),
            "--lang" => lang = it.next().unwrap_or_else(|| usage()),
            "--decode" => decode = it.next().unwrap_or_else(|| usage()),
            "--threads" => {
                threads = it
                    .next()
                    .unwrap_or_else(|| usage())
                    .parse()
                    .unwrap_or_else(|_| usage())
            }
            "--no-dtw" => no_dtw = true,
            "--label" => label = it.next().unwrap_or_else(|| usage()),
            "--out" => out = Some(PathBuf::from(it.next().unwrap_or_else(|| usage()))),
            _ => usage(),
        }
    }
    if model.is_none() || audio.is_empty() || out.is_none() {
        usage();
    }
    if decode != "beam5" && decode != "greedy" {
        eprintln!("error: --decode must be 'beam5' or 'greedy'");
        usage();
    }
    Args {
        model: model.unwrap(),
        audio,
        lang,
        decode,
        threads,
        no_dtw,
        label,
        out: out.unwrap(),
    }
}

/// Load a 16 kHz mono WAV as f32 [-1, 1]. Supports s16 and f32 WAV encodings.
fn load_wav(path: &Path) -> Result<(Vec<f32>, f64), String> {
    let reader = hound::WavReader::open(path)
        .map_err(|e| format!("{}: cannot open wav: {}", path.display(), e))?;
    let spec = reader.spec();
    if spec.sample_rate != 16000 || spec.channels != 1 {
        return Err(format!(
            "{}: expected 16 kHz mono WAV, got {} Hz / {} ch. Convert with: \
             ffmpeg -i <in> -ar 16000 -ac 1 -f wav -acodec pcm_s16le <out>",
            path.display(),
            spec.sample_rate,
            spec.channels
        ));
    }
    let mut reader = reader;
    let samples: Vec<f32> = match (spec.sample_format, spec.bits_per_sample) {
        (hound::SampleFormat::Int, 16) => reader
            .samples::<i16>()
            .map(|s| s.map_err(|e| e.to_string()).map(|v| v as f32 / 32768.0))
            .collect::<Result<_, String>>()?,
        (hound::SampleFormat::Float, 32) => reader
            .samples::<f32>()
            .map(|s| s.map_err(|e| e.to_string()))
            .collect::<Result<_, String>>()?,
        (fmt, bits) => {
            return Err(format!(
                "{}: unsupported wav encoding {:?} {}-bit; use pcm_s16le or float32",
                path.display(),
                fmt,
                bits
            ))
        }
    };
    let dur = samples.len() as f64 / 16000.0;
    Ok((samples, dur))
}

/// Peak RSS of this process in MB. getrusage ru_maxrss is bytes on macOS and
/// KiB on Linux.
fn peak_rss_mb() -> f64 {
    #[cfg(unix)]
    unsafe {
        let mut ru: libc::rusage = std::mem::zeroed();
        if libc::getrusage(libc::RUSAGE_SELF, &mut ru) == 0 {
            #[cfg(target_os = "macos")]
            return ru.ru_maxrss as f64 / (1024.0 * 1024.0);
            #[cfg(not(target_os = "macos"))]
            return ru.ru_maxrss as f64 / 1024.0;
        }
        f64::NAN
    }
    #[cfg(not(unix))]
    {
        f64::NAN
    }
}

fn json_escape(s: &str) -> String {
    serde_json::to_string(s).unwrap()
}

/// `ggml-large-v3-turbo.bin` -> `large-v3-turbo`,
/// `ggml-large-v3-turbo-q8_0.bin` -> `large-v3-turbo` (quant suffix stripped
/// so the DTW model-preset lookup finds the right alignment heads).
#[cfg(feature = "wcpp")]
fn model_name_from_path(model: &Path) -> String {
    const KNOWN: &[&str] = &[
        "large-v3-turbo",
        "medium.en",
        "medium",
        "large-v3",
        "large-v2",
        "large-v1",
        "small.en",
        "small",
        "base.en",
        "base",
        "tiny.en",
        "tiny",
    ];
    let fname = model
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let stem = fname.strip_suffix(".bin").unwrap_or(&fname);
    let name = stem.strip_prefix("ggml-").unwrap_or(stem);
    // Order matters: longest prefixes first (e.g. large-v3-turbo before large-v3).
    for known in KNOWN {
        if name == *known || name.starts_with(&format!("{known}-")) {
            return known.to_string();
        }
    }
    name.to_string()
}

struct EngineRow {
    file: String,
    audio_s: f64,
    load_ms: f64,
    transcribe_ms: f64,
    text: String,
    extra: Vec<(String, String)>, // pre-serialized key:value fragments
}

fn write_row(args: &Args, model_file: &str, engine: &str, r: &EngineRow) -> Result<(), String> {
    let x_rt = r.audio_s / (r.transcribe_ms / 1000.0);
    let mut line = format!(
        "{{\"engine\":{},\"label\":{},\"model\":{},\"decode\":{},\"dtw\":{},\
         \"file\":{},\"audio_s\":{:.3},\"load_ms\":{:.1},\"transcribe_ms\":{:.1},\
         \"x_realtime\":{:.3},\"peak_rss_mb\":{:.1},\"text\":{}",
        json_escape(engine),
        json_escape(&args.label),
        json_escape(model_file),
        json_escape(&args.decode),
        if cfg!(feature = "wcpp") {
            serde_json::to_string(&!args.no_dtw).unwrap()
        } else {
            "null".to_string()
        },
        json_escape(&r.file),
        r.audio_s,
        r.load_ms,
        r.transcribe_ms,
        x_rt,
        peak_rss_mb(),
        json_escape(&r.text),
    );
    for (k, v) in &r.extra {
        line.push_str(&format!(",{}:{}", json_escape(k), v));
    }
    line.push('}');
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&args.out)
        .map_err(|e| format!("cannot open {}: {}", args.out.display(), e))?;
    writeln!(f, "{line}").map_err(|e| e.to_string())
}

#[cfg(all(feature = "wcpp", not(feature = "tcpp")))]
mod engine {
    use super::*;
    use whisper_rs::{
        DtwMode, DtwModelPreset, DtwParameters, FullParams, SamplingStrategy, WhisperContext,
        WhisperContextParameters, WhisperState,
    };

    /// Copied from transcription-engine/src/utils.rs (AutoSubs) so the DTW
    /// memory budget matches the app byte-for-byte.
    pub fn calculate_dtw_mem_size(model_name: &str) -> usize {
        const N_AUDIO_TOKENS: usize = 1500; // 30 s -> 3000 mel frames -> 1500 encoder tokens
        const N_TOKENS: usize = 448; // whisper.cpp n_text_ctx

        let n_heads = match model_name {
            "tiny.en" => 8,
            "tiny" => 6,
            "base.en" => 5,
            "base" => 8,
            "small.en" => 19,
            "small" => 10,
            "medium.en" => 18,
            "medium" => 6,
            "large-v1" => 9,
            "large-v2" => 23,
            "large-v3" => 10,
            "large-v3-turbo" => 6,
            _ => 24,
        };

        let cross_qk_bytes = N_TOKENS
            .saturating_mul(N_AUDIO_TOKENS)
            .saturating_mul(n_heads)
            .saturating_mul(4);
        let graph_intermediate_bytes = cross_qk_bytes.saturating_mul(3);
        let dtw_matrix_bytes = (N_TOKENS + 1)
            .saturating_mul(N_AUDIO_TOKENS + 1)
            .saturating_mul(4 + 4);
        const OVERHEAD_MB: usize = 16;
        let overhead_bytes = OVERHEAD_MB * 1024 * 1024;

        let total = cross_qk_bytes
            .saturating_add(graph_intermediate_bytes)
            .saturating_add(dtw_matrix_bytes)
            .saturating_add(overhead_bytes);

        let min_bytes = 32 * 1024 * 1024;
        let max_bytes = 768 * 1024 * 1024;
        let clamped = total.clamp(min_bytes, max_bytes);

        const ALIGN: usize = 8 * 1024 * 1024;
        clamped.div_ceil(ALIGN) * ALIGN
    }

    /// Mirrors create_context() in transcription-engine/src/engines/whisper.rs.
    /// AutoSubs' default `enable_flash_attn: Some(false)` means flash attention
    /// is never enabled; DTW is on by default (`enable_dtw: Some(true)`).
    fn create_context(model_path: &Path, model_name: &str, use_dtw: bool) -> Result<WhisperContext, String> {
        if !model_path.exists() {
            return Err(format!("whisper file doesn't exist: {}", model_path.display()));
        }
        let mut ctx_params = WhisperContextParameters::default();

        // On Intel Macs whisper.cpp's Metal backend can abort inside
        // ggml_metal_synchronize; AutoSubs defaults to CPU-only there.
        let default_use_gpu = !cfg!(all(target_os = "macos", target_arch = "x86_64"));
        ctx_params.use_gpu = default_use_gpu;

        if cfg!(all(target_os = "macos", target_arch = "x86_64")) && ctx_params.use_gpu {
            ctx_params.use_gpu = false;
        }

        ctx_params.flash_attn(false); // AutoSubs: flash_attn is never on

        if use_dtw {
            let model_preset = match model_name {
                "tiny.en" => DtwModelPreset::TinyEn,
                "tiny" => DtwModelPreset::Tiny,
                "base.en" => DtwModelPreset::BaseEn,
                "base" => DtwModelPreset::Base,
                "small.en" => DtwModelPreset::SmallEn,
                "small" => DtwModelPreset::Small,
                "medium.en" => DtwModelPreset::MediumEn,
                "medium" => DtwModelPreset::Medium,
                "large-v3" => DtwModelPreset::LargeV3,
                "large-v3-turbo" => DtwModelPreset::LargeV3Turbo,
                _ => DtwModelPreset::Small, // same fallback as AutoSubs
            };
            let dtw_mem_size = calculate_dtw_mem_size(model_name);
            ctx_params.dtw_parameters(DtwParameters {
                mode: DtwMode::ModelPreset { model_preset },
                dtw_mem_size,
            });
        }

        let mp = model_path
            .to_str()
            .ok_or_else(|| "model path is not UTF-8".to_string())?;
        WhisperContext::new_with_params(mp, ctx_params)
            .map_err(|e| format!("failed to open model: {e}"))
    }

    /// Mirrors setup_params() in transcription-engine/src/engines/whisper.rs.
    fn setup_params<'a, 'b>(
        decode: &str,
        lang: &'a str,
        threads: usize,
    ) -> FullParams<'a, 'b> {
        let sampling_strategy = match decode {
            "greedy" => SamplingStrategy::Greedy { best_of: 1 },
            _ => SamplingStrategy::BeamSearch {
                beam_size: 5,
                patience: -1.0,
            },
        };
        let mut params = FullParams::new(sampling_strategy);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        params.set_token_timestamps(true);
        params.set_single_segment(false);
        if lang != "auto" {
            params.set_language(Some(lang));
        }
        params.set_n_threads(threads as i32);
        params
    }

    pub fn run(args: &Args) -> Result<(), String> {
        let model_name = model_name_from_path(&args.model);
        let use_dtw = !args.no_dtw;

        // Whether the CoreML encoder compiled model sits next to the .bin,
        // which is the path whisper.cpp looks for.
        let stem_str = args.model.to_string_lossy().into_owned();
        let stem = stem_str.strip_suffix(".bin").unwrap_or(&stem_str);
        let coreml_path = format!("{stem}-encoder.mlmodelc");
        let coreml_present = Path::new(&coreml_path).exists();
        let coreml_compiled = cfg!(feature = "coreml");

        let t0 = Instant::now();
        let effective_use_gpu = !cfg!(all(target_os = "macos", target_arch = "x86_64"));
        let ctx = create_context(&args.model, &model_name, use_dtw)?;
        let mut state: WhisperState = ctx
            .create_state()
            .map_err(|e| format!("failed to create whisper state: {e}"))?;
        let load_ms = t0.elapsed().as_secs_f64() * 1000.0;
        eprintln!("model_load_ms={load_ms:.1}");

        let extra: Vec<(String, String)> = vec![
            ("use_gpu".into(), effective_use_gpu.to_string()),
            ("flash_attn".into(), "false".into()),
            ("coreml_encoder_present".into(), coreml_present.to_string()),
            ("coreml_compiled".into(), coreml_compiled.to_string()),
        ];

        // One untimed warm-up on the first 10 s of the first audio file.
        let (pcm0, _) = load_wav(&args.audio[0])?;
        let warm: Vec<f32> = pcm0.iter().take(16000 * 10).copied().collect();
        let params = setup_params(&args.decode, &args.lang, args.threads);
        state
            .full(params.clone(), &warm)
            .map_err(|e| format!("warm-up failed: {e}"))?;

        let model_file = args
            .model
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        for wav in &args.audio {
            let (pcm, audio_s) = load_wav(wav)?;
            let t = Instant::now();
            state
                .full(params.clone(), &pcm)
                .map_err(|e| format!("{}: transcribe failed: {}", wav.display(), e))?;
            let transcribe_ms = t.elapsed().as_secs_f64() * 1000.0;

            let mut text = String::new();
            for seg in state.as_iter() {
                if let Ok(s) = seg.to_str_lossy() {
                    text.push_str(&s);
                }
            }
            let row = EngineRow {
                file: wav.to_string_lossy().to_string(),
                audio_s,
                load_ms,
                transcribe_ms,
                text: text.trim().to_string(),
                extra: extra.clone(),
            };
            write_row(args, &model_file, "wcpp", &row)?;
        }
        Ok(())
    }
}

#[cfg(feature = "tcpp")]
mod engine {
    use super::*;
    use transcribe_cpp::{Backend, Model, ModelOptions, RunOptions, SessionOptions, TimestampKind};

    pub fn run(args: &Args) -> Result<(), String> {
        if args.decode == "beam5" {
            return Err(
                "transcribe.cpp has no beam search; only --decode greedy is supported"
                    .to_string(),
            );
        }

        let backend = if cfg!(feature = "metal") {
            Backend::Metal
        } else {
            Backend::Cpu
        };

        let t0 = Instant::now();
        let model = Model::load_with(
            &args.model,
            &ModelOptions {
                backend,
                device: None,
            },
        )
        .map_err(|e| format!("failed to load model: {e}"))?;
        let backend_str = model.backend();

        // SessionOptions carries n_threads (0 = library default).
        let mut session = model
            .session_with(&SessionOptions {
                n_threads: args.threads as i32,
                ..Default::default()
            })
            .map_err(|e| format!("failed to create session: {e}"))?;
        let load_ms = t0.elapsed().as_secs_f64() * 1000.0;
        eprintln!("model_load_ms={load_ms:.1} backend={backend_str}");

        let opts = RunOptions {
            language: if args.lang == "auto" {
                None
            } else {
                Some(args.lang.clone())
            },
            timestamps: TimestampKind::Segment,
            ..Default::default()
        };

        let extra: Vec<(String, String)> = vec![
            (
                "backend".into(),
                serde_json::to_string(&backend_str).unwrap(),
            ),
        ];

        // One untimed warm-up on the first 10 s of the first audio file.
        let (pcm0, _) = load_wav(&args.audio[0])?;
        let warm: Vec<f32> = pcm0.iter().take(16000 * 10).copied().collect();
        session
            .run(&warm, &opts)
            .map_err(|e| format!("warm-up failed: {e}"))?;

        let model_file = args
            .model
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        for wav in &args.audio {
            let (pcm, audio_s) = load_wav(wav)?;
            let t = Instant::now();
            let tr = session
                .run(&pcm, &opts)
                .map_err(|e| format!("{}: transcribe failed: {}", wav.display(), e))?;
            let transcribe_ms = t.elapsed().as_secs_f64() * 1000.0;
            let row = EngineRow {
                file: wav.to_string_lossy().to_string(),
                audio_s,
                load_ms,
                transcribe_ms,
                text: tr.text.trim().to_string(),
                extra: extra.clone(),
            };
            write_row(args, &model_file, "tcpp", &row)?;
        }
        Ok(())
    }
}

// Unreachable: compile_error! above fires when neither engine is enabled.
#[cfg(not(any(feature = "wcpp", feature = "tcpp")))]
mod engine {
    use super::Args;
    pub fn run(_args: &Args) -> Result<(), String> {
        unreachable!()
    }
}

fn main() {
    let args = parse_args();
    if let Err(e) = engine::run(&args) {
        eprintln!("error: {e}");
        process::exit(1);
    }
}
