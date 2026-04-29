#!/usr/bin/env python3
#
# Copyright (c)  2023  Xiaomi Corporation (authors: Fangjun Kuang)

import pickle

import kaldi_native_fbank as knf
import torch


def test():
    opts = knf.WhisperFeatureOptions()

    # Use 128 for whisper large v3
    opts.dim = 128
    online_whisper_fbank = knf.OnlineWhisperFbank(opts)

    audio = torch.rand(100000)
    # audio should be normalized into the range [-1, 1]
    print(audio.shape, audio.max(), audio.min())
    online_whisper_fbank.accept_waveform(sampling_rate=16000, waveform=audio.numpy())
    online_whisper_fbank.input_finished()
    print(online_whisper_fbank.num_frames_ready)

    features = []
    for i in range(online_whisper_fbank.num_frames_ready):
        f = online_whisper_fbank.get_frame(i)
        f = torch.from_numpy(f)
        features.append(f)

    features = torch.stack(features)
    print(features.shape)

    log_spec = torch.clamp(features, min=1e-10).log10()
    log_spec = torch.maximum(log_spec, log_spec.max() - 8.0)
    mel = (log_spec + 4.0) / 4.0
    target = 3000
    mel = torch.nn.functional.pad(mel, (0, 0, 0, target - mel.shape[0]), "constant", 0)
    mel = mel.t().unsqueeze(0)
    print(mel.shape)

    assert mel.shape == (1, opts.dim, 3000), mel.shape
    # Now you can input 'mel' to whisper.encoder model


def main():
    test()


if __name__ == "__main__":
    torch.manual_seed(20240112)
    main()
