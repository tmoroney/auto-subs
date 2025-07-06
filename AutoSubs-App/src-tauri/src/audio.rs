use eyre::{bail, Context, Result};
use hound::{SampleFormat, WavReader};
use std::fs;
use std::io::Read;
use std::process::Stdio;
use std::{path::PathBuf, process::Command};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn get_audio_duration(path: &str) -> Result<f64, String> {
    let reader = hound::WavReader::open(path)
        .map_err(|e| format!("Failed to open WAV file: {}", e))?;
    let duration = reader.duration() as f64 / reader.spec().sample_rate as f64;
    Ok(duration)
}

pub fn normalize(input: PathBuf, output: PathBuf, additional_ffmpeg_args: Option<Vec<String>>) -> Result<()> {
    // Ensure the output directory exists
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).context("failed to create output directory")?;
    }

    println!("normalize {:?} to {:?}", input, output);

    let mut cmd = Command::new("ffmpeg");
    let cmd = cmd.stderr(Stdio::piped()).args([
        "-i", input.to_str().unwrap(),
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        "-map_metadata", "-1",
    ]);

    cmd.args(additional_ffmpeg_args.unwrap_or_default());

    cmd.args([output.to_str().unwrap(), "-hide_banner", "-y", "-loglevel", "error"]);

    tracing::debug!("cmd: {:?}", cmd);

    let cmd = cmd.stdin(Stdio::null());

    #[cfg(windows)]
    let cmd = cmd.creation_flags(CREATE_NO_WINDOW);

    let mut pid = cmd.spawn()?;
    if !pid.wait()?.success() {
        let mut output = String::new();
        if let Some(ref mut stderr) = pid.stderr {
            stderr.take(1000).read_to_string(&mut output)?;
        }

        bail!("unable to convert file: {:?} args: {:?}", output, cmd.get_args());
    }

    if !output.exists() {
        bail!("seems like ffmpeg failed for some reason. output not exists")
    }
    Ok(())
}

pub fn parse_wav_file(path: &PathBuf) -> Result<Vec<i16>> {
    tracing::debug!("wav reader read from {:?}", path);
    let reader = WavReader::open(path).context("failed to read file")?;
    tracing::debug!("parsing {}", path.display());

    let channels = reader.spec().channels;
    if reader.spec().channels != 1 {
        bail!("expected mono audio file and found {} channels!", channels);
    }
    if reader.spec().sample_format != SampleFormat::Int {
        bail!("expected integer sample format");
    }
    if reader.spec().sample_rate != 16000 {
        bail!("expected 16KHz sample rate");
    }
    if reader.spec().bits_per_sample != 16 {
        bail!("expected 16 bits per sample");
    }

    reader.into_samples::<i16>().map(|x| x.context("sample")).collect()
}