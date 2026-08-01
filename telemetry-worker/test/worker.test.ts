import { describe, expect, it } from "vitest";

import worker, { type Env } from "../src/index";
import { parseSigningKeys, signBody, timingSafeEqual } from "../src/hmac";
import { validateUsageSummary } from "../src/schema";

const KEY = "test-signing-key";
const VERSION = "3.9.0";

function validSummary(overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    install_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    app_version: VERSION,
    channel: "release",
    os: "windows",
    arch: "x86_64",
    gpu_backend: "directml",
    integration: "davinci",
    ui_language: "en",
    engine: "whisper-large-v3",
    language: "auto",
    period_days: 7,
    runs: 12,
    runs_failed: 1,
    runs_diarize: 3,
    runs_translate: 0,
    runs_forced_alignment: 2,
    runs_dtw: 9,
    runs_censor: 0,
    runs_custom_template: 4,
    runs_file_input: 2,
    audio_minutes: 143,
    ...overrides,
  };
}

interface Harness {
  env: Env;
  ctx: ExecutionContext;
  writes: unknown[];
  kv: Map<string, string>;
}

function harness(options: { allowRate?: boolean } = {}): Harness {
  const writes: unknown[] = [];
  const kv = new Map<string, string>();
  const env = {
    USAGE: { writeDataPoint: (point: unknown) => writes.push(point) },
    DEDUPE: {
      get: async (key: string) => kv.get(key) ?? null,
      put: async (key: string, value: string) => void kv.set(key, value),
    },
    RATE_LIMITER: { limit: async () => ({ success: options.allowRate ?? true }) },
    SIGNING_KEYS: JSON.stringify({ [VERSION]: KEY }),
  } as unknown as Env;
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => void promise,
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
  return { env, ctx, writes, kv };
}

async function post(
  h: Harness,
  body: unknown,
  init: { key?: string; version?: string; signature?: string } = {},
) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const signature = init.signature ?? (await signBody(init.key ?? KEY, raw));
  const request = new Request("https://telemetry.example/v1/usage", {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      "x-autosubs-version": init.version ?? VERSION,
      "x-autosubs-signature": signature,
    },
  });
  return worker.fetch(request, h.env, h.ctx);
}

describe("hmac", () => {
  it("round-trips a signature and rejects a tampered body", async () => {
    const signature = await signBody(KEY, "hello");
    expect(timingSafeEqual(signature, await signBody(KEY, "hello"))).toBe(true);
    expect(timingSafeEqual(signature, await signBody(KEY, "hell0"))).toBe(false);
  });

  it("ignores malformed key maps rather than throwing", () => {
    expect(parseSigningKeys(undefined)).toEqual({});
    expect(parseSigningKeys("not json")).toEqual({});
    expect(parseSigningKeys('["3.9.0"]')).toEqual({});
    expect(parseSigningKeys('{"3.9.0": 1}')).toEqual({});
    expect(parseSigningKeys('{"3.9.0": "k"}')).toEqual({ "3.9.0": "k" });
  });
});

describe("schema", () => {
  it("accepts a well-formed summary", () => {
    expect(validateUsageSummary(validSummary()).ok).toBe(true);
  });

  it.each([
    ["v", { v: 2 }],
    ["install_id", { install_id: "not-a-uuid" }],
    ["app_version", { app_version: "3.9" }],
    ["os", { os: "freebsd" }],
    ["engine", { engine: "Whisper Large; DROP TABLE" }],
    ["language", { language: "a-very-long-language-tag" }],
    ["runs", { runs: 0 }],
    ["runs", { runs: 1.5 }],
    ["audio_minutes", { audio_minutes: -1 }],
  ])("rejects a bad %s", (field, override) => {
    const result = validateUsageSummary(validSummary(override));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(field);
  });

  it("rejects feature counts that exceed the run count", () => {
    const result = validateUsageSummary(validSummary({ runs: 2, runs_diarize: 3 }));
    expect(result.ok).toBe(false);
  });
});

describe("worker", () => {
  it("accepts a signed summary and writes exactly one data point", async () => {
    const h = harness();
    const response = await post(h, validSummary());
    expect(response.status).toBe(204);
    expect(h.writes).toHaveLength(1);
  });

  it("rejects an unsigned or badly signed request without writing", async () => {
    const h = harness();
    expect((await post(h, validSummary(), { key: "wrong-key" })).status).toBe(401);
    expect((await post(h, validSummary(), { signature: "00" })).status).toBe(401);
    expect(h.writes).toHaveLength(0);
  });

  it("rejects a version with no signing key, which is how rotation retires keys", async () => {
    const h = harness();
    const summary = validSummary({ app_version: "1.0.0" });
    const response = await post(h, summary, { version: "1.0.0" });
    expect(response.status).toBe(401);
  });

  it("rejects a signature that does not cover the claimed version", async () => {
    const h = harness();
    const response = await post(h, validSummary({ app_version: "3.8.0" }));
    expect(response.status).toBe(401);
  });

  it("drops a second submission from the same install within the cooldown", async () => {
    const h = harness();
    expect((await post(h, validSummary())).status).toBe(204);
    expect((await post(h, validSummary())).status).toBe(202);
    expect(h.writes).toHaveLength(1);
  });

  it("still accepts a different install during another install's cooldown", async () => {
    const h = harness();
    await post(h, validSummary());
    const other = validSummary({ install_id: "9f8b4c22-1d6e-4a70-b9c1-2e5f7a3d0b44" });
    expect((await post(h, other)).status).toBe(204);
    expect(h.writes).toHaveLength(2);
  });

  it("rate limits before doing any crypto or storage work", async () => {
    const h = harness({ allowRate: false });
    expect((await post(h, validSummary())).status).toBe(429);
    expect(h.writes).toHaveLength(0);
  });

  it("rejects an oversized body", async () => {
    const h = harness();
    const response = await post(h, validSummary({ engine: "x".repeat(4096) }));
    expect(response.status).toBe(413);
  });

  it("rejects malformed JSON and unknown routes", async () => {
    const h = harness();
    expect((await post(h, "{not json")).status).toBe(400);
    const stray = new Request("https://telemetry.example/", { method: "POST" });
    expect((await worker.fetch(stray, h.env, h.ctx)).status).toBe(404);
    const wrongMethod = new Request("https://telemetry.example/v1/usage");
    expect((await worker.fetch(wrongMethod, h.env, h.ctx)).status).toBe(405);
  });
});
