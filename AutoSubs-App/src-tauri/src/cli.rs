//! Headless command-line interface.
//!
//! AutoSubs is a Tauri desktop app, but when it is launched with a subcommand
//! (currently just `transcribe`) we run without showing the window, do the work,
//! print the result, and exit. This lets AI agents and terminal users drive the
//! transcription engine directly.
//!
//! The heavy lifting is reused verbatim from the GUI path:
//! [`crate::transcription_api::transcribe_audio`] already normalizes audio via the
//! ffmpeg sidecar, downloads the Whisper model if missing, transcribes, optionally
//! diarizes, formats, and returns a `Transcript`. We only translate CLI args into
//! its `FrontendTranscribeOptions` and serialize the result as JSON.

use std::io::{IsTerminal, Write};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Listener, Runtime};
use tauri_plugin_cli::{CliExt, Matches};

#[allow(unused_imports)]
use std::process::Command;

use crate::transcript_types::{Segment, Transcript};
use crate::transcription_api::{transcribe_audio, FrontendTranscribeOptions};
use transcription_engine::TextDensity;

/// True when the app was launched with CLI arguments, meaning "run headless,
/// don't open a window". Checked against raw `argv` *before* the Tauri app is
/// built so we can skip window creation and GUI-only plugins (single-instance,
/// updater, Adobe bridge).
///
/// Any argument triggers headless mode; a lone macOS `-psn_…` argument (which
/// Finder passes on some launches) is ignored so a normal GUI launch isn't
/// hijacked into the CLI.
pub fn is_headless_invocation() -> bool {
    std::env::args().skip(1).any(|a| !a.starts_with("-psn_"))
}

/// On Windows release builds the process has no attached console (the binary is
/// built with `windows_subsystem = "windows"`), so stdout/stderr go nowhere when
/// launched from a shell. Re-attach to the parent console so CLI output is visible.
#[cfg(windows)]
pub fn attach_console() {
    #[link(name = "kernel32")]
    extern "system" {
        fn AttachConsole(dwProcessId: u32) -> i32;
    }
    const ATTACH_PARENT_PROCESS: u32 = 0xFFFF_FFFF;
    unsafe {
        AttachConsole(ATTACH_PARENT_PROCESS);
    }
}

#[cfg(not(windows))]
pub fn attach_console() {}

/// Entry point for the headless path, called from `setup()` once the app handle
/// is available. Reads the parsed CLI matches, runs the requested subcommand, and
/// exits the process with an appropriate status code. Never returns.
pub async fn run<R: Runtime>(app: AppHandle<R>) -> ! {
    let matches = match app.cli().matches() {
        Ok(m) => m,
        // A parse error (missing/unknown argument) — clap already produced a
        // formatted usage message. Print it plainly and exit 2 (the usual code
        // for CLI usage errors), not as a JSON runtime error.
        Err(e) => {
            eprintln!("{e}");
            flush_and_exit(2);
        }
    };

    // `--version`: the plugin signals it via the presence of a "version" arg but
    // does not provide the string, so print the app version ourselves.
    if matches.args.contains_key("version") {
        println!("autosubs {}", app.package_info().version);
        flush_and_exit(0);
    }

    // `--help`: the plugin puts the rendered help text in the "help" arg's value.
    if let Some(text) = help_text(&matches) {
        println!("{text}");
        flush_and_exit(0);
    }

    run_transcribe(app, matches).await
}

async fn run_transcribe<R: Runtime>(app: AppHandle<R>, m: Matches) -> ! {
    let input = match arg_str(&m, "input") {
        Some(p) => p,
        None => fail("missing required <input> file path"),
    };

    // GPU: default on (mirrors transcribe_audio's `.or(Some(true))`); --no-gpu wins.
    let enable_gpu = if arg_flag(&m, "no-gpu") {
        Some(false)
    } else if arg_flag(&m, "gpu") {
        Some(true)
    } else {
        None
    };

    // Validate --density up front: an unknown value is a usage error rather than
    // a silent fall back to the default density (which would produce wrapping the
    // user didn't ask for). The accepted values match `TextDensity`'s serde repr.
    let density = match arg_str(&m, "density") {
        Some(s) => match parse_density(&s) {
            Some(d) => Some(d),
            None => {
                eprintln!(
                    "autosubs: unknown density '{s}' (expected less, standard, more, single, or custom)"
                );
                flush_and_exit(2);
            }
        },
        None => None,
    };

    let options = FrontendTranscribeOptions {
        audio_path: input,
        offset: None,
        model: arg_str(&m, "model").unwrap_or_else(|| "small".to_string()),
        lang: arg_str(&m, "lang"),
        translate: Some(arg_flag(&m, "translate")),
        target_language: arg_str(&m, "target-language"),
        enable_dtw: None,
        enable_gpu,
        enable_diarize: Some(arg_flag(&m, "diarize")),
        max_speakers: arg_num(&m, "max-speakers"),
        density,
        max_lines: arg_num(&m, "max-lines"),
        custom_max_chars_per_line: arg_num(&m, "max-chars-per-line"),
        text_case: arg_str(&m, "text-case"),
        remove_punctuation: Some(arg_flag(&m, "remove-punctuation")),
        censored_words: None,
        custom_prompt: arg_str(&m, "prompt"),
    };

    let output = arg_str(&m, "output");

    // Resolve the output format up front so a bad value fails before doing work.
    let format = match resolve_format(arg_str(&m, "format").as_deref(), output.as_deref()) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("autosubs: {e}");
            flush_and_exit(2);
        }
    };

    // Progress reporting on stderr. `transcribe_audio` already emits
    // `labeled-progress` events ({progress, type, label}); we render them as a live
    // bar on a TTY, or as one line per high-level stage when stderr is piped (so an
    // agent capturing stderr gets clean, non-spammy output). stdout stays JSON-only.
    let is_tty = std::io::stderr().is_terminal();
    eprintln!("autosubs: starting (model={})", options.model);

    let events = app.clone();
    let last_stage: Arc<std::sync::Mutex<Option<String>>> = Arc::new(std::sync::Mutex::new(None));
    let last_stage_cb = last_stage.clone();
    let listener_id = events.listen("labeled-progress", move |event| {
        let Ok(ev) = serde_json::from_str::<ProgressEvent>(event.payload()) else {
            return;
        };
        let stage = ev.stage.as_deref().unwrap_or("");
        // Ignore the initial null-stage tick (before the engine sets a real stage).
        if stage.is_empty() {
            return;
        }
        if is_tty {
            let mut err = std::io::stderr();
            let _ = write!(err, "{}", render_bar(stage, ev.progress));
            let _ = err.flush();
        } else if let Ok(mut last) = last_stage_cb.lock() {
            if last.as_deref() != Some(stage) {
                eprintln!("autosubs: {}...", stage_label(stage).to_lowercase());
                *last = Some(stage.to_string());
            }
        }
    });

    let result = transcribe_audio(app, options).await;

    events.unlisten(listener_id);
    if is_tty {
        // Terminate the in-place bar line so later output isn't overwritten.
        eprintln!();
    }

    match result {
        Ok(transcript) => {
            let mut rendered = match format {
                OutputFormat::Json => serde_json::to_string_pretty(&transcript)
                    .unwrap_or_else(|e| fail(&format!("failed to serialize transcript: {e}"))),
                OutputFormat::Text => render_text(&transcript),
                OutputFormat::Srt => render_srt(&transcript),
                OutputFormat::Vtt => render_vtt(&transcript),
            };
            if !rendered.ends_with('\n') {
                rendered.push('\n');
            }
            match output {
                Some(path) => {
                    if let Err(e) = std::fs::write(&path, &rendered) {
                        fail(&format!("failed to write '{path}': {e}"));
                    }
                    eprintln!("autosubs: wrote {} to {path}", format.name());
                }
                None => print!("{rendered}"),
            }
            flush_and_exit(0);
        }
        Err(e) => fail(&e),
    }
}

// --- output formats ---

#[derive(Clone, Copy)]
enum OutputFormat {
    /// Readable transcript: one line per segment, speaker-labelled, no word timings.
    Text,
    /// Full structured transcript including word-level timestamps.
    Json,
    Srt,
    Vtt,
}

impl OutputFormat {
    fn parse(s: &str) -> Result<Self, String> {
        match s.trim().to_ascii_lowercase().as_str() {
            "text" | "txt" => Ok(Self::Text),
            "json" => Ok(Self::Json),
            "srt" => Ok(Self::Srt),
            "vtt" | "webvtt" => Ok(Self::Vtt),
            other => Err(format!(
                "unknown format '{other}' (expected text, json, srt, or vtt)"
            )),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Text => "transcript",
            Self::Json => "JSON",
            Self::Srt => "SRT",
            Self::Vtt => "VTT",
        }
    }
}

/// Explicit `--format` wins; otherwise infer from the `-o` file extension; else text.
fn resolve_format(explicit: Option<&str>, output: Option<&str>) -> Result<OutputFormat, String> {
    if let Some(f) = explicit {
        return OutputFormat::parse(f);
    }
    if let Some(ext) = output
        .and_then(|p| std::path::Path::new(p).extension())
        .and_then(|e| e.to_str())
    {
        if let Ok(f) = OutputFormat::parse(ext) {
            return Ok(f);
        }
    }
    Ok(OutputFormat::Text)
}

/// Speaker label for a segment, e.g. `Speaker 1`. `speaker_id` is the engine's
/// numeric id ("1", "2", …) or "?" when unknown.
fn speaker_prefix(seg: &Segment) -> String {
    seg.speaker_id
        .as_deref()
        .map(|id| format!("Speaker {id}: "))
        .unwrap_or_default()
}

fn hms(seconds: f64) -> (u64, u64, u64, u64) {
    let total_ms = (seconds.max(0.0) * 1000.0).round() as u64;
    (
        total_ms / 3_600_000,
        (total_ms / 60_000) % 60,
        (total_ms / 1000) % 60,
        total_ms % 1000,
    )
}

fn ts_srt(s: f64) -> String {
    let (h, m, s, ms) = hms(s);
    format!("{h:02}:{m:02}:{s:02},{ms:03}")
}

fn ts_vtt(s: f64) -> String {
    let (h, m, s, ms) = hms(s);
    format!("{h:02}:{m:02}:{s:02}.{ms:03}")
}

fn ts_clock(s: f64) -> String {
    let (h, m, s, _) = hms(s);
    format!("{h:02}:{m:02}:{s:02}")
}

/// `[HH:MM:SS] Speaker N: text` per *speaker turn* — the default, human-readable
/// transcript. The engine's segments are short subtitle cues (wrapped for on-screen
/// display), which read poorly as prose, so consecutive cues are merged into one
/// paragraph while the speaker stays the same. When there is no diarization (no
/// speaker labels), a silence gap longer than `GAP_BREAK_SECS` starts a new
/// paragraph instead, so the transcript still breaks at natural pauses.
fn render_text(t: &Transcript) -> String {
    const GAP_BREAK_SECS: f64 = 2.0;

    let mut out = String::new();
    let mut start = 0.0;
    let mut end = 0.0;
    let mut speaker: Option<String> = None;
    let mut text = String::new();
    let mut open = false;

    for seg in &t.segments {
        let line = seg.text.trim();
        if line.is_empty() {
            continue;
        }
        // Continue the current paragraph if the speaker matches and either we have
        // a speaker label (turns are the unit) or the gap since the last cue is small.
        let continues = open
            && speaker.as_deref() == seg.speaker_id.as_deref()
            && (seg.speaker_id.is_some() || seg.start - end <= GAP_BREAK_SECS);

        if continues {
            if !text.ends_with(' ') {
                text.push(' ');
            }
            text.push_str(line);
            end = seg.end.max(end);
        } else {
            if open {
                out.push_str(&text_line(start, &speaker, &text));
            }
            start = seg.start;
            end = seg.end;
            speaker = seg.speaker_id.clone();
            text = line.to_string();
            open = true;
        }
    }
    if open {
        out.push_str(&text_line(start, &speaker, &text));
    }
    out
}

fn text_line(start: f64, speaker: &Option<String>, text: &str) -> String {
    let prefix = speaker
        .as_deref()
        .map(|id| format!("Speaker {id}: "))
        .unwrap_or_default();
    format!("[{}] {prefix}{text}\n", ts_clock(start))
}

fn render_srt(t: &Transcript) -> String {
    let mut out = String::new();
    for (i, seg) in t.segments.iter().enumerate() {
        let end = seg.end.max(seg.start);
        out.push_str(&format!(
            "{}\n{} --> {}\n{}{}\n\n",
            i + 1,
            ts_srt(seg.start),
            ts_srt(end),
            speaker_prefix(seg),
            seg.text.trim()
        ));
    }
    out
}

fn render_vtt(t: &Transcript) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for seg in &t.segments {
        let end = seg.end.max(seg.start);
        out.push_str(&format!(
            "{} --> {}\n{}{}\n\n",
            ts_vtt(seg.start),
            ts_vtt(end),
            speaker_prefix(seg),
            seg.text.trim()
        ));
    }
    out
}

/// Print an error as a JSON object on stderr and exit non-zero. Never returns.
fn fail(message: &str) -> ! {
    eprintln!("{}", json!({ "error": message }));
    flush_and_exit(1);
}

fn flush_and_exit(code: i32) -> ! {
    let _ = std::io::stdout().flush();
    let _ = std::io::stderr().flush();
    // Bypass Tauri's exit handling: it can override our exit code during its
    // shutdown cleanup, and there is no GUI/Resolve state to tear down here.
    std::process::exit(code);
}

// --- progress rendering ---

/// Subset of the `labeled-progress` event payload emitted by `transcribe_audio`.
/// The `label` field is intentionally ignored; the stage is derived from `type`.
#[derive(Deserialize)]
struct ProgressEvent {
    progress: i32,
    #[serde(rename = "type")]
    stage: Option<String>,
}

/// Map an engine `ProgressType` (Debug string) to a human stage name.
fn stage_label(stage: &str) -> &'static str {
    match stage {
        "Download" => "Downloading model",
        "Diarize" => "Diarizing",
        "Transcribe" => "Transcribing",
        "Translate" => "Translating",
        _ => "Processing",
    }
}

/// A carriage-return-prefixed progress bar line for in-place TTY updates, e.g.
/// `Transcribing       [████████░░░░░░░░] 50%`.
fn render_bar(stage: &str, percent: i32) -> String {
    const WIDTH: usize = 24;
    let pct = percent.clamp(0, 100) as usize;
    let filled = pct * WIDTH / 100;
    let bar = "█".repeat(filled) + &"░".repeat(WIDTH - filled);
    // Pad the label and trail a few spaces so the line stays aligned and fully
    // overwrites the previous (possibly longer) render.
    format!("\r{:<18} [{}] {:>3}%   ", stage_label(stage), bar, pct)
}

// --- arg accessors over tauri-plugin-cli's Matches ---

fn arg_str(m: &Matches, name: &str) -> Option<String> {
    m.args
        .get(name)
        .and_then(|a| a.value.as_str().map(|s| s.to_string()))
}

fn arg_flag(m: &Matches, name: &str) -> bool {
    m.args
        .get(name)
        .map(|a| a.value.as_bool().unwrap_or(false) || a.occurrences > 0)
        .unwrap_or(false)
}

fn arg_num<T: std::str::FromStr>(m: &Matches, name: &str) -> Option<T> {
    arg_str(m, name).and_then(|s| s.parse().ok())
}

/// Parse a `--density` value into `TextDensity`, case-insensitively. Returns
/// `None` for unrecognized values so the caller can report a usage error.
fn parse_density(s: &str) -> Option<TextDensity> {
    let lower = s.trim().to_ascii_lowercase();
    serde_json::from_value(serde_json::Value::String(lower)).ok()
}

/// If clap captured `--help`, return the rendered help text it wants printed.
fn help_text(m: &Matches) -> Option<String> {
    m.args
        .get("help")
        .and_then(|arg| arg.value.as_str().map(|s| s.to_string()))
}

// ---------------------------------------------------------------------------
// In-app "Install command-line tool" support (VS Code style).
//
// Puts an `autosubs` command on the user's PATH so the headless CLI can be run
// as a bare command from any terminal. Linux packages already install
// `/usr/bin/autosubs`, so there it is reported as available and managed by the
// package manager (the in-app action is a no-op).
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct CliStatus {
    /// `autosubs` currently resolves on PATH (or the managed symlink exists).
    installed: bool,
    /// Whether the in-app Install/Remove action applies on this OS.
    manageable: bool,
    /// Where the command is (or would be) installed.
    location: Option<String>,
    /// Human-readable platform note (shown when not manageable in-app).
    note: Option<String>,
}

#[cfg(target_os = "macos")]
const MACOS_CLI_LINK: &str = "/usr/local/bin/autosubs";

/// Report whether the `autosubs` command is on the user's PATH and whether the
/// in-app button can manage it on this platform.
#[tauri::command]
pub fn cli_command_status() -> CliStatus {
    #[cfg(target_os = "macos")]
    {
        CliStatus {
            installed: std::fs::symlink_metadata(MACOS_CLI_LINK).is_ok(),
            manageable: true,
            location: Some(MACOS_CLI_LINK.to_string()),
            note: None,
        }
    }
    #[cfg(target_os = "windows")]
    {
        let dir = exe_dir();
        let installed = dir.as_ref().map(|d| windows_path_contains(d)).unwrap_or(false);
        CliStatus {
            installed,
            manageable: true,
            location: dir.map(|d| d.to_string_lossy().to_string()),
            note: None,
        }
    }
    #[cfg(target_os = "linux")]
    {
        let found = which::which("autosubs").ok();
        CliStatus {
            installed: found.is_some(),
            manageable: false,
            location: found.map(|p| p.to_string_lossy().to_string()),
            note: Some(
                "On Linux the `autosubs` command is installed and managed by your package (deb/rpm)."
                    .to_string(),
            ),
        }
    }
}

/// Add `autosubs` to the user's PATH. Returns the refreshed status.
#[tauri::command]
pub fn install_cli_command() -> Result<CliStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let exe = current_exe_string()?;
        run_admin_macos(&format!(
            "mkdir -p /usr/local/bin && ln -sf '{exe}' '{MACOS_CLI_LINK}'"
        ))?;
    }
    #[cfg(target_os = "windows")]
    {
        let dir = exe_dir().ok_or("could not determine the install directory")?;
        let dir = dir.to_string_lossy().to_string();
        if !windows_path_contains(std::path::Path::new(&dir)) {
            windows_set_user_path_append(&dir)?;
        }
    }
    #[cfg(target_os = "linux")]
    {
        return Err(
            "On Linux the `autosubs` command is managed by your package manager.".to_string(),
        );
    }
    Ok(cli_command_status())
}

/// Remove the `autosubs` command from the user's PATH. Returns refreshed status.
#[tauri::command]
pub fn uninstall_cli_command() -> Result<CliStatus, String> {
    #[cfg(target_os = "macos")]
    {
        run_admin_macos(&format!("rm -f '{MACOS_CLI_LINK}'"))?;
    }
    #[cfg(target_os = "windows")]
    {
        let dir = exe_dir().ok_or("could not determine the install directory")?;
        windows_remove_user_path(&dir.to_string_lossy())?;
    }
    #[cfg(target_os = "linux")]
    {
        return Err(
            "On Linux the `autosubs` command is managed by your package manager.".to_string(),
        );
    }
    Ok(cli_command_status())
}

#[cfg(target_os = "macos")]
fn current_exe_string() -> Result<String, String> {
    std::env::current_exe()
        .map_err(|e| format!("could not locate the app executable: {e}"))
        .map(|p| p.to_string_lossy().to_string())
}

/// Run a shell command with administrator privileges via the native macOS
/// password prompt (AppleScript). Used because `/usr/local/bin` is root-owned.
#[cfg(target_os = "macos")]
fn run_admin_macos(shell_script: &str) -> Result<(), String> {
    let escaped = shell_script.replace('\\', "\\\\").replace('"', "\\\"");
    let apple = format!("do shell script \"{escaped}\" with administrator privileges");
    let out = Command::new("osascript")
        .arg("-e")
        .arg(apple)
        .output()
        .map_err(|e| format!("failed to run osascript: {e}"))?;
    if out.status.success() {
        return Ok(());
    }
    let err = String::from_utf8_lossy(&out.stderr);
    if err.contains("User canceled") || err.contains("-128") {
        Err("Cancelled.".to_string())
    } else {
        Err(format!("Failed to update /usr/local/bin: {}", err.trim()))
    }
}

#[cfg(target_os = "windows")]
fn exe_dir() -> Option<std::path::PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

/// The persistent (registry-backed) user PATH, not the current process PATH.
#[cfg(target_os = "windows")]
fn windows_user_path() -> String {
    match Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "[Environment]::GetEnvironmentVariable('Path','User')",
        ])
        .output()
    {
        Ok(o) => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        Err(_) => String::new(),
    }
}

#[cfg(target_os = "windows")]
fn windows_path_contains(dir: &std::path::Path) -> bool {
    let needle = dir.to_string_lossy().to_lowercase();
    let needle = needle.trim_end_matches('\\');
    windows_user_path()
        .split(';')
        .any(|p| p.trim().to_lowercase().trim_end_matches('\\') == needle)
}

#[cfg(target_os = "windows")]
fn run_powershell(script: &str) -> Result<(), String> {
    let out = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script])
        .output()
        .map_err(|e| format!("failed to run PowerShell: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Append `dir` to the persistent user PATH (setting it broadcasts the change so
/// newly opened terminals pick it up). User scope needs no administrator rights.
#[cfg(target_os = "windows")]
fn windows_set_user_path_append(dir: &str) -> Result<(), String> {
    let script = format!(
        "$p=[Environment]::GetEnvironmentVariable('Path','User'); if([string]::IsNullOrEmpty($p)){{$p=''}}; if($p -notlike '*{dir}*'){{ if($p -and -not $p.EndsWith(';')){{$p+=';'}}; $p+='{dir}'; [Environment]::SetEnvironmentVariable('Path',$p,'User') }}"
    );
    run_powershell(&script)
}

#[cfg(target_os = "windows")]
fn windows_remove_user_path(dir: &str) -> Result<(), String> {
    let script = format!(
        "$d='{dir}'.TrimEnd('\\'); $p=[Environment]::GetEnvironmentVariable('Path','User'); if($p){{ $parts=$p.Split(';') | Where-Object {{ $_ -and ($_.TrimEnd('\\') -ne $d) }}; [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User') }}"
    );
    run_powershell(&script)
}
