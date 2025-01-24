from silero_vad import load_silero_vad, read_audio, get_speech_timestamps, save_audio, collect_chunks
from pyannote.audio import Pipeline
import torch
import numpy as np
import time

audio_file = "/Users/moroneyt/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility/autosubs-exported-audio.wav"
SAMPLING_RATE = 16000

# Load VAD model and read audio
model = load_silero_vad()
wav = read_audio(audio_file, SAMPLING_RATE)

# Get speech timestamps in samples
speech_timestamps = get_speech_timestamps(
    wav,  # waveform
    model,
    sampling_rate=SAMPLING_RATE,
)

# merge all speech chunks to one audio
save_audio('only_speech.wav', collect_chunks(speech_timestamps, wav), sampling_rate=SAMPLING_RATE) 

print("Speech Timestamps:")
for ts in speech_timestamps:
    print(f"Start: {ts['start']} - End: {ts['end']}")