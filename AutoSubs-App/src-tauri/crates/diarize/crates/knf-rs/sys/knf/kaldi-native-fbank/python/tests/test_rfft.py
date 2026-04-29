#!/usr/bin/env python3
#
# Copyright (c)  2021-2023  Xiaomi Corporation (authors: Fangjun Kuang)


import torch

import kaldi_native_fbank as knf


def test_rfft():
    N = 12
    t = torch.arange(N)
    r = torch.fft.rfft(t)
    assert len(r) == N // 2 + 1, (len(r), N // 2 + 1)

    real = r.real
    imag = r.imag
    print(r)

    k = t.tolist()
    rfft = knf.Rfft(N)

    p = rfft.compute(k)
    print(p)
    return

    assert abs(p[0] - real[0]) < 1e-5, (p[0], real[0])
    assert imag[0] == 0, imag[0]

    assert abs(p[1] - real[-1]) < 1e-5, (p[1], real[-1])
    assert imag[-1] == 0, imag[-1]

    for i in range(1, N // 2):
        assert abs(p[2 * i] - real[i]) < 1e-5, (p[2 * i], real[i])
        # Note: the imaginary part is multiplied by negative 1
        assert abs(p[2 * i + 1] - -1 * imag[i]) < 1e-5, (p[2 * i + 1], imag[i])


def main():
    test_rfft()


if __name__ == "__main__":
    main()
