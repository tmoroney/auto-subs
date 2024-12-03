import json
import time
from lightning_whisper_mlx import LightningWhisperMLX

# Start timer
start = time.time()

whisper = LightningWhisperMLX(model="distil-small.en", batch_size=12, quant=None)

result = whisper.transcribe(audio_path="./audio3.wav", return_timestamps=True)

# dump the result to a json file
with open("audio.json", "w") as f:
    json.dump(result, f)

# End timer
end = time.time()
print(f"Time taken: {end-start} seconds")