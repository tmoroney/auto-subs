/**
 * Client half of the anonymous usage telemetry described in PRIVACY.md.
 *
 * The backend owns storage, batching and sending (see
 * `src-tauri/src/telemetry.rs`); this module only decides *whether* to talk to
 * it. Two gates must both be open: the build has an endpoint compiled in
 * (`isTelemetryBuild`), and the user has opted in (`shareUsageData === true`).
 * Runs are not recorded while opted out, so opting in later never uploads
 * anything from before consent was given.
 */

import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";

import type { Integration } from "@/contexts/IntegrationContext";

export interface UsageRun {
  /** Model id, e.g. `whisper-large-v3`. */
  engine: string;
  /** Requested transcription language, or `auto`. */
  language: string;
  integration: Integration | "standalone";
  gpuBackend: string;
  failed: boolean;
  diarize: boolean;
  translate: boolean;
  forcedAlignment: boolean;
  dtw: boolean;
  censor: boolean;
  customTemplate: boolean;
  fileInput: boolean;
  audioSeconds: number;
}

/** Whether this build has telemetry compiled in at all. Cached after first call. */
let availability: Promise<boolean> | null = null;

export function isTelemetryBuild(): Promise<boolean> {
  if (!availability) {
    availability = invoke<boolean>("telemetry_available").catch(() => false);
  }
  return availability;
}

/**
 * The acceleration backend the run would have used. Derived from the platform
 * and the GPU toggle rather than reported by the engine, so read it as "what
 * this install is configured for", not "what ONNX actually selected".
 */
export async function resolveGpuBackend(enableGpu: boolean): Promise<string> {
  if (!enableGpu) return "cpu";
  try {
    switch (await platform()) {
      case "macos":
        return "coreml";
      case "windows":
        return "directml";
      default:
        return "vulkan";
    }
  } catch {
    return "cpu";
  }
}

/** Fold a finished run into the local counters. Never throws. */
export async function recordUsageRun(
  consented: boolean,
  run: UsageRun,
): Promise<void> {
  if (!consented || !(await isTelemetryBuild())) return;
  try {
    await invoke("telemetry_record_run", {
      run: {
        engine: run.engine,
        language: run.language,
        integration: run.integration,
        gpu_backend: run.gpuBackend,
        failed: run.failed,
        diarize: run.diarize,
        translate: run.translate,
        forced_alignment: run.forcedAlignment,
        dtw: run.dtw,
        censor: run.censor,
        custom_template: run.customTemplate,
        file_input: run.fileInput,
        audio_seconds: run.audioSeconds,
      },
    });
  } catch (error) {
    console.warn("[telemetry] failed to record run:", error);
  }
}

/**
 * Send the pending summary if a reporting period has elapsed. Called once per
 * launch; the backend decides whether anything is actually due.
 */
export async function flushUsage(consented: boolean, uiLanguage: string): Promise<void> {
  if (!consented || !(await isTelemetryBuild())) return;
  try {
    await invoke("telemetry_flush", { uiLanguage });
  } catch (error) {
    console.warn("[telemetry] flush failed:", error);
  }
}

/** Exactly what would be sent right now, for the "see what's shared" preview. */
export async function pendingUsageSummary(
  uiLanguage: string,
): Promise<Record<string, unknown> | null> {
  try {
    return await invoke<Record<string, unknown> | null>("telemetry_pending_summary", {
      uiLanguage,
    });
  } catch (error) {
    console.warn("[telemetry] failed to read pending summary:", error);
    return null;
  }
}

/** Forget the install id and every counter. Used when consent is withdrawn. */
export async function resetUsageData(): Promise<void> {
  try {
    await invoke("telemetry_reset");
  } catch (error) {
    console.warn("[telemetry] failed to reset local data:", error);
  }
}
