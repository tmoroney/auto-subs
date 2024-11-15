import asyncio
import sys
import os
import appdirs

class Unbuffered(object):
   def __init__(self, stream):
       self.stream = stream
   def write(self, data):
       self.stream.write(data)
       self.stream.flush()
   def writelines(self, datas):
       self.stream.writelines(datas)
       self.stream.flush()
   def __getattr__(self, attr):
       return getattr(self.stream, attr)

# Ensure stdout and stderr are line-buffered
sys.stdout = Unbuffered(sys.stdout)
sys.stderr = Unbuffered(sys.stderr)

import time

start_time = time.time()

# Set MPLCONFIGDIR using appdirs for cross-platform compatibility
cache_dir = appdirs.user_cache_dir("AutoSubs", "AutoSubs")
matplotlib_cache_dir = os.path.join(cache_dir, 'matplotlib_cachedir')
os.makedirs(matplotlib_cache_dir, exist_ok=True)
os.environ['MPLCONFIGDIR'] = matplotlib_cache_dir

print(f"Matplotlib cache directory created at: {matplotlib_cache_dir}")

if getattr(sys, 'frozen', False):
    base_path = sys._MEIPASS
else:
    base_path = os.path.dirname(__file__)

# Add FFmpeg binaries to PATH
ffmpeg_path = os.path.join(base_path, 'ffmpeg_bin')
os.environ["PATH"] = ffmpeg_path + os.pathsep + os.environ["PATH"]

from fastapi import FastAPI, HTTPException, status
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

    try:
        # Attempt to download a small file from the model repo to check access
        snapshot_download(
            repo_id=model_id,
            revision=revision,  # Use the latest revision if not specified
            token=token,
            allow_patterns=["config.yaml"],  # Adjust to download a minimal set of files
            resume_download=False,  # Force download to check access
            local_files_only=False,
        )
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
    if kwargs["language"] == "auto":
        output = mlx_whisper.transcribe(
            audio,
            path_or_hf_repo=kwargs["model"],
            word_timestamps=True,
            verbose=True,
            task=kwargs["task"]
        )
    else:
        output = mlx_whisper.transcribe(
            audio,
            path_or_hf_repo=kwargs["model"],
            word_timestamps=True,
            language=kwargs["language"],
            verbose=True,
            task=kwargs["task"]
        )
    # Ensure segments are sorted
    output["segments"] = sorted(output["segments"], key=lambda x: x["start"])
    return output

def transcribe_audio(audio_file, kwargs, max_words, max_chars):
    print("Starting transcription...")
    whisperResult = stable_whisper.transcribe_any(inference, audio_file, inference_kwargs = kwargs, vad=False)
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
                    "id": speaker_label,
                    "color": color,
                    "style": "Outline",
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
                "id": "Unknown",
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
            "id": top_speaker["id"],
            "percentage": round((top_speaker["subtitle_lines"] / len(transcript_segments)) * 100)
        },
        "segments": new_segments
    }
    return result

async def async_transcribe_audio(file_path, kwargs, max_words, max_chars):
    """Asynchronous transcription function."""
    return transcribe_audio(file_path, kwargs, max_words, max_chars)

async def async_diarize_audio(file_path, device):
    """Asynchronous diarization function."""
    print("Starting diarization...")
    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1")
    pipeline.to(device)
    diarization = pipeline(file_path)
    return diarization

async def process_audio(file_path, kwargs, max_words, max_chars, device, diarize_enabled):
    """Process audio: transcription and diarization concurrently."""
    if diarize_enabled:
        # Run transcription and diarization concurrently
        transcript, diarization = await asyncio.gather(
            async_transcribe_audio(file_path, kwargs, max_words, max_chars),
            async_diarize_audio(file_path, device)
        )
        # Merge diarization with transcription
        result = merge_diarisation(transcript, diarization)
    else:
        # Run transcription only
        transcript = await async_transcribe_audio(file_path, kwargs, max_words, max_chars)
        transcript["speakers"] = []
        result = transcript

    return result

class TranscriptionRequest(BaseModel):
    file_path: str
    output_dir: str
    timeline: str
    model: str
    language: str
    task: str
    diarize: bool
    max_words: int
    max_chars: int

@app.post("/transcribe/")
async def transcribe(request: TranscriptionRequest):
    try:
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
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found."
            )
        else:
            print(f"Processing file: {file_path}")

        # Select device
        if torch.cuda.is_available():
            device = torch.device("cuda")
        elif torch.backends.mps.is_available():
            device = torch.device("mps")
        else:
            device = torch.device("cpu")

        print(f"Using device: {device}")

        kwargs = {"model": model, "language": language, "task": task}

        # Process audio (transcription and optionally diarization)
        try:
            result = await process_audio(
                file_path, kwargs, max_words, max_chars, device, request.diarize
            )
        except Exception as e:
            print(f"Error during audio processing: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error during audio processing: {e}"
            )
        
        # Save the transcription to a JSON file
        json_filename = f"{timeline}.json"
        json_filepath = os.path.join(request.output_dir, json_filename)
        try:
            with open(json_filepath, 'w') as f:
                json.dump(result, f, indent=4)
            print(f"Transcription saved to: {json_filepath}")
        except Exception as e:
            print(f"Error saving JSON file: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error saving JSON file: {e}"
            )
        # Return the path to the JSON file
        return {"result_file": json_filepath}

    except HTTPException as http_exc:
        # Re-raise HTTP exceptions to be handled by FastAPI
        raise http_exc
    except Exception as e:
        # Catch any other unexpected exceptions
        print(f"Unexpected error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error: {e}"
        )



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
    uvicorn.run(app, host="localhost", port=55000, log_level="info")