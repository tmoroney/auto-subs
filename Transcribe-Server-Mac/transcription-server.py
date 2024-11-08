import sys
import os

import time

start_time = time.time()

if getattr(sys, 'frozen', False):
    base_path = sys._MEIPASS
else:
    base_path = os.path.dirname(__file__)

# Set MPLCONFIGDIR before importing any modules that might import Matplotlib
os.environ['MPLCONFIGDIR'] = os.path.join(base_path, 'matplotlib_cachedir')

# Add FFmpeg binaries to PATH
ffmpeg_path = os.path.join(base_path, 'ffmpeg_bin')
os.environ["PATH"] = ffmpeg_path + os.pathsep + os.environ["PATH"]
end_time = time.time()
print(f"Set environment variables: {end_time - start_time} seconds")

start_time = time.time()
# Now proceed with the rest of the imports
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn
import random
import mlx_whisper
import stable_whisper
from pyannote.audio import Pipeline
import torch
import torchaudio
import json
from huggingface_hub import HfApi, HfFolder, login, snapshot_download
from huggingface_hub.utils import RepositoryNotFoundError, HfHubHTTPError
from fastapi.middleware.cors import CORSMiddleware

end_time = time.time()
print(f"Initialization time: {end_time - start_time} seconds")



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

def is_model_cached_locally(model_id, revision=None):
    try:
        snapshot_download(
            repo_id=model_id,
            revision=revision, # Model version - use the latest revision if not specified
            local_files_only=True,
            allow_patterns=["*"],
            tqdm_enabled=False
        )
        return True
    except Exception:
        return False

def is_model_accessible(model_id, token=None, revision=None):
    # First, check if the model is cached locally
    if is_model_cached_locally(model_id, revision=revision):
        print(f"Model '{model_id}' is cached locally.")
        return True  # Model is cached locally and accessible

    print(f"Model '{model_id}' is not cached locally. Checking online access...")

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

def merge_diarisation(transcript, diarization):
    # Array of colors to choose from
    colors = [
        "#e11d48", "#1d4ae1", "#e1a11d", "#1de148", "#e11de1",
        "#11e1e1", "#e1e11d", "#e14d1d", "#4de11d", "#1d1de1"
    ]

    # Dictionary to store speaker information
    speakers_info = {}
    speaker_counter = 1

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
            speaker_label = f"Speaker {speaker_counter}" if speaker not in speakers_info else speakers_info[speaker]["label"]
            new_segment = {
                "start": segment_start,
                "end": segment_end,
                "speaker": speaker_label,
                "text": segment["text"],
                "words": segment["words"]
            }
            new_segments.append(new_segment)

            # Add speaker info if not already present
            if speaker not in speakers_info:
                # Select a random color and remove it from the list to avoid duplicates
                if colors:
                    color = random.choice(colors)
                    colors.remove(color)
                else:
                    # Generate a random color if we've run out
                    color = "#{:06x}".format(random.randint(0, 0xFFFFFF))
                # Store speaker information
                speakers_info[speaker] = {
                    "label": speaker_label,
                    "color": color,
                    "sample": {
                        "start": segment_start,
                        "end": segment_end
                    },
                    "subtitle_lines": 0,
                    "word_count": 0
                }
                speaker_counter += 1
            # Update speaker's subtitle lines and word count
            speakers_info[speaker]["subtitle_lines"] += 1
            speakers_info[speaker]["word_count"] += len(segment["words"])
            i += 1  # Move to the next transcript segment

    # Assign 'Unknown' speaker to any remaining transcript segments
    for segment in transcript_segments[i:]:
        new_segment = {
            "start": segment["start"],
            "end": segment["end"],
            "speaker": "Unknown",
            "text": segment["text"],
            "words": segment["words"]
        }
        new_segments.append(new_segment)

        # Add 'Unknown' speaker info if not already present
        if "Unknown" not in speakers_info:
            if colors:
                color = random.choice(colors)
                colors.remove(color)
            else:
                color = "#{:06x}".format(random.randint(0, 0xFFFFFF))
            speakers_info["Unknown"] = {
                "label": "Unknown",
                "color": color,
                "style": "outline",
                "sample": {
                    "start": segment["start"],
                    "end": segment["end"]
                },
                "subtitle_lines": 0,
                "word_count": 0
            }
        # Update 'Unknown' speaker's subtitle lines and word count
        speakers_info["Unknown"]["subtitle_lines"] += 1
        speakers_info["Unknown"]["word_count"] += len(segment["words"])

    # Convert speakers_info dict to a list
    speakers_list = list(speakers_info.values())
    top_speaker = max(speakers_list, key=lambda speaker: speaker["subtitle_lines"])

    # Add speakers list to the result
    result = {
        "text": transcript["text"],
        "language": transcript["language"],
        "speakers": speakers_list,
        "top_speaker": {
            "label": top_speaker["label"],
            "percentage": round((top_speaker["subtitle_lines"] / len(transcript_segments)) * 100)
        },
        "segments": new_segments
    }
    return result


class TranscriptionRequest(BaseModel):
    file_path: str
    timeline: str
    model: str
    language: str
    task: str
    diarize: bool
    max_words: int
    max_chars: int

@app.post("/transcribe/")
async def transcribe(request: TranscriptionRequest):
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

    if request.diarize:
        # Label speakers in audio
        diarization = diarize_audio(file_path, device)
        # Merge diarization with transcription
        result = merge_diarisation(transcript, diarization)
    else:
        transcript["speakers"] = []
        result = transcript

    # Save the transcription to a JSON file
    json_filename = f"{timeline}.json"
    json_filepath = os.path.join(os.path.expanduser('~/Documents/AutoSubs/Transcripts/'), json_filename)
    
    # Save the new structure as a JSON file
    with open(json_filepath, 'w') as f:
        json.dump(result, f, indent=4)

    # Return the path to the JSON file
    return {"result_file": json_filepath}



class ValidateRequest(BaseModel):
    token: str

@app.post("/validate/")
async def validate_model(request: ValidateRequest):
    token = request.token
    print(token)
    if token is None or token == "":
        # Check if token is cached
        token = HfFolder.get_token()
        if token is None:
            return {"isAvailable": False, "message": None}
    else:
        try:
            login(token)
        except Exception as e:
            return {"isAvailable": False, "message": "Hugging Face token is incorrect or expired."}
        
    required_models = ["pyannote/speaker-diarization-3.1", "pyannote/segmentation-3.0"]
    if not is_model_accessible(required_models[0], token=token):
        return {"isAvailable": False, "message": f"Please accept the terms for model '{required_models[0]}' and provide a valid Hugging Face access token."}
    if not is_model_accessible(required_models[1], token=token):
        return {"isAvailable": False, "message": f"Please accept the terms for model '{required_models[1]}' and provide a valid Hugging Face access token."}
    
    return {"isAvailable": True, "message": "All required models are available"}

if __name__ == "__main__":
    uvicorn.run(app, host="localhost", port=8000)