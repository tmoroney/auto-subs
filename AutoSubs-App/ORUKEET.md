# Orukeet

Orukeet is an optional local model in the existing Parakeet engine. Download it from the model picker; it needs no hosted API or account. The INT8 bundle is 672 MB and supports 25 European languages. The picker uses a conservative 4 GB memory budget. Accuracy and speed meters are omitted until broadly rated, and existing recommendations stay unchanged.

Weights are CC BY-SA 4.0. License and attribution files are downloaded alongside the model, including credits to Derek Zeng for decoder composition and Ivan Stupakov for the shared preprocessor. [Pinned files, licenses and provenance](https://huggingface.co/oruk/orukeet/tree/1751fce6ecde442f14543cf1804800c49b3e415c/onnx/combined-v0.1.0-int8).

## Measured performance

Using AutoSubs' transcribe-rs 0.3.11 Parakeet loader and word-timestamp settings on an AMD EPYC 9B45 CPU, warm median inference was **230 ms** for Orukeet versus **300 ms** for Parakeet v3 (23.2% lower). p95 was **378 versus 501 ms**; sequential throughput was **40.13 versus 30.63 audio seconds per processing second**.

The fixed corpus contains the first five FLEURS validation clips in each of English, German, Spanish, French, Russian and Ukrainian: 30 clips, 629 normalized reference words, two timed passes per model in baseline/candidate/candidate/baseline order. Both models had 9.70% aggregate WER, with mixed per-language results; German and Russian regressed. This small sample does not establish general accuracy equivalence or superiority. Timing excludes WAV reads, model load, VAD, UI and editor integration. Sequential throughput is not server concurrency.

[Raw results, per-language scores, hashes and method](https://huggingface.co/oruk/orukeet/blob/1751fce6ecde442f14543cf1804800c49b3e415c/onnx/combined-v0.1.0-int8/README.md).

## Checks

Run `npm run build:web` and `node scripts/check-orukeet-model.cjs` from AutoSubs-App. The latter checks model routing, language filtering, unchanged recommendations and all eight locales.

Rust unit tests cover the manifest and existing engine behavior. The opt-in `orukeet_live` test downloads the real bundle and exercises cache reuse, transcription with and without VAD, word timestamps, user offset, cancellation before processing, malformed config rejection and recovery. Set `AUTOSUBS_ORUKEET_TEST_AUDIO` to a 16 kHz mono PCM16 WAV containing the English FLEURS satellite sentence, repeated beyond 30 seconds to exercise chunking, and `AUTOSUBS_ORUKEET_TEST_CACHE` to a disposable directory. Run the test with `--ignored --nocapture` using your platform's Cargo features. Native editor bridges and signed installers are outside this test.
