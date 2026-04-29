# Building

_Prepare knf_

```console
git clone https://github.com/thewh1teagle/knf-rs --recursive
```

_Build_

```console
cargo build
```

_Build knf_

```console
cmake -B build .  -DKALDI_NATIVE_FBANK_BUILD_PYTHON=OFF -DKALDI_NATIVE_FBANK_BUILD_TESTS=OFF
cmake --build build --config Release
```
