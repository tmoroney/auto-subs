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
#                     [--lang en] [--threads N] [--no-gpu] AUDIO...

set -e
cd "$(dirname "$0")"
CRATE_DIR="$(pwd -P)"

# Cargo reads .cargo/config.toml files starting at the *cwd*, so building from
# here picks up src-tauri/.cargo/config.toml and its -mmacosx-version-min=13.3
# rustflag. On the Xcode 27 toolchain that makes every proc-macro dylib come out
# malformed ("mis-aligned LINKEDIT string pool") and the build dies in serde.
# The bench binaries never ship, so build them from a neutral cwd that inherits
# no project config; MACOSX_DEPLOYMENT_TARGET stays unset too.
cargo_bench() {
    (cd / && cargo build --release --manifest-path "$CRATE_DIR/Cargo.toml" "$@")
}

MODELS="tiny,base,small,large-v3-turbo"
MODEL_DIR="${MODEL_DIR:-$HOME/Library/Caches/com.autosubs}"
BENCH_LANG="en"
NO_GPU=0
THREADS=""
AUDIO=()

while [ $# -gt 0 ]; do
    case "$1" in
        --models) MODELS="$2"; shift 2 ;;
        --model-dir) MODEL_DIR="$2"; shift 2 ;;
        --lang) BENCH_LANG="$2"; shift 2 ;;
        --threads) THREADS="$2"; shift 2 ;;
        --no-gpu) NO_GPU=1; shift ;;
        --help|-h)
            sed -n '2,10p' "$0"
            exit 0 ;;
        --*) echo "unknown flag: $1" >&2; exit 2 ;;
        *) AUDIO+=("$1"); shift ;;
    esac
done

if [ ${#AUDIO[@]} -eq 0 ]; then
    echo "usage: $0 [--models csv] [--model-dir DIR] [--lang en] [--threads N] [--no-gpu] AUDIO..." >&2
    exit 2
fi

# Optional --threads passthrough: when unset we don't pass --threads so the
# binary's default (available_parallelism) applies.
THREAD_ARGS=()
if [ -n "$THREADS" ]; then
    THREAD_ARGS=(--threads "$THREADS")
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
# separate binaries (and separate caches keep rebuilds honest). The report
# bin has no engine dependencies and builds with no features.
echo "building wcpp binary (--features $WCPP_FEATURES) ..."
cargo_bench --features "$WCPP_FEATURES" --target-dir "$CRATE_DIR/target-wcpp"
echo "building tcpp binary (--features $TCPP_FEATURES) ..."
cargo_bench --features "$TCPP_FEATURES" --target-dir "$CRATE_DIR/target-tcpp"
cargo_bench --target-dir "$CRATE_DIR/target-report" --bin report

WCPP_BIN=target-wcpp/release/whisper-bench
TCPP_BIN=target-tcpp/release/whisper-bench
REPORT_BIN=target-report/release/report

# Convert audio: anything that is not already a 16 kHz mono pcm_s16le /
# pcm_f32le WAV goes through ffmpeg into a temp dir. A sibling .txt reference
# is carried over so the report's "WER vs reference" column still works.
TMPD="$(mktemp -d /tmp/whisper-bench.XXXXXX)"
trap 'rm -rf "$TMPD"' EXIT

WAVS=()
i=0
for src in "${AUDIO[@]}"; do
    i=$((i + 1))
    is16k=0
    case "$src" in
        *.wav|*.WAV)
            # One ffprobe call: e.g. "pcm_s16le,16000,1". Anything else needs
            # conversion (load_wav only accepts 16 kHz mono s16/f32).
            if command -v ffprobe >/dev/null 2>&1; then
                info="$(ffprobe -v error -select_streams a:0 \
                    -show_entries stream=codec_name,sample_rate,channels \
                    -of csv=p=0 "$src" 2>/dev/null | head -1)"
                case "$info" in
                    pcm_s16le,16000,1|pcm_f32le,16000,1) is16k=1 ;;
                esac
            fi
            ;;
    esac
    ref=""
    srcdir="$(dirname "$src")"
    srcbase="$(basename "$src")"
    case "$src" in
        *.wav) ref="$srcdir/${srcbase%.wav}.txt" ;;
        *.WAV) ref="$srcdir/${srcbase%.WAV}.txt" ;;
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
    WAVS+=("$dst")
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

AUDIO_ARGS=()
for w in "${WAVS[@]}"; do
    AUDIO_ARGS+=(--audio "$w")
done

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
    "$WCPP_BIN" --model "$model_path" --lang "$BENCH_LANG" --decode beam5 \
        "${THREAD_ARGS[@]+"${THREAD_ARGS[@]}"}" \
        --label "wcpp-beam5" --out "$RESULTS" "${AUDIO_ARGS[@]}"
    echo "-- wcpp greedy"
    "$WCPP_BIN" --model "$model_path" --lang "$BENCH_LANG" --decode greedy \
        "${THREAD_ARGS[@]+"${THREAD_ARGS[@]}"}" \
        --label "wcpp-greedy" --out "$RESULTS" "${AUDIO_ARGS[@]}"
    echo "-- tcpp greedy"
    "$TCPP_BIN" --model "$model_path" --lang "$BENCH_LANG" --decode greedy \
        "${THREAD_ARGS[@]+"${THREAD_ARGS[@]}"}" \
        --label "tcpp-greedy" --out "$RESULTS" "${AUDIO_ARGS[@]}"
    IFS=','
done
IFS="$OLD_IFS"

"$REPORT_BIN" "$RESULTS"
