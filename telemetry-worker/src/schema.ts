/**
 * Wire schema for the usage summary the app sends.
 *
 * Every field is either a bounded integer or a value from a closed allowlist —
 * there is no free-form text anywhere, so a malicious client cannot use the
 * endpoint to store arbitrary data, and a buggy client cannot blow up the
 * cardinality of the Analytics Engine dataset.
 */

export const SCHEMA_VERSION = 1;

/** Reject anything larger before we even parse it. */
export const MAX_BODY_BYTES = 2048;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SEMVER = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
/** BCP-47-ish: `en`, `pt-BR`. Also allows `auto` for "let the model decide". */
const LANGUAGE = /^(auto|[a-z]{2,3}(-[A-Za-z]{2,4})?)$/;

const OS = ["windows", "macos", "linux"] as const;
const ARCH = ["x86_64", "aarch64"] as const;
const GPU_BACKEND = ["vulkan", "directml", "coreml", "metal", "cpu"] as const;
const INTEGRATION = ["davinci", "premiere", "aftereffects", "standalone"] as const;
const CHANNEL = ["release"] as const;

/**
 * Model identifiers change with every release, so they cannot live in a fixed
 * allowlist here. They are constrained by shape instead: short, lowercase, and
 * drawn from the character set the app's own model ids use.
 */
const ENGINE = /^[a-z0-9][a-z0-9._-]{0,39}$/;

export interface UsageSummary {
  v: number;
  install_id: string;
  app_version: string;
  channel: (typeof CHANNEL)[number];
  os: (typeof OS)[number];
  arch: (typeof ARCH)[number];
  gpu_backend: (typeof GPU_BACKEND)[number];
  integration: (typeof INTEGRATION)[number];
  ui_language: string;
  /** Most-used model since the last submission. */
  engine: string;
  /** Most-used transcription language since the last submission. */
  language: string;
  /** Days covered by this summary. */
  period_days: number;
  runs: number;
  runs_failed: number;
  runs_diarize: number;
  runs_translate: number;
  runs_forced_alignment: number;
  runs_dtw: number;
  runs_censor: number;
  runs_custom_template: number;
  runs_file_input: number;
  /** Total transcribed audio, rounded to whole minutes. */
  audio_minutes: number;
}

/** Counter fields, with the inclusive upper bound we consider plausible. */
const COUNTERS: Array<[keyof UsageSummary, number]> = [
  ["period_days", 3650],
  ["runs", 100_000],
  ["runs_failed", 100_000],
  ["runs_diarize", 100_000],
  ["runs_translate", 100_000],
  ["runs_forced_alignment", 100_000],
  ["runs_dtw", 100_000],
  ["runs_censor", 100_000],
  ["runs_custom_template", 100_000],
  ["runs_file_input", 100_000],
  ["audio_minutes", 10_000_000],
];

export type ValidationResult =
  | { ok: true; value: UsageSummary }
  | { ok: false; error: string };

function isOneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function isBoundedInt(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

/**
 * Validate an already-parsed body. Returns the typed summary or the name of the
 * first field that failed — the caller logs nothing and returns a bare 400, so
 * the reason stays server-side.
 */
export function validateUsageSummary(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body" };
  }
  const b = body as Record<string, unknown>;

  if (b.v !== SCHEMA_VERSION) return { ok: false, error: "v" };
  if (typeof b.install_id !== "string" || !UUID_V4.test(b.install_id)) {
    return { ok: false, error: "install_id" };
  }
  if (typeof b.app_version !== "string" || !SEMVER.test(b.app_version)) {
    return { ok: false, error: "app_version" };
  }
  if (!isOneOf(CHANNEL, b.channel)) return { ok: false, error: "channel" };
  if (!isOneOf(OS, b.os)) return { ok: false, error: "os" };
  if (!isOneOf(ARCH, b.arch)) return { ok: false, error: "arch" };
  if (!isOneOf(GPU_BACKEND, b.gpu_backend)) return { ok: false, error: "gpu_backend" };
  if (!isOneOf(INTEGRATION, b.integration)) return { ok: false, error: "integration" };
  if (typeof b.ui_language !== "string" || !LANGUAGE.test(b.ui_language)) {
    return { ok: false, error: "ui_language" };
  }
  if (typeof b.language !== "string" || !LANGUAGE.test(b.language)) {
    return { ok: false, error: "language" };
  }
  if (typeof b.engine !== "string" || !ENGINE.test(b.engine)) {
    return { ok: false, error: "engine" };
  }

  for (const [field, max] of COUNTERS) {
    if (!isBoundedInt(b[field], max)) return { ok: false, error: field as string };
  }

  // A summary covering zero runs carries no information; treat it as a bug in
  // the client rather than storing an empty row.
  if ((b.runs as number) < 1) return { ok: false, error: "runs" };

  // Per-feature counts are subsets of the total, so anything above it means the
  // payload is inconsistent (hand-rolled, or a client bug worth not ingesting).
  const runs = b.runs as number;
  for (const [field] of COUNTERS) {
    if (field === "runs" || field === "period_days" || field === "audio_minutes") continue;
    if ((b[field] as number) > runs) return { ok: false, error: field as string };
  }

  return { ok: true, value: b as unknown as UsageSummary };
}
