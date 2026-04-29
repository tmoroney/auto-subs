#!/usr/bin/env python3

import sys

try:
    import kaldifeat
except:
    print("Please install kaldifeat first")
    sys.exit(0)

import kaldi_native_fbank as knf
import torch


def main():
    sampling_rate = 16000
    samples = torch.randn(sampling_rate * 10)

    opts = kaldifeat.MfccOptions()
    opts.frame_opts.dither = 0
    opts.num_ceps = 40
    opts.mel_opts.num_bins = 40
    opts.mel_opts.high_freq = -200
    opts.frame_opts.snip_edges = False
    online_mfcc = kaldifeat.OnlineMfcc(opts)

    online_mfcc.accept_waveform(sampling_rate, samples)

    opts = knf.MfccOptions()
    opts.frame_opts.dither = 0
    opts.num_ceps = 40
    opts.mel_opts.num_bins = 40
    opts.mel_opts.high_freq = -200
    opts.frame_opts.snip_edges = False

    mfcc = knf.OnlineMfcc(opts)
    mfcc.accept_waveform(sampling_rate, samples.tolist())

    assert online_mfcc.num_frames_ready == mfcc.num_frames_ready
    for i in range(mfcc.num_frames_ready):
        f1 = online_mfcc.get_frame(i)
        f2 = torch.from_numpy(mfcc.get_frame(i))
        assert torch.allclose(f1, f2, atol=1e-3), (i, (f1 - f2).abs().max(), f1, f2)


if __name__ == "__main__":
    torch.manual_seed(20240603)
    main()
    print("success")
