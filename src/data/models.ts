export type Model = {
  name: string;
  size: string;
  detail: string;
};

/* Individual models rather than families: the sizes are the point. Seeing
   "672 MB" next to a name is what makes "runs on your machine" believable. */
export const models: Model[] = [
  { name: "whisper-large-v3", size: "3.1 GB", detail: "Multilingual" },
  { name: "orukeet", size: "672 MB", detail: "25 languages" },
  { name: "canary", size: "1 GB", detail: "25 languages + translation" },
  { name: "omni-asr-1b-ctc", size: "3.7 GB", detail: "1,600+ languages" },
  { name: "cohere", size: "2 GB", detail: "14 languages" },
  { name: "whisper-large-v3-turbo", size: "1.6 GB", detail: "Multilingual" },
  { name: "sense-voice", size: "230 MB", detail: "CJK + English" },
  { name: "gigaam-v3", size: "225 MB", detail: "Russian · English" },
  { name: "parakeet", size: "700 MB", detail: "25 languages" },
  { name: "moonshine-base", size: "200 MB", detail: "English" },
  { name: "gigaam-multilingual", size: "592 MB", detail: "Central Asian" },
  { name: "whisper-medium", size: "1.5 GB", detail: "Multilingual" },
  { name: "moonshine-tiny-ja", size: "120 MB", detail: "Japanese" },
  { name: "whisper-small", size: "480 MB", detail: "Multilingual" },
  { name: "moonshine-tiny-zh", size: "120 MB", detail: "Chinese" },
  { name: "speaker-diarization", size: "40 MB", detail: "Speaker labels" },
  { name: "moonshine-tiny-ko", size: "120 MB", detail: "Korean" },
  { name: "whisper-base.en", size: "150 MB", detail: "English" },
  { name: "moonshine-tiny-ar", size: "120 MB", detail: "Arabic" },
  { name: "silero-vad", size: "2 MB", detail: "Voice activity" },
  { name: "moonshine-tiny-vi", size: "120 MB", detail: "Vietnamese" },
  { name: "whisper-tiny", size: "80 MB", detail: "Multilingual" },
  { name: "mms-aligner", size: "320 MB", detail: "Word timestamps" },
  { name: "moonshine-tiny-uk", size: "120 MB", detail: "Ukrainian" },
  { name: "moonshine-tiny", size: "60 MB", detail: "English" },
];

// Split across three rows so the middle one can run the other way.
export const modelRows: Model[][] = [
  models.filter((_, i) => i % 3 === 0),
  models.filter((_, i) => i % 3 === 1),
  models.filter((_, i) => i % 3 === 2),
];
