import stable_whisper
import time
import torch

# start timer
start = time.time()

device = "cuda:0" if torch.cuda.is_available() else "cpu"
model = stable_whisper.load_hf_whisper('small.en', device=device)
result = model.transcribe('audio3.wav', language="en", vad=True)
(
    result
    .split_by_length(max_words=6)
)

# end timer
end = time.time()
print("Time taken: ", end - start)

#result.to_srt_vtt('audio.srt', word_level=False)
result.save_as_json('audio.json')