import stable_whisper
import time
import torch

# Define a simple function to print progress
def print_progress(seek, total_duration):
    print(f"Progress: {seek}/{total_duration}")

# Function to run transcription and print progress
def transcribe_and_print_progress():
    # start timer
    start = time.time()

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    model = stable_whisper.load_faster_whisper('small.en', device=device, compute_type="int8")

    # Start the transcription process and capture the progress
    result = model.transcribe_stable('audio3.wav', language="en", vad=True, progress_callback=print_progress)

    # After transcription
    result.split_by_length(max_words=6)

    # end timer
    end = time.time()
    print("Time taken: ", end - start)

    # Save the result as JSON
    result.save_as_json('audio.json')

# Run the transcription and print progress
transcribe_and_print_progress()