from pyannote.audio import Pipeline
import torch
import torchaudio
import time

start = time.time()


pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token="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")

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