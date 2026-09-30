# AutoSubs Import Notes

This crate was internalized from Tom Moroney's `tmoroney/pyannote-rs` fork and
updated through revision `234801254990354b1243fc6e53963771157ea97d`.

The fork was originally based on `thewh1teagle/pyannote-rs` and remains under
the MIT license preserved in `LICENSE`. The bundled `knf-rs` sources and
`kaldi-native-fbank` code are kept with their original license files.

## Sortformer backend

`src/sortformer/features.rs` and `src/sortformer/model.rs` are ported from
`altunenes/parakeet-rs` (`src/sortformer.rs` and the mel helpers in
`src/audio.rs`), revision `9746b713058ea22d668d5a234a2e161bd1883207`, MIT
licensed, Copyright (c) 2025 Enes Altun. Changes from upstream: `eyre` errors,
this crate's ORT session builder, ndarray 0.16, offline profile only, mel
features computed per chunk instead of for the whole file, and progress and
cancellation per chunk. Its raw speaker probabilities were checked to match
upstream on real audio (10 minutes, 23 chunks, including speaker-cache
compression).

`src/sortformer/exclusive.rs` is AutoSubs' own code: upstream's per-speaker
binarization drops speech whose probability is split across speakers, which
would remove words from subtitles.

The model it runs, NVIDIA Nemotron-3-Diarization, is released under the
OpenMDW-1.1 license. The app downloads the ONNX export from
`altunenes/parakeet-rs` (`nemotron-3-diarization/`, which also carries the
license text); it is not bundled in this repository.

## Ownership

AutoSubs owns this copy as application infrastructure. Model download and cache
policy intentionally remains in `transcription-engine`; this crate only performs
diarization from caller-provided samples and model paths.
