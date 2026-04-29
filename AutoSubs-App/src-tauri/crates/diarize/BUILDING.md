# Building

### Prerequisites

[Cargo](https://www.rust-lang.org/tools/install) | [Clang](https://releases.llvm.org/download.html) | [Cmake](https://cmake.org/download/)

_Prepare repo (or use cargo add)_

```console
git clone https://github.com/thewh1teagle/pyannote-rs --recursive
```

_Prepare models_

```console
wget https://github.com/thewh1teagle/pyannote-rs/releases/download/v0.1.0/segmentation-3.0.onnx
wget https://github.com/thewh1teagle/pyannote-rs/releases/download/v0.1.0/wespeaker_en_voxceleb_CAM++.onnx
wget https://github.com/thewh1teagle/pyannote-rs/releases/download/v0.1.0/6_speakers.wav
```

_Build Example_

```console
cargo run --example diarize 6_speakers.wav
```

_Gotachas_

---

<details>
<summary>Static linking failed on Windows</summary>

You can resolve it by creating `.cargo/config.toml` next to `Cargo.toml` with the following:

```toml
[target.'cfg(windows)']
rustflags = ["-C target-feature=+crt-static"]
```

Or set the environment variable `RUSTFLAGS` to `-C target-feature=+crt-static`

If it doesn't help make sure all of your dependencies also links MSVC runtime statically.
You can inspect the build with the following:

1. Set `RUSTC_LOG` to `rustc_codegen_ssa::back::link=info`
2. Build with

```console
cargo build -vv
```

Since there's a lot of output, it's good idea to pipe it to file and check later:

```console
cargo build -vv >log.txt 2>&1
```

Look for the flags `/MD` (Meaning it links it dynamically) and `/MT` or `-MT` (Meaning it links it statically). See [MSVC_RUNTIME_LIBRARY](https://cmake.org/cmake/help/latest/prop_tgt/MSVC_RUNTIME_LIBRARY.html) and [pyannote-rs/issues/1](https://github.com/thewh1teagle/pyannote-rs/issues/1)

</details>

## Release new version

```console
gh release create v0.3.0-beta.0 --title "v0.3.0-beta.0" --generate-notes
git pull # Fetch new tags
```
