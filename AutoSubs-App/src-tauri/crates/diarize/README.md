# pyannote-rs

[![Crates](https://img.shields.io/crates/v/pyannote-rs?logo=rust)](https://crates.io/crates/pyannote-rs/)
[![License](https://img.shields.io/github/license/thewh1teagle/pyannote-rs?color=00aaaa&logo=license)](https://github.com/thewh1teagle/pyannote-rs/blob/main/LICENSE)

Pyannote audio diarization in Rust

## Features

- Compute 1 hour of audio in less than a minute on CPU.
- Faster performance with DirectML on Windows and CoreML on macOS.
- Accurate timestamps with Pyannote segmentation.
- Identify speakers with wespeaker embeddings.

## Install

```console
cargo add pyannote-rs
```

## Usage

See [Building](BUILDING.md)

## Examples

See [examples](examples)

<details>
<summary>How it works</summary>

pyannote-rs uses 2 models for speaker diarization:

1. **Segmentation**: [segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0) identifies when speech occurs.
2. **Speaker Identification**: [wespeaker-voxceleb-resnet34-LM](https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM) identifies who is speaking.

Inference is powered by [onnxruntime](https://onnxruntime.ai/).

- The segmentation model processes up to 10s of audio, using a sliding window approach (iterating in chunks).
- The embedding model processes filter banks (audio features) extracted with [knf-rs](https://github.com/thewh1teagle/knf-rs).

Speaker comparison (e.g., determining if Alice spoke again) is done using cosine similarity.
</details>

## Credits

Big thanks to [pyannote-onnx](https://github.com/pengzhendong/pyannote-onnx) and [kaldi-native-fbank](https://github.com/csukuangfj/kaldi-native-fbank)
