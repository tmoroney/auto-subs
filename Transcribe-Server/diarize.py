from pyannote.audio import Pipeline
from huggingface_hub import login
import torch
import torchaudio
import time

start = time.time()

hf_token = input("Please enter your Hugging Face access token: ")
login(token=hf_token)
pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1")

#pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token="")

# send pipeline to GPU (when available)
pipeline.to(torch.device("mps"))

# apply the pipeline to an audio file
#diarization = pipeline("audio3.wav")
audio_file = "./audio3.wav"
waveform, sample_rate = torchaudio.load(audio_file)
diarization = pipeline({"waveform": waveform, "sample_rate": sample_rate})

# dump the diarization output to disk using RTTM format
with open("audio.rttm", "w") as rttm:
    diarization.write_rttm(rttm)

# End timer
end = time.time()
print(f"Time taken: {end-start} seconds")