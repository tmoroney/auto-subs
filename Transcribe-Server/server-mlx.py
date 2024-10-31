from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn
import os
import time
import mlx_whisper
import stable_whisper
from pyannote.audio import Pipeline
import torch
import torchaudio
import json
from huggingface_hub import HfApi, HfFolder, login
from huggingface_hub.utils import RepositoryNotFoundError, HfHubHTTPError
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Add CORS middleware to allow requests from your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this to your frontend's domain or "*" for all
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, OPTIONS, etc.)
    allow_headers=["*"],  # Allow all headers
)

models = {
    "tiny": "mlx-community/whisper-tiny-mlx",
    "base": "mlx-community/whisper-base-mlx-q4",
    "small": "mlx-community/whisper-small-mlx",
    "medium": "mlx-community/whisper-medium-mlx",
    "large": "mlx-community/distil-whisper-large-v3",
}

english_models = {
    "tiny": "mlx-community/whisper-tiny.en-mlx",
    "base": "mlx-community/whisper-base.en-mlx",
    "small": "mlx-community/whisper-small.en-mlx",
    "medium": "mlx-community/whisper-medium.en-mlx",
    "large": "mlx-community/distil-whisper-large-v3",
}

def is_model_accessible(model_id, token=None):
    api = HfApi()
    try:
        # Attempt to get model info with the provided token
        model_info = api.model_info(repo_id=model_id, token=token)
        return True  # The model is accessible
    except RepositoryNotFoundError:
        print(f"Model '{model_id}' does not exist.")
        return False
    except HfHubHTTPError as e:
        if e.response.status_code == 403:
            print(f"Access denied to model '{model_id}'. You may need to accept the model's terms or provide a valid token.")
        elif e.response.status_code == 401:
            print(f"Unauthorized access. Please check your Hugging Face access token.")
        else:
            print(f"An HTTP error occurred: {e}")
        return False
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return False


# Function for transcribing the audio
def inference(audio, **kwargs) -> dict:
    if (kwargs["language"] == "auto"):
        output = mlx_whisper.transcribe(audio, path_or_hf_repo=kwargs["model"], word_timestamps=True, verbose=True, task=kwargs["task"])
    else:
        output = mlx_whisper.transcribe(audio, path_or_hf_repo=kwargs["model"], word_timestamps=True, language=kwargs["language"], verbose=True, task=kwargs["task"])
    
    return output

def transcribe_audio(audio_file, kwargs, max_words, max_chars):
    print("Starting transcription...")
    whisperResult = stable_whisper.transcribe_any(inference, audio_file, inference_kwargs = kwargs, vad=True)
    whisperResult.split_by_length(max_words=max_words, max_chars=max_chars)
    return whisperResult.to_dict()

def diarize_audio(audio_file, device):
    print("Starting diarization...")
    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1")
    pipeline.to(device)
    waveform, sample_rate = torchaudio.load(audio_file)
    audio_data = {"waveform": waveform.to(device), "sample_rate": sample_rate}
    return pipeline(audio_data)

class TranscriptionRequest(BaseModel):
    file_path: str
    timeline: str
    model: str
    language: str
    task: str
    max_words: int
    max_chars: int

class ModelValidationRequest(BaseModel):
    token: str = None

@app.post("/validate/")
async def validate_model(request: ModelValidationRequest):
    token = request.token
    if token is None:
        # Check if token is cached
        token = HfFolder.get_token()
        if token is None:
            return {"isAvailable": False, "message": "Please provide a Hugging Face token"}
    else:
        login(token)
        
    required_models = ["pyannote/speaker-diarization-3.1", "pyannote/segmentation-3.0"]
    for model_id in required_models:
        if not is_model_accessible(model_id, token=token):
            return {"isAvailable": False, "message": f"Please accept the terms for model '{model_id}' and provide a valid Hugging Face access token."}
    
    return {"isAvailable": True, "message": "All required models are available"}


@app.post("/transcribe/")
async def transcribe_audio(request: TranscriptionRequest):
    if request.language == "english":
        model = english_models[request.model]
        task = "transcribe"
    else:
        model = models[request.model]
        task = request.task

    print(model)

    file_path = request.file_path
    timeline = request.timeline
    language = request.language
    max_words = request.max_words
    max_chars = request.max_chars

    # Check if the file exists
    if not os.path.exists(file_path):
        return {"error": "File not found"}
    else:
        print(file_path)

    # Select device
    if torch.cuda.is_available():
        device = torch.device("cuda")
    elif torch.backends.mps.is_available():
        device = torch.device("mps")
    else:
        device = torch.device("cpu")

    print(f"Using device: {device}")

    kwargs = {"model": model, "language": language, "task": task}

    # Transcribe audio
    transcript = transcribe_audio(file_path, kwargs, max_words, max_chars)

    # Label speakers in audio
    diarization = diarize_audio(file_path, device)

    # Match speakers to transcript segments
    new_segments = []
    transcript_segments = transcript["segments"]
    diarization_turns = list(diarization.itertracks(yield_label=True))

    i, j = 0, 0
    while i < len(transcript_segments) and j < len(diarization_turns):
        segment = transcript_segments[i]
        turn, _, speaker = diarization_turns[j]

        segment_start = segment["start"]
        segment_end = segment["end"]
        diar_start = turn.start
        diar_end = turn.end

        if diar_end <= segment_start:
            j += 1
        elif segment_end <= diar_start:
            i += 1
        else:
            # Overlapping segment
            new_segments.append({
                "start": segment_start,
                "end": segment_end,
                "speaker": speaker,
                "text": segment["text"],
                "words": segment["words"]
            })
            i += 1  # Move to the next transcript segment

    # Assign 'Unknown' speaker to any remaining transcript segments
    for segment in transcript_segments[i:]:
        new_segments.append({
            "start": segment["start"],
            "end": segment["end"],
            "speaker": "Unknown",
            "text": segment["text"],
            "words": segment["words"]
        })

    result = {
        "text": transcript["text"],
        "segments": new_segments,
        "language": transcript["language"]
    }

    # Save the transcription to a JSON file
    json_filename = f"{timeline}.json"
    json_filepath = os.path.join(os.path.expanduser('~/Documents/AutoSubs/Transcripts/'), json_filename)
    
    # Save the new structure as a JSON file
    with open(json_filepath, 'w') as f:
        json.dump(result, f, indent=4)

    # Return the path to the JSON file
    return {"result_file": json_filepath}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)