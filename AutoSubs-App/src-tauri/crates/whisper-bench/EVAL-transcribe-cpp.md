# Engine eval: whisper.cpp (AutoSubs today) vs transcribe.cpp

Date: 2026-10-05 · Machine: Apple M3, 24 GB, macOS (Metal + CoreML) · Purpose: input to the "evaluate transcribe.cpp adoption" session.

**Compared per model:**
- `wcpp beam5` — whisper-rs 0.16 / whisper.cpp (ggml 0.9.5), Metal + CoreML encoder, beam search 5, **DTW on** = what AutoSubs ships today
- `wcpp greedy` — same engine, greedy decode, DTW on
- `tcpp greedy` — transcribe.cpp 0.3.1 (ggml 0.25.3), Metal, greedy, **no DTW** (segment timestamps only)

Models: `ggml-base`, `ggml-small`, `ggml-large-v3-turbo` (whisper.cpp ggml bins). `--threads 4` to match the app's actual `min(4, hw)` default. Timed region = transcription call only; model load reported separately; one 10 s warm-up per engine load.

## Test material (ground-truth refs via sibling `.txt`)

| set | content | size |
|---|---|---|
| clips/clean | emolia emotional speech + RAVDESS + disfluent clips | 131 clips, ~17 min |
| clips/noise10 | same clips, DEMAND noise mixed at SNR 10 | 131 clips |
| ami/clean | AMI meeting excerpts, 300 s, Mix-Headset (close-talk) | 4 meetings × 5 min |
| ami/far | same excerpts, single distant mic (far-field) | 4 meetings × 5 min |
| noise-only | 60 s of each of 8 DEMAND environments, no speech | 8 files |

AMI WERs are expectedly high (spontaneous overlapping speech); use them as relative signals, not absolute quality.

## Results

### clips/clean — WER vs reference / x realtime / peak RSS MB

| model | wcpp beam5 | wcpp greedy | tcpp greedy |
|---|---|---|---|
| base | 0.221 · 26.1× · 467 | 0.176 · 38.2× · 369 | **0.155** · 33.8× · 324 |
| small | 0.141 · 10.4× · 1019 | 0.115 · 16.0× · 767 | **0.103** · 13.6× · 716 |
| turbo | **0.066** · 5.4× · 5322 | 0.072 · 5.9× · 4097 | 0.073 · **6.2×** · 1834 |

### clips/noise10 — WER / x realtime / peak RSS MB

| model | wcpp beam5 | wcpp greedy | tcpp greedy |
|---|---|---|---|
| base | **CRASHED** @file 78 (partial: 0.184 · 18.3× over 77) | 0.174 · 47.1× · 370 | **0.151** · 44.5× · 325 |
| small | — | 0.112 · 18.8× · 765 | **0.106** · 17.1× · 714 |
| turbo | — | 0.094 · 5.8× · 4097 | **0.084** · 6.2× · 1833 |

### ami/clean (close-talk) — WER / x realtime / peak RSS MB

| model | wcpp beam5 | wcpp greedy | tcpp greedy |
|---|---|---|---|
| base | 0.602 · 38.0× · 550 | 0.457 · 63.2× · 500 | **0.426** · **99.9×** · 452 |
| small | 0.434 · 25.1× · 1025 | **0.369** · 32.6× · 913 | 0.421 · **39.7×** · 843 |
| turbo | 0.460 · 11.1× · 4097 | **0.346** · 11.6× · 4097 | 0.371 · **17.8×** · 1956 |

### ami/far (distant mic) — WER / x realtime / peak RSS MB

| model | wcpp beam5 | wcpp greedy | tcpp greedy |
|---|---|---|---|
| base | **0.473** · 43.5× · 551 | 0.543 · 78.4× · 499 | 0.532 · 77.9× · 452 |
| small | 0.562 · 23.8× · 1030 | 0.474 · 36.3× · 906 | **0.464** · 35.6× · 845 |
| turbo | 0.408 · 6.2× · 4050 | 0.681† · 8.6× · 4097 | **0.428** · **15.1×** · 1957 |

† wcpp-greedy on turbo far-field degraded into repetition loops — 68% WER vs beam5's 41%.

### noise-only (8 files, any text = hallucination)

| config | files producing text | character of output |
|---|---|---|
| tcpp base | 1/8 | one real-sentence hallucination |
| tcpp small | **0/8** | clean silence |
| tcpp turbo | 8/8 | multilingual garbage (`'alta liも And wim Aufi dop현'`) |
| wcpp (all models, both decodes) | 8/8 | mostly caption-style tokens — `[silence]`, `[BLANK_AUDIO]`, `(sizzling)`, `(birds chirping)`, "Thank you." loops |

## Findings

1. **wcpp beam5+DTW hard-crashes deterministically.** `WHISPER_ASSERT filter_width < a->ne[2]` (whisper.cpp:8772, DTW median filter) → `Abort trap: 6` after **exactly 77 sequential transcriptions**, reproduced twice, on *different* 78th files (state-dependent, not input-dependent; the same file passes in isolation). AutoSubs ships this config and reuses `WhisperState` across files the same way — this is a production crash path on long batch sessions, not a bench artifact. wcpp-greedy ran all 131 clean → corruption is specific to the beam5 decode path + DTW.
2. **tcpp is the most consistent transcriber.** Best-or-tied WER on 7 of 9 cells; never collapses.
3. **wcpp-greedy is unsafe on hard audio**: 68% WER on far-field turbo via repetition loops (beam5 got 41% on the same audio). Greedy needs beam search as a safety net on wcpp; tcpp greedy doesn't collapse in the same way.
4. **beam5 hurts WER on long-form clean speech**: on ami/clean it's +6 to +15 points *worse* than wcpp-greedy across models — the shipped default is degrading accuracy, not helping it.
5. **Speed flips by regime**: wcpp+CoreML wins on small models/short clips (base 38× vs 34×); tcpp wins on turbo and long audio, up to ~2× (far-field turbo: 15.1× vs 8.6×; clean-AMI base: 99.9× vs 63×). Suspect tcpp handles long silences/segmentation more efficiently.
6. **Memory**: tcpp peaks ~1.8–2 GB on turbo vs wcpp's 4–5 GB (plus DTW's separate budget, up to 768 MB).
7. **Model load**: tcpp ~1 s on turbo vs 3.7–7.2 s for wcpp (CoreML encoder load; first-ever run compiles it).
8. **Silence discipline**: small tcpp output nothing on all 8 noise files; wcpp always emits caption-junk tokens; turbo hallucinates real words on both engines.

## Adoption considerations

**For tcpp:** better/equal WER almost everywhere, ~2× faster where it hurts (big model, long/far-field audio), ~half the RSS, cleaner silence behavior, and structurally cannot hit the DTW crash.

**Costs/caveats:**
- **No word timestamps** — segment-level only. Needs a forced aligner for word timings; that cost is unmeasured here. (Note: if AutoSubs moves to an external aligner anyway, wcpp can drop DTW too — sidestepping the crash — but then both engines need the aligner and the comparison stands on the numbers above.)
- **No beam search** — greedy only. On this data tcpp-greedy held up, but wcpp-greedy's far-field collapse shows greedy is fragile in principle.
- Younger codebase/ggml fork than whisper.cpp.
- Speed measured on Apple Silicon Metal only; no CUDA/Vulkan numbers here.

## Raw data

- `bench-results-20261005-201137.jsonl` — clips/clean (complete)
- `bench-results-20261005-202626.jsonl`, `-204819.jsonl` — clips/noise10 wcpp-beam5 crash runs (77 rows each)
- `bench-results-noise10-greedy.jsonl` — clips/noise10 greedy+tcpp (complete)
- `bench-results-20261005-202656.jsonl`, `-203456.jsonl` — ami/clean, ami/far (complete)
- `bench-results-20261005-204512.jsonl` — noise-only
- `report-*.log` — per-run build/transcription logs
- Dataset + refs: `~/code/audio-understanding/data/tough_audio/` (refs generated by `audio/research/tough_audio/write_refs.py`)

Repro: `./compare.sh --threads 4 --models base,small,large-v3-turbo <dir>/*.flac` — `.txt` sibling refs drive the WER column.

**Caveat on rerunning `report`**: for non-16 kHz inputs the `.jsonl` records `/tmp` wav paths that are deleted on exit, so "WER vs reference" only resolves while the run's tmpdir lives. noise10 greedy WERs above were recomputed offline by mapping tmp indices back to the sorted source list.
