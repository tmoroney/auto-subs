import mlx_whisper
import time

models = [
    "mlx-community/whisper-tiny-mlx-q4",
    "mlx-community/whisper-tiny-mlx", 
    "mlx-community/whisper-base-mlx-q4", 
    "mlx-community/whisper-base-mlx", 
    "mlx-community/whisper-small-mlx-q4", 
    "mlx-community/whisper-small-mlx", 
    "mlx-community/whisper-medium-mlx-4bit",
    "mlx-community/whisper-medium-mlx", 
    "mlx-community/distil-whisper-large-v3"
    "mlx-community/whisper-large-v3-mlx"
]

english_only_models = [
    "mlx-community/whisper-tiny.en-mlx", 
    "mlx-community/whisper-tiny.en-mlx-q4",
    "mlx-community/whisper-base.en-mlx", 
    "mlx-community/whisper-base.en-mlx-q4",
    "mlx-community/whisper-small.en-mlx", 
    "mlx-community/whisper-small.en-mlx-q4",
    "mlx-community/distil-whisper-medium.en"
    "mlx-community/whisper-medium.en-mlx", 
    "mlx-community/distil-whisper-large-v3"
    "mlx-community/whisper-large-v3-mlx"
]

# Start timer
start = time.time()

# Transcribe audio file
output = mlx_whisper.transcribe("audio.wav", path_or_hf_repo="mlx-community/whisper-base.en-mlx-q4", word_timestamps=True, language="en")
#output = mlx_whisper.transcribe("opinions.mp3", path_or_hf_repo="mlx-community/whisper-small-mlx", word_timestamps=False, task="translate")
#output = mlx_whisper.transcribe("opinions.mp3", path_or_hf_repo="mlx-community/whisper-small-mlx", word_timestamps=True, task="transcribe", language="es")

# Dump into json file
import json
with open("output.json", "w") as f:
    json.dump(output, f, indent=2)


# End timer
end = time.time()
print(f"Time taken: {end-start} seconds")

