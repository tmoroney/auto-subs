# whisper-bench

Compares the Whisper path AutoSubs ships today — **whisper-rs 0.16** with
Metal + the CoreML encoder, beam search and DTW word refinement — against
**transcribe.cpp 0.3.1** (Metal), on the same audio, same model files, same
machine.

## Why two binaries

whisper-rs (via whisper.cpp) and transcribe.cpp each statically link their own
ggml (0.9.5 vs 0.25.3). They can never be linked into the same binary — the
symbols collide — so `whisper-bench` compiles one engine per binary:

- `--features wcpp` → whisper.cpp engine (AutoSubs today)
- `--features tcpp` → transcribe.cpp engine
- `--features metal` → Metal GPU for whichever engine is enabled
- `--features coreml` → whisper.cpp CoreML encoder (wcpp only)

Enabling both or neither engine feature is a compile error. `compare.sh`
builds them into separate target dirs (`target-wcpp`, `target-tcpp`).

## Running on a Mac

```bash
cd AutoSubs-App/src-tauri/crates/whisper-bench
./compare.sh --models large-v3-turbo ~/path/to/clip.mp3 ~/path/to/clip2.wav
```

It looks for `ggml-<name>.bin` under `~/Library/Caches/com.autosubs` (the
hf-hub model cache AutoSubs already populates), converts non-16 kHz-mono input
with ffmpeg, then runs per model: **wcpp beam5 + DTW** (AutoSubs today),
**wcpp greedy**, **tcpp greedy**, and prints a report.

Useful flags: `--model-dir DIR`, `--lang <code|auto>` (default `en`),
`--no-gpu`. Place a `<audio>.txt` next to each input to get a "WER vs
reference" column.

Direct usage:

```bash
cargo build --release --features 'wcpp,metal,coreml' --target-dir target-wcpp
cargo build --release --features 'tcpp,metal'        --target-dir target-tcpp

target-wcpp/release/whisper-bench \
  --model ~/Library/Caches/com.autosubs/.../ggml-large-v3-turbo.bin \
  --audio clip.wav --decode beam5 --label wcpp-beam5 --out results.jsonl

target-tcpp/release/whisper-bench \
  --model .../ggml-large-v3-turbo.bin \
  --audio clip.wav --decode greedy --label tcpp-greedy --out results.jsonl

cargo run --release --features wcpp --bin report -- results.jsonl
```

## Columns

| column | meaning |
|---|---|
| load_ms | model load time (for wcpp+CoreML this includes the first-load CoreML compile) |
| transcribe_s | total wall time of the transcription calls only, summed over files |
| x realtime | total audio seconds / total transcribe seconds (higher is faster) |
| peak RSS MB | peak resident memory of the bench process (getrusage) |
| WER vs AutoSubs today | pooled word-error vs the wcpp/beam5/dtw transcript |
| WER vs reference | pooled word-error vs a sibling `.txt` next to the audio |

Each engine load runs one untimed warm-up on the first 10 s of the first file
before timing starts. transcribe.cpp uses segment timestamps and its default
Whisper decode settings; `n_threads` is passed via `SessionOptions` (0 =
library default when `--threads` is not given... `--threads` defaults to
`available_parallelism` here).

## Caveats

- **First wcpp+CoreML load is slow by design** — the CoreML model is compiled
  on first use. `load_ms` includes it; run twice if you want the warm number.
- **transcribe.cpp has no beam search** — `beam5` is rejected for tcpp. The
  fair comparison is wcpp-greedy vs tcpp-greedy; beam5 is "AutoSubs today".
- **transcribe.cpp gives segment-level timestamps only** for Whisper. In the
  app it would need the forced aligner for word timings — that cost is not
  measured here.
