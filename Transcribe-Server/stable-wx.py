import whisperx
import torch
import time
import stable_whisper

def inference(audio, **kwargs) -> dict:
    device = "cpu"
    # run model/API on the audio
    model = whisperx.load_model("small.en", device, compute_type="int8")
    audio = whisperx.load_audio(audio)
    result = model.transcribe(audio, batch_size=16)

    # 2. Align whisper output
    model_a, metadata = whisperx.load_align_model(language_code=result["language"], device=device)
    result = whisperx.align(result["segments"], model_a, metadata, audio, device, return_char_alignments=False)

    #import gc; gc.collect(); torch.cuda.empty_cache(); del model_a

    # return data in a proper format
    return result

# Start timer
start = time.time()

result = stable_whisper.transcribe_any(inference, './audio3.wav', vad=True)
(
    result
    .split_by_length(max_words=6)
)

result.save_as_json('audio.json')

# End timer
end = time.time()
print(f"Time taken: {end-start} seconds")