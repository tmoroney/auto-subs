# AutoSubs Import Notes

This crate was internalized from Tom Moroney's `tmoroney/pyannote-rs` fork and
updated through revision `234801254990354b1243fc6e53963771157ea97d`.

The fork was originally based on `thewh1teagle/pyannote-rs` and remains under
the MIT license preserved in `LICENSE`. The bundled `knf-rs` sources and
`kaldi-native-fbank` code are kept with their original license files.

AutoSubs owns this copy as application infrastructure. Model download and cache
policy intentionally remains in `transcription-engine`; this crate only performs
diarization from caller-provided samples and model paths.
