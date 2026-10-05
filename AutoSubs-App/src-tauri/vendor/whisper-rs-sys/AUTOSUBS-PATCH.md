# AutoSubs patch to whisper-rs-sys 0.15.0 (vendored whisper.cpp 1.8.3)

## What

One guard added in `whisper.cpp/src/whisper.cpp`, inside
`whisper_exp_compute_token_level_timestamps_dtw`, right after the three
`WHISPER_ASSERT`s at the top of the function:

```c
if (n_frames/2 <= medfilt_width) {
    return;
}
```

## Why

whisper.cpp calls this function with
`n_frames = min(3000, seek_delta, seek_end - seek)` mel frames for the current
decode window. Inside, `n_audio_tokens = n_frames/2` becomes `ne[2]` of the
tensor passed to `median_filter`, which does
`WHISPER_ASSERT(filter_width < a->ne[2])`. On a decode window of ≤ 15 mel
frames (~0.15 s — short speech bursts near the end of a seek region) the
assert fires and the process aborts. AutoSubs enables DTW by default, so this
crashes real users on long files.

Skipping DTW in that window is safe: tokens default to `t_dtw = -1` and the
transcription engine treats `t_dtw < 0` as "no DTW anchor" and falls back to
interpolated word timing.

## Upstream status

Unguarded on whisper.cpp master as of 2026-10. A matching upstream patch is
kept alongside this repo's bench artifacts.

## Removal

Delete this directory and the `[patch.crates-io] whisper-rs-sys` entry in
`AutoSubs-App/src-tauri/Cargo.toml` once whisper-rs-sys ships a whisper.cpp
that guards the median filter.
