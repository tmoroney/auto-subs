#!/usr/bin/env bash

set -x

mkdir -p build-arm-linux-gnueabihf
cd build-arm-linux-gnueabihf
cmake -DCMAKE_TOOLCHAIN_FILE=../toolchains/arm-linux-gnueabihf.toolchain.cmake ..
make VERBOSE=1 -j4
make install
