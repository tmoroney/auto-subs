# AutoSubs telemetry worker

Cloudflare Worker that ingests the anonymous usage summaries described in
[PRIVACY.md](../PRIVACY.md). One accepted submission = one Analytics Engine data
point. Everything else is rejected before it costs anything.

## Why it is shaped like this

The endpoint URL and the signing key are compiled into the desktop app, which
means both are extractable from any shipped binary. That is unavoidable for a
client-side app, so the design assumes they are public-but-unadvertised and
concentrates on making abuse *cheap to absorb*:

| Layer | What it stops |
| --- | --- |
| Per-IP rate limit (`ratelimits` binding) | Bursts, before any crypto or storage work runs |
| HMAC signature, keyed per release | Casual scripting against the endpoint |
| Dropping old versions from `SIGNING_KEYS` | A key extracted from a shipped build, once that release ages out |
| Per-install cooldown in KV | One install reporting more than once per period |
| Strict schema (closed allowlists, bounded ints) | Arbitrary data being stored, and cardinality blowups |
| One data point per submission | Ingest cost scaling with abuse |

Reporting is weekly per install, so the free tier (100k Workers requests/day,
100k Analytics Engine data points/day) covers roughly 700k weekly-active
installs before anything needs paying for.

## Endpoint

```
POST /v1/usage
  x-autosubs-version:   3.9.0            # release the build came from
  x-autosubs-signature: <hex>            # HMAC-SHA256(signing key, raw body)
  content-type:         application/json
GET  /health
```

Responses are bodiless: `204` accepted, `202` duplicate within the cooldown
(the client clears its counters and stops retrying), `400` malformed, `401`
unsigned/unknown release, `413` oversized, `429` rate limited.

The payload schema lives in [`src/schema.ts`](src/schema.ts) — that file is the
contract, and the Rust client in
`AutoSubs-App/src-tauri/src/telemetry.rs` mirrors it field for field.

## First-time setup

```bash
cd telemetry-worker
npm install
npx wrangler login

# KV namespace for per-install cooldowns; paste the printed id into wrangler.toml
npx wrangler kv namespace create DEDUPE

# Signing keys, as a version -> key map. Generate a key with:
#   openssl rand -hex 32
npx wrangler secret put SIGNING_KEYS
# paste e.g. {"3.9.0":"<hex>"}

npm test
npx wrangler deploy
```

The Analytics Engine dataset is created implicitly on first write — nothing to
provision.

## Per-release key rotation

Each release gets its own key, and the Worker only accepts keys still listed in
`SIGNING_KEYS`. Keeping the last ~3 releases means users who have not updated
yet still report, while a key lifted from an older build is already dead.

1. `openssl rand -hex 32` — new key for the release.
2. `npx wrangler secret put SIGNING_KEYS` with the new version added and the
   oldest one removed:
   ```json
   {"3.9.0": "…", "3.10.0": "…", "3.11.0": "…"}
   ```
3. Update the `TELEMETRY_KEY` GitHub secret (and your local `.env` for Windows
   builds) to the new key before tagging the release.

If a release ever ships with a key that is not in `SIGNING_KEYS`, those clients
get `401`, keep their counters, and start reporting once the secret catches up.

## Local development

```bash
npx wrangler dev          # http://localhost:8787
```

Send a signed request:

```bash
BODY='{"v":1,"install_id":"3f2504e0-4f89-41d3-9a0c-0305e82c3301","app_version":"3.9.0","channel":"release","os":"linux","arch":"x86_64","gpu_backend":"vulkan","integration":"davinci","ui_language":"en","engine":"whisper-large-v3","language":"auto","period_days":7,"runs":3,"runs_failed":0,"runs_diarize":1,"runs_translate":0,"runs_forced_alignment":0,"runs_dtw":3,"runs_censor":0,"runs_custom_template":1,"runs_file_input":0,"audio_minutes":42}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$KEY" -hex | awk '{print $2}')
curl -i -X POST http://localhost:8787/v1/usage \
  -H "content-type: application/json" \
  -H "x-autosubs-version: 3.9.0" \
  -H "x-autosubs-signature: $SIG" \
  --data "$BODY"
```

## Querying the data

Analytics Engine is queried over SQL via the HTTP API. Column names map to the
`writeDataPoint` call in [`src/index.ts`](src/index.ts):

| Column | Field |
| --- | --- |
| `index1` | install id |
| `blob1..blob10` | app version, channel, os, arch, gpu backend, integration, engine, language, ui language, country |
| `double1..double11` | runs, failed, diarize, translate, forced alignment, dtw, censor, custom template, file input, audio minutes, period days |

Feature adoption over the last 30 days, weighted by runs rather than installs:

```sql
SELECT
  sum(double3) / sum(double1) AS diarize_share,
  sum(double4) / sum(double1) AS translate_share,
  sum(double5) / sum(double1) AS forced_alignment_share,
  sum(double9) / sum(double1) AS file_input_share
FROM autosubs_usage
WHERE timestamp > now() - INTERVAL '30' DAY
```

```bash
curl "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_API_TOKEN" --data "$SQL"
```

Read absolute totals with suspicion — they are the number most easily inflated
by junk submissions. Ratios between features are what this data is for, and they
are far harder to skew convincingly.
