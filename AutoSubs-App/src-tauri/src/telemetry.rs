//! # Anonymous usage telemetry
//!
//! Opt-in, aggregated, and off by default. The app keeps a small set of counters
//! on disk and, at most once a week, sends a single summary describing *which
//! features were used* — never what was transcribed, and never a file path.
//! [`PRIVACY.md`](../../../PRIVACY.md) documents the exact payload for users;
//! the server contract lives in `telemetry-worker/src/schema.ts`.
//!
//! ## Build-time gating
//!
//! The endpoint and signing key are injected at compile time. A build without
//! them — every build from source, every fork's CI, every `npm run dev` — has
//! [`is_available`] return `false`, so the consent prompt never appears and
//! nothing is ever recorded or sent. See `.env.example` and
//! `.github/workflows/package.yml`.
//!
//! The key is inside the shipped binary and therefore extractable; it is not a
//! secret so much as a rotating per-release marker. The Worker is what makes
//! abuse cheap to absorb, not this.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use tauri::{AppHandle, Manager, Runtime};

/// Wire format version. Bump only alongside `SCHEMA_VERSION` in the Worker.
const SCHEMA_VERSION: u32 = 1;

/// Injected at build time; absent in source builds, which disables telemetry.
const ENDPOINT: Option<&str> = option_env!("AUTOSUBS_TELEMETRY_URL");
const SIGNING_KEY: Option<&str> = option_env!("AUTOSUBS_TELEMETRY_KEY");
const CHANNEL: Option<&str> = option_env!("AUTOSUBS_BUILD_CHANNEL");

const STATE_FILE: &str = "telemetry.json";
/// Days of usage a summary covers before it is worth sending.
const PERIOD_DAYS: i64 = 7;
/// After an update, report sooner so per-version data is not smeared across releases.
const VERSION_CHANGE_MIN_DAYS: i64 = 1;

/// Serialises the read-modify-write cycle on the state file.
static STATE_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

type HmacSha256 = Hmac<Sha256>;

/// Whether this build can report at all. Everything else in the module is a
/// no-op when this is false.
pub fn is_available() -> bool {
    ENDPOINT.is_some() && SIGNING_KEY.is_some() && CHANNEL.is_some()
}

// ─── On-disk state ────────────────────────────────────────────────────────

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct Counters {
    runs: u32,
    runs_failed: u32,
    runs_diarize: u32,
    runs_translate: u32,
    runs_forced_alignment: u32,
    runs_dtw: u32,
    runs_censor: u32,
    runs_custom_template: u32,
    runs_file_input: u32,
    audio_seconds: u64,
    /// Tallies reduced to their most-used entry when a summary is built, so the
    /// payload stays a fixed shape rather than an open-ended map.
    engines: BTreeMap<String, u32>,
    languages: BTreeMap<String, u32>,
    integrations: BTreeMap<String, u32>,
    gpu_backends: BTreeMap<String, u32>,
}

impl Counters {
    /// Remove an already-reported snapshot, leaving anything recorded since it
    /// was taken. Clearing outright would lose a run that finished while the
    /// summary was in flight.
    fn subtract(&mut self, sent: &Counters) {
        self.runs = self.runs.saturating_sub(sent.runs);
        self.runs_failed = self.runs_failed.saturating_sub(sent.runs_failed);
        self.runs_diarize = self.runs_diarize.saturating_sub(sent.runs_diarize);
        self.runs_translate = self.runs_translate.saturating_sub(sent.runs_translate);
        self.runs_forced_alignment = self
            .runs_forced_alignment
            .saturating_sub(sent.runs_forced_alignment);
        self.runs_dtw = self.runs_dtw.saturating_sub(sent.runs_dtw);
        self.runs_censor = self.runs_censor.saturating_sub(sent.runs_censor);
        self.runs_custom_template = self
            .runs_custom_template
            .saturating_sub(sent.runs_custom_template);
        self.runs_file_input = self.runs_file_input.saturating_sub(sent.runs_file_input);
        self.audio_seconds = self.audio_seconds.saturating_sub(sent.audio_seconds);
        for (tally, sent) in [
            (&mut self.engines, &sent.engines),
            (&mut self.languages, &sent.languages),
            (&mut self.integrations, &sent.integrations),
            (&mut self.gpu_backends, &sent.gpu_backends),
        ] {
            for (name, count) in sent {
                if let Some(remaining) = tally.get_mut(name) {
                    *remaining = remaining.saturating_sub(*count);
                    if *remaining == 0 {
                        tally.remove(name);
                    }
                }
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct State {
    /// The authoritative record of consent. The UI toggle writes it through
    /// [`telemetry_set_consent`]; every other command re-reads it under the
    /// same lock, so opting out mid-transcription cannot lose a race with a
    /// run that is about to be recorded.
    #[serde(default)]
    consented: bool,
    install_id: String,
    /// Start of the period the pending counters cover.
    period_start: DateTime<Utc>,
    last_sent: Option<DateTime<Utc>>,
    last_sent_version: Option<String>,
    pending: Counters,
}

impl State {
    fn new() -> Self {
        Self {
            consented: false,
            install_id: uuid::Uuid::new_v4().to_string(),
            period_start: Utc::now(),
            last_sent: None,
            last_sent_version: None,
            pending: Counters::default(),
        }
    }
}

fn state_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("no config dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
    Ok(dir.join(STATE_FILE))
}

fn load_state<R: Runtime>(app: &AppHandle<R>) -> Result<State, String> {
    let path = state_path(app)?;
    match std::fs::read_to_string(&path) {
        // A corrupt or partially written file is not worth surfacing to the
        // user; starting over costs at most one period of counters.
        Ok(raw) => Ok(serde_json::from_str(&raw).unwrap_or_else(|_| State::new())),
        Err(_) => Ok(State::new()),
    }
}

fn remove_state<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let path = state_path(app)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("remove {}: {e}", path.display()))?;
    }
    Ok(())
}

fn save_state<R: Runtime>(app: &AppHandle<R>, state: &State) -> Result<(), String> {
    let path = state_path(app)?;
    let raw = serde_json::to_string_pretty(state).map_err(|e| format!("serialize: {e}"))?;
    std::fs::write(&path, raw).map_err(|e| format!("write {}: {e}", path.display()))
}

// ─── Field normalisation ──────────────────────────────────────────────────
//
// The Worker rejects anything outside its allowlists, so the client applies the
// same rules up front: a payload it would reject is a payload we should not
// send, and clamping here keeps a UI change from silently breaking reporting.

fn normalise_id(value: &str, fallback: &str) -> String {
    let cleaned: String = value
        .trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        .take(40)
        .collect();
    if cleaned.is_empty() { fallback.to_string() } else { cleaned }
}

fn normalise_language(value: &str) -> String {
    let cleaned: String = value
        .trim()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(8)
        .collect();
    if cleaned.is_empty() { "auto".to_string() } else { cleaned.to_lowercase() }
}

fn allowed(value: &str, options: &[&str], fallback: &str) -> String {
    let lowered = value.trim().to_lowercase();
    if options.contains(&lowered.as_str()) { lowered } else { fallback.to_string() }
}

fn host_os() -> &'static str {
    match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "macos",
        _ => "linux",
    }
}

fn host_arch() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" => "aarch64",
        _ => "x86_64",
    }
}

fn top_key(tally: &BTreeMap<String, u32>, fallback: &str) -> String {
    tally
        .iter()
        .max_by_key(|(name, count)| (*count, std::cmp::Reverse(name.as_str())))
        .map(|(name, _)| name.clone())
        .unwrap_or_else(|| fallback.to_string())
}

// ─── Recording ────────────────────────────────────────────────────────────

/// One completed transcription, as reported by the frontend. Booleans describe
/// which features the run actually used, not which are enabled in settings.
#[derive(Debug, Deserialize)]
pub struct RunRecord {
    pub engine: String,
    pub language: String,
    pub integration: String,
    pub gpu_backend: String,
    pub failed: bool,
    pub diarize: bool,
    pub translate: bool,
    pub forced_alignment: bool,
    pub dtw: bool,
    pub censor: bool,
    pub custom_template: bool,
    pub file_input: bool,
    pub audio_seconds: f64,
}

fn bump(tally: &mut BTreeMap<String, u32>, key: String) {
    *tally.entry(key).or_insert(0) += 1;
}

/// Fold a run into the local counters. Called only while consent is granted;
/// declining means runs are never recorded in the first place, so there is
/// never a backlog waiting to be sent if consent is later given.
#[tauri::command]
pub fn telemetry_record_run<R: Runtime>(app: AppHandle<R>, run: RunRecord) -> Result<(), String> {
    if !is_available() {
        return Ok(());
    }
    let _guard = STATE_LOCK.lock().map_err(|_| "telemetry state lock poisoned")?;
    let mut state = load_state(&app)?;
    if !state.consented {
        return Ok(());
    }
    let c = &mut state.pending;

    c.runs = c.runs.saturating_add(1);
    if run.failed {
        c.runs_failed = c.runs_failed.saturating_add(1);
    }
    if run.diarize {
        c.runs_diarize = c.runs_diarize.saturating_add(1);
    }
    if run.translate {
        c.runs_translate = c.runs_translate.saturating_add(1);
    }
    if run.forced_alignment {
        c.runs_forced_alignment = c.runs_forced_alignment.saturating_add(1);
    }
    if run.dtw {
        c.runs_dtw = c.runs_dtw.saturating_add(1);
    }
    if run.censor {
        c.runs_censor = c.runs_censor.saturating_add(1);
    }
    if run.custom_template {
        c.runs_custom_template = c.runs_custom_template.saturating_add(1);
    }
    if run.file_input {
        c.runs_file_input = c.runs_file_input.saturating_add(1);
    }
    if run.audio_seconds.is_finite() && run.audio_seconds > 0.0 {
        c.audio_seconds = c.audio_seconds.saturating_add(run.audio_seconds as u64);
    }

    bump(&mut c.engines, normalise_id(&run.engine, "unknown"));
    bump(&mut c.languages, normalise_language(&run.language));
    bump(
        &mut c.integrations,
        allowed(
            &run.integration,
            &["davinci", "premiere", "aftereffects", "standalone"],
            "standalone",
        ),
    );
    bump(
        &mut c.gpu_backends,
        allowed(
            &run.gpu_backend,
            &["vulkan", "directml", "coreml", "metal", "cpu"],
            "cpu",
        ),
    );

    save_state(&app, &state)
}

// ─── Summary ──────────────────────────────────────────────────────────────

fn build_summary(state: &State, app_version: &str, ui_language: &str) -> serde_json::Value {
    let c = &state.pending;
    let period_days = (Utc::now() - state.period_start).num_days().clamp(0, 3650);
    serde_json::json!({
        "v": SCHEMA_VERSION,
        "install_id": state.install_id,
        "app_version": app_version,
        "channel": CHANNEL.unwrap_or("release"),
        "os": host_os(),
        "arch": host_arch(),
        "gpu_backend": top_key(&c.gpu_backends, "cpu"),
        "integration": top_key(&c.integrations, "standalone"),
        "ui_language": normalise_language(ui_language),
        "engine": top_key(&c.engines, "unknown"),
        "language": top_key(&c.languages, "auto"),
        "period_days": period_days,
        "runs": c.runs,
        "runs_failed": c.runs_failed,
        "runs_diarize": c.runs_diarize,
        "runs_translate": c.runs_translate,
        "runs_forced_alignment": c.runs_forced_alignment,
        "runs_dtw": c.runs_dtw,
        "runs_censor": c.runs_censor,
        "runs_custom_template": c.runs_custom_template,
        "runs_file_input": c.runs_file_input,
        "audio_minutes": (c.audio_seconds as f64 / 60.0).round() as u64,
    })
}

/// Exactly what would be sent right now, for the "see what's shared" button in
/// settings. Returns `null` when there is nothing pending.
#[tauri::command]
pub fn telemetry_pending_summary<R: Runtime>(
    app: AppHandle<R>,
    ui_language: String,
) -> Result<Option<serde_json::Value>, String> {
    if !is_available() {
        return Ok(None);
    }
    let _guard = STATE_LOCK.lock().map_err(|_| "telemetry state lock poisoned")?;
    let state = load_state(&app)?;
    if !state.consented || state.pending.runs == 0 {
        return Ok(None);
    }
    let version = app.package_info().version.to_string();
    Ok(Some(build_summary(&state, &version, &ui_language)))
}

fn is_due(state: &State, app_version: &str) -> bool {
    if state.pending.runs == 0 {
        return false;
    }
    let elapsed = Utc::now() - state.last_sent.unwrap_or(state.period_start);
    if elapsed >= Duration::days(PERIOD_DAYS) {
        return true;
    }
    // Only an *update* reports early. A first-ever report waits the full period
    // like any other, so a fresh install is not a same-day ping.
    let version_changed = state.last_sent.is_some()
        && state.last_sent_version.as_deref() != Some(app_version);
    version_changed && elapsed >= Duration::days(VERSION_CHANGE_MIN_DAYS)
}

fn sign(key: &str, body: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(key.as_bytes())
        .expect("HMAC accepts keys of any length");
    mac.update(body.as_bytes());
    mac.finalize()
        .into_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Send the pending summary if a full period has elapsed. Called on startup
/// while consent is granted; a failure is silent by design — the counters stay
/// put and the next launch tries again.
#[tauri::command]
pub async fn telemetry_flush<R: Runtime>(
    app: AppHandle<R>,
    ui_language: String,
) -> Result<bool, String> {
    let (Some(endpoint), Some(key)) = (ENDPOINT, SIGNING_KEY) else {
        return Ok(false);
    };

    let version = app.package_info().version.to_string();
    let (body, sent, install_id) = {
        let _guard = STATE_LOCK.lock().map_err(|_| "telemetry state lock poisoned")?;
        let state = load_state(&app)?;
        if !state.consented || !is_due(&state, &version) {
            return Ok(false);
        }
        let body = serde_json::to_string(&build_summary(&state, &version, &ui_language))
            .map_err(|e| format!("serialize summary: {e}"))?;
        (body, state.pending.clone(), state.install_id.clone())
    };

    let response = reqwest::Client::new()
        .post(endpoint)
        .header("content-type", "application/json")
        .header("x-autosubs-version", &version)
        .header("x-autosubs-signature", sign(key, &body))
        .timeout(std::time::Duration::from_secs(10))
        .body(body)
        .send()
        .await
        .map_err(|e| format!("send: {e}"))?;

    // 4xx means this build will never be accepted as-is (retired key, schema
    // drift). Clearing anyway avoids retrying a doomed payload forever; the
    // Worker treats a duplicate as accepted for the same reason.
    let accepted = response.status().is_success();
    let permanent = response.status().is_client_error();
    if !accepted && !permanent {
        return Err(format!("rejected: {}", response.status()));
    }

    let _guard = STATE_LOCK.lock().map_err(|_| "telemetry state lock poisoned")?;
    let mut state = load_state(&app)?;
    // Consent may have been withdrawn while the request was in flight, in which
    // case the state was deleted and `load_state` just minted a fresh identity.
    // Writing here would resurrect what the user asked to drop.
    if !state.consented || state.install_id != install_id {
        return Ok(accepted);
    }
    state.pending.subtract(&sent);
    state.period_start = Utc::now();
    state.last_sent = Some(Utc::now());
    state.last_sent_version = Some(version);
    save_state(&app, &state)?;
    Ok(accepted)
}

/// Record the user's answer. Opting out drops every counter and the install id
/// in the same locked step, so re-enabling later looks like a brand new install
/// rather than resuming an identity the user asked to stop sharing.
#[tauri::command]
pub fn telemetry_set_consent<R: Runtime>(app: AppHandle<R>, consented: bool) -> Result<(), String> {
    if !is_available() {
        return Ok(());
    }
    let _guard = STATE_LOCK.lock().map_err(|_| "telemetry state lock poisoned")?;
    if !consented {
        return remove_state(&app);
    }
    let mut state = load_state(&app)?;
    if state.consented {
        return Ok(());
    }
    state.consented = true;
    // Counters only ever start once consent exists, so the period starts here.
    state.period_start = Utc::now();
    save_state(&app, &state)
}

/// Whether the build can report. The consent prompt and the settings toggle are
/// hidden entirely when this is false.
#[tauri::command]
pub fn telemetry_available() -> bool {
    is_available()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state_with(pending: Counters, period_start: DateTime<Utc>) -> State {
        State {
            consented: true,
            install_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301".into(),
            period_start,
            last_sent: None,
            last_sent_version: None,
            pending,
        }
    }

    #[test]
    fn normalises_hostile_field_values() {
        assert_eq!(normalise_id("Whisper Large; DROP TABLE", "unknown"), "whisperlargedroptable");
        assert_eq!(normalise_id("   ", "unknown"), "unknown");
        assert_eq!(normalise_id(&"x".repeat(200), "unknown").len(), 40);
        assert_eq!(normalise_language("pt-BR"), "pt-br");
        assert_eq!(normalise_language(""), "auto");
        assert_eq!(allowed("Resolve", &["davinci"], "standalone"), "standalone");
    }

    #[test]
    fn picks_the_most_used_value_deterministically() {
        let mut tally = BTreeMap::new();
        tally.insert("a".to_string(), 2);
        tally.insert("b".to_string(), 5);
        assert_eq!(top_key(&tally, "z"), "b");
        assert_eq!(top_key(&BTreeMap::new(), "z"), "z");
    }

    #[test]
    fn summary_reports_whole_minutes_and_elapsed_days() {
        let pending = Counters {
            runs: 3,
            audio_seconds: 100,
            ..Default::default()
        };
        let state = state_with(pending, Utc::now() - Duration::days(9));
        let summary = build_summary(&state, "3.9.0", "en");
        assert_eq!(summary["audio_minutes"], 2);
        assert_eq!(summary["period_days"], 9);
        assert_eq!(summary["engine"], "unknown");
    }

    #[test]
    fn only_due_once_a_period_has_elapsed_or_the_version_changed() {
        let recent = state_with(Counters { runs: 1, ..Default::default() }, Utc::now());
        assert!(!is_due(&recent, "3.9.0"));

        let empty = state_with(Counters::default(), Utc::now() - Duration::days(30));
        assert!(!is_due(&empty, "3.9.0"));

        let old = state_with(
            Counters { runs: 1, ..Default::default() },
            Utc::now() - Duration::days(PERIOD_DAYS),
        );
        assert!(is_due(&old, "3.9.0"));

        let mut updated = state_with(
            Counters { runs: 1, ..Default::default() },
            Utc::now() - Duration::days(2),
        );
        updated.last_sent = Some(Utc::now() - Duration::days(2));
        updated.last_sent_version = Some("3.8.0".into());
        assert!(is_due(&updated, "3.9.0"));
        assert!(!is_due(&updated, "3.8.0"));
    }

    #[test]
    fn clearing_a_sent_summary_keeps_runs_recorded_while_it_was_in_flight() {
        let mut sent = Counters { runs: 2, runs_diarize: 1, audio_seconds: 60, ..Default::default() };
        bump(&mut sent.engines, "whisper".into());
        bump(&mut sent.engines, "whisper".into());

        let mut pending = Counters { runs: 3, runs_diarize: 1, audio_seconds: 90, ..Default::default() };
        bump(&mut pending.engines, "whisper".into());
        bump(&mut pending.engines, "whisper".into());
        bump(&mut pending.engines, "parakeet".into());

        pending.subtract(&sent);
        assert_eq!(pending.runs, 1);
        assert_eq!(pending.runs_diarize, 0);
        assert_eq!(pending.audio_seconds, 30);
        // Fully reported tallies are dropped rather than left at zero.
        assert_eq!(pending.engines.get("whisper"), None);
        assert_eq!(pending.engines.get("parakeet"), Some(&1));
    }

    #[test]
    fn a_first_report_waits_the_full_period_rather_than_firing_on_day_one() {
        let mut fresh = state_with(
            Counters { runs: 1, ..Default::default() },
            Utc::now() - Duration::days(2),
        );
        fresh.last_sent = None;
        fresh.last_sent_version = None;
        assert!(!is_due(&fresh, "3.9.0"));
    }

    #[test]
    fn signature_matches_a_known_hmac_sha256_vector() {
        assert_eq!(
            sign("key", "The quick brown fox jumps over the lazy dog"),
            "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
        );
    }
}
