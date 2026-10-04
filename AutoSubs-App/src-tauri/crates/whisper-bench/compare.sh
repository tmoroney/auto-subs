#!/usr/bin/env bash
# compare.sh - run whisper-bench over a set of models and print the report.
#
# For each model it runs, in order:
#   1. wcpp beam5 (DTW on)   - what AutoSubs ships today
#   2. wcpp greedy (DTW on)
#   3. tcpp greedy
# then runs the report bin on the combined results file.
#
# Usage: ./compare.sh [--models tiny,base,small,large-v3-turbo] [--model-dir DIR]
#                     [--lang en] [--no-gpu] AUDIO...

set -e
cd "$(dirname "$0")"

MODELS="tiny,base,small,large-v3-turbo"
MODEL_DIR="${MODEL_DIR:-$HOME/Library/Caches/com.autosubs}"
LANG="en"
NO_GPU=0
AUDIO=""

while [ $# -gt 0 ]; do
    case "$1" in
        --models) MODELS="$2"; shift 2 ;;
        --model-dir) MODEL_DIR="$2"; shift 2 ;;
        --lang) LANG="$2"; shift 2 ;;
        --no-gpu) NO_GPU=1; shift ;;
        --help|-h)
            sed -n '2,10p' "$0"
            exit 0 ;;
        --*) echo "unknown flag: $1" >&2; exit 2 ;;
        *) AUDIO="$AUDIO $1"; shift ;;
    esac
done

if [ -z "$AUDIO" ]; then
    echo "usage: $0 [--models csv] [--model-dir DIR] [--lang en] [--no-gpu] AUDIO..." >&2
    exit 2
fi

# Feature selection: Metal + CoreML on Apple Silicon unless --no-gpu.
UNAME_M="$(uname -m)"
UNAME_S="$(uname -s)"
GPU=0
if [ "$NO_GPU" -eq 0 ] && [ "$UNAME_S" = "Darwin" ] && [ "$UNAME_M" = "arm64" ]; then
    GPU=1
fi
if [ "$GPU" -eq 1 ]; then
    WCPP_FEATURES="wcpp,metal,coreml"
    TCPP_FEATURES="tcpp,metal"
else
    WCPP_FEATURES="wcpp"
    TCPP_FEATURES="tcpp"
fi

# Build both engine binaries with separate target dirs: whisper-rs and
# transcribe-cpp each statically link their own ggml, so they must stay in
# separate binaries (and separate caches keep rebuilds honest).
echo "building wcpp binary (--features $WCPP_FEATURES) ..."
cargo build --release --features "$WCPP_FEATURES" --target-dir target-wcpp
echo "building tcpp binary (--features $TCPP_FEATURES) ..."
cargo build --release --features "$TCPP_FEATURES" --target-dir target-tcpp
cargo build --release --features wcpp --target-dir target-report --bin report

WCPP_BIN=target-wcpp/release/whisper-bench
TCPP_BIN=target-tcpp/release/whisper-bench
REPORT_BIN=target-report/release/report

# Convert audio: anything that is not already a 16 kHz mono WAV goes through
# ffmpeg into a temp dir. A sibling .txt reference is carried over so the
# report's "WER vs reference" column still works.
TMPD="$(mktemp -d /tmp/whisper-bench.XXXXXX)"
trap 'rm -rf "$TMPD"' EXIT

WAVS=""
i=0
for src in $AUDIO; do
    i=$((i + 1))
    is16k=0
    case "$src" in
        *.wav|*.WAV)
            # Check header cheaply with ffmpeg (which we need anyway for
            # conversion); fall back to assuming conversion is required.
            if command -v ffprobe >/dev/null 2>&1; then
                rate="$(ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate,channels -of csv=p=0 "$src" 2>/dev/null | head -1)"
                ch="$(ffprobe -v error -select_streams a:0 -show_entries stream=channels -of csv=p=0 "$src" 2>/dev/null | head -1)"
                if [ "$rate" = "16000" ] && [ "$ch" = "1" ]; then
                    is16k=1
                fi
            fi
            ;;
    esac
    ref=""
    case "$src" in
        *.wav|*.WAV) ref="$(dirname "$src")/$(basename "$src" .wav).txt"
                     [ -f "$ref" ] || ref="$(dirname "$src")/$(basename "$src" .WAV).txt" ;;
        *) ref="${src%.*}.txt" ;;
    esac
    [ -f "$ref" ] || ref=""

    if [ "$is16k" -eq 1 ]; then
        dst="$src"
    else
        if ! command -v ffmpeg >/dev/null 2>&1; then
            echo "error: ffmpeg not found; needed to convert '$src' to 16 kHz mono wav" >&2
            exit 1
        fi
        dst="$TMPD/audio$i.wav"
        ffmpeg -v error -i "$src" -ar 16000 -ac 1 -f wav -acodec pcm_s16le -y "$dst" || {
            echo "error: ffmpeg failed on '$src'" >&2
            exit 1
        }
        if [ -n "$ref" ]; then
            cp "$ref" "$TMPD/audio$i.txt"
            ref="$TMPD/audio$i.txt"
        fi
    fi
    WAVS="$WAVS $dst"
    echo "audio: $dst"
done

RESULTS="bench-results-$(date +%Y%m%d-%H%M%S).jsonl"
: > "$RESULTS"
echo "results: $RESULTS"

# Model discovery: hf-hub layout under MODEL_DIR; prefer paths under snapshots/.
find_model() {
    name="$1"
    m="$(find "$MODEL_DIR" -path '*snapshots*' -name "ggml-$name.bin" 2>/dev/null | head -1)"
    if [ -z "$m" ]; then
        m="$(find "$MODEL_DIR" -name "ggml-$name.bin" 2>/dev/null | head -1)"
    fi
    echo "$m"
}

OLD_IFS="$IFS"
IFS=','
for name in $MODELS; do
    IFS="$OLD_IFS"
    model_path="$(find_model "$name")"
    if [ -z "$model_path" ]; then
        echo "warning: model 'ggml-$name.bin' not found under $MODEL_DIR; skipping" >&2
        continue
    fi
    echo "== model: $model_path"
    echo "-- wcpp beam5 (AutoSubs today, DTW on)"
    "$WCPP_BIN" --model "$model_path" --lang "$LANG" --decode beam5 \
        --label "wcpp-beam5" --out "$RESULTS" \
        $(for w in $WAVS; do printf -- '--audio %s ' "$w"; done)
    echo "-- wcpp greedy"
    "$WCPP_BIN" --model "$model_path" --lang "$LANG" --decode greedy \
        --label "wcpp-greedy" --out "$RESULTS" \
        $(for w in $WAVS; do printf -- '--audio %s ' "$w"; done)
    echo "-- tcpp greedy"
    "$TCPP_BIN" --model "$model_path" --lang "$LANG" --decode greedy \
        --label "tcpp-greedy" --out "$RESULTS" \
        $(for w in $WAVS; do printf -- '--audio %s ' "$w"; done)
    IFS=','
done
IFS="$OLD_IFS"

"$REPORT_BIN" "$RESULTS"
