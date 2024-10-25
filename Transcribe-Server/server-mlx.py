from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
import uvicorn
import os
import time
import mlx_whisper
import stable_whisper

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


# Function for transcribing the audio
def inference(audio, **kwargs) -> dict:
    if (kwargs["language"] == "auto"):
        output = mlx_whisper.transcribe(audio, path_or_hf_repo=kwargs["model"], word_timestamps=True, verbose=True, task=kwargs["task"])
    else:
        output = mlx_whisper.transcribe(audio, path_or_hf_repo=kwargs["model"], word_timestamps=True, language=kwargs["language"], verbose=True, task=kwargs["task"])
    
    return output

class TranscriptionRequest(BaseModel):
    file_path: str
    model: str
    language: str
    task: str
    max_words: int
    max_chars: int

@app.post("/transcribe/")
async def transcribe_audio(request: TranscriptionRequest):
    file_path = request.file_path
    model = models[request.model]
    language = request.language
    task = request.task
    max_words = request.max_words
    max_chars = request.max_chars

    # Check if the file exists
    if not os.path.exists(file_path):
        return {"error": "File not found"}
    else:
        print(file_path)

    kwargs = {"model": model, "language": language, "task": task}
    
    # Start the transcription process
    result = stable_whisper.transcribe_any(inference, file_path, inference_kwargs = kwargs, vad=True)
    result.split_by_length(max_words=max_words, max_chars=max_chars)

    # Save the transcription to a JSON file
    json_filename = f"{os.path.basename(file_path).split('.')[0]}.json"

    json_filepath = os.path.join(os.path.expanduser('~/Documents/AutoSubs/Transcripts/'), json_filename)
    result.save_as_json(json_filepath)

    # Return the path to the JSON file
    return {"json_filepath": json_filename}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)