/**
 * AutoSubs usage telemetry endpoint.
 *
 * Accepts one batched usage summary per install, at most once per reporting
 * period, and writes a single Analytics Engine data point per accepted
 * submission. Everything else — bad signature, unknown release, malformed
 * payload, duplicate, flood — is dropped before it costs a write.
 *
 * See README.md for the deployment and key-rotation workflow.
 */

import { parseSigningKeys, verifyBody } from "./hmac";
import { MAX_BODY_BYTES, validateUsageSummary } from "./schema";

export interface Env {
  /** Analytics Engine dataset the summaries are written to. */
  USAGE: AnalyticsEngineDataset;
  /** KV namespace used only for per-install submission cooldowns. */
  DEDUPE: KVNamespace;
  /** Per-IP limiter, so a flood cannot burn the daily write budget. */
  RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /** JSON map of release version -> signing key. Set with `wrangler secret put`. */
  SIGNING_KEYS?: string;
  /** Minimum seconds between accepted submissions from one install. */
  MIN_INTERVAL_SECONDS?: string;
}

const VERSION_HEADER = "x-autosubs-version";
const SIGNATURE_HEADER = "x-autosubs-signature";

/** Six days, giving a weekly client a day of slack for clock drift and downtime. */
const DEFAULT_MIN_INTERVAL_SECONDS = 6 * 24 * 60 * 60;

/**
 * Responses are intentionally bodiless and uniform: the endpoint tells a caller
 * whether it accepted the request and nothing else. The client does not act on
 * the reason, and neither should an abuser.
 */
function status(code: number): Response {
  return new Response(null, { status: code });
}

/**
 * Reads the body without ever buffering more than `max` bytes: `content-length`
 * is client-supplied and absent entirely on a chunked request, so the stream is
 * capped as it arrives rather than measured afterwards. Returns null if the
 * body is too large.
 */
async function readCappedBody(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok\n", { headers: { "content-type": "text/plain" } });
    }
    if (url.pathname !== "/v1/usage") return status(404);
    if (request.method !== "POST") return status(405);

    // Limit per client IP first — this runs before any crypto or KV work, so
    // the expensive path is never reached by a flood.
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) return status(429);

    const body = await readCappedBody(request, MAX_BODY_BYTES);
    if (body === null) return status(413);

    const version = request.headers.get(VERSION_HEADER);
    const signature = request.headers.get(SIGNATURE_HEADER);
    if (!version || !signature) return status(401);

    // Unknown release => no key => rejected. This is what makes rotation work:
    // dropping a version from SIGNING_KEYS retires any key extracted from it.
    const key = parseSigningKeys(env.SIGNING_KEYS)[version];
    if (!key) return status(401);
    if (!(await verifyBody(key, body, signature))) return status(401);

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return status(400);
    }

    const result = validateUsageSummary(parsed);
    if (!result.ok) return status(400);
    const summary = result.value;

    // A signature proves the payload came from a real build, not that the
    // version header is honest, so bind the two together.
    if (summary.app_version !== version) return status(401);

    const minInterval = Number(env.MIN_INTERVAL_SECONDS) || DEFAULT_MIN_INTERVAL_SECONDS;
    const dedupeKey = `install:${summary.install_id}`;
    if (await env.DEDUPE.get(dedupeKey)) {
      // Already reported this period. Accepted from the client's point of view
      // so it clears its counters instead of retrying forever.
      return status(202);
    }

    // Claim the period *before* the write. KV is eventually consistent, so two
    // simultaneous replays can still both slip through; awaiting the put narrows
    // the window to KV's propagation delay rather than leaving it open for the
    // rest of the request.
    await env.DEDUPE.put(dedupeKey, "1", { expirationTtl: minInterval });

    env.USAGE.writeDataPoint({
      // One index per data point; the install id keeps Analytics Engine's
      // sampling coherent per install rather than per request.
      indexes: [summary.install_id],
      blobs: [
        summary.app_version,
        summary.channel,
        summary.os,
        summary.arch,
        summary.gpu_backend,
        summary.integration,
        summary.engine,
        summary.language,
        summary.ui_language,
        // Coarse geography from Cloudflare's edge. The IP itself is never stored.
        (request.cf?.country as string | undefined) ?? "XX",
      ],
      doubles: [
        summary.runs,
        summary.runs_failed,
        summary.runs_diarize,
        summary.runs_translate,
        summary.runs_forced_alignment,
        summary.runs_dtw,
        summary.runs_censor,
        summary.runs_custom_template,
        summary.runs_file_input,
        summary.audio_minutes,
        summary.period_days,
      ],
    });

    return status(204);
  },
};
