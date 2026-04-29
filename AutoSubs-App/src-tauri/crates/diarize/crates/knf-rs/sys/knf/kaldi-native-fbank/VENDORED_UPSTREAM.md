# Vendored Upstream

This directory contains a vendored snapshot of `kaldi-native-fbank` used by
AutoSubs' internal diarization feature extraction path.

- Upstream repository: https://github.com/csukuangfj/kaldi-native-fbank
- Original imported snapshot: `7be9151d8c7428457356e006eb8b5fe548a69a40`
- Current upstream checked during internalization: `b09e686fe2084732ddd30d1ef80acfc0f13eaf01`
- Import style: plain vendored source files, not a git submodule

Do not update this snapshot as part of unrelated diarization or transcription
changes. Feature extraction feeds the speaker embedding model, so upstream
changes can alter embeddings and speaker matching even when the build still
passes.

If this snapshot is upgraded, do it as a dedicated change and verify at minimum:

- `cargo test -p diarize`
- `cargo check`
- an end-to-end AutoSubs diarization/transcription sample with known speaker
  labels and segment timings

