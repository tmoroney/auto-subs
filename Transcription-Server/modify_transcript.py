import stable_whisper
import json

def modify_result(result, max_words, max_chars, sensitive_words):
    # matching function to identify sensitive words
    def is_sensitive(word, sensitive_words):
        return word.word.lower().strip() in [w.lower() for w in sensitive_words]

    # replacement function to censor the sensitive words
    def censor_word(result, seg_index, word_index):
        word = result[seg_index][word_index]
        match = word.word.strip()
        # Replace each character with an asterisk
        word.word = word.word.replace(match, '*' * len(word.word.strip()))

    # Apply the custom_operation to censor sensitive words
    if len(sensitive_words) > 0:
        result.custom_operation(
            key='',                      # Empty string to use the word object directly
            operator=is_sensitive,       # Use the is_sensitive function as the operator
            value=sensitive_words,       # Pass the sensitive_words list as the value
            method=censor_word,          # Use the censor_word function to perform the replacement
            word_level=True              # Operate at the word level
        )

    (
        result
        .split_by_length(max_words=max_words, max_chars=max_chars)
        # .split_by_punctuation([('.', ' '), '。', '?', '？', ',', '，'])
        # .split_by_gap(0.4)
        # .merge_by_gap(0.1, max_words=3)
    )

# Load the JSON file containing the transcript
with open('transcript.json', 'r', encoding='utf-8') as f:
    transcript = json.load(f)

# Create a new Result object with the transcript
result = stable_whisper.WhisperResult(transcript)
result.reset()
result.split_by_length(max_words=10, max_chars=100)
result.save_as_json('transcript_result.json')