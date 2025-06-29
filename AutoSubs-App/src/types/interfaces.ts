export interface Speaker {
    label: string;
    id: string;
    color: string;
    style: string;
    sample: {
        start: number;
        end: number;
    };
    subtitle_lines: number;
    word_count: number;
}

export interface TopSpeaker {
    label: string;
    id: string;
    percentage: number;
}

export interface AudioInfo {
    timeline: string;
    path: string;
    markIn: number;
    markOut: number;
}

export interface Subtitle {
    start: string;
    end: string;
    text: string;
    speaker: string;
    words?: Array<{
        word: string;
        start: number;
        end: number;
        probability?: number;
    }>;
}

export interface SubtitleListProps {
    subtitles: Subtitle[];
}

interface Template {
    value: string;
    label: string;
}
interface Track {
    value: string;
    label: string;
}

export interface TimelineInfo {
    name: string;
    timelineId: string;
    templates: Template[];
    inputTracks: Track[];
    outputTracks: Track[];
}

export interface ErrorMsg {
    title: string;
    desc: string;
}

export interface Progress {
    isLoading: boolean;
    value: number;
    currentStep: number;
    message: string;
}

export interface TranscriptionCallbacks {
    setProgress: (value: number) => void;
    setMessage: (message: string) => void;
    setIsLoading: (value: boolean) => void;
    setCurrentStep: (value: number) => void;
    setSubtitles: (update: (prev: any[]) => any[]) => void;
    enabledSteps: EnabeledSteps;
    serverLoadingRef?: { current: boolean };
}

export interface TranscribeResponse {
    result_file: string;
    speakers: Speaker[];
    top_speakers: TopSpeaker[];
}

export interface EnabeledSteps {
    exportAudio: boolean;
    transcribe: boolean;
    customSrt: boolean;
    diarize: boolean;
}

export interface Settings {
    inputTrack: string;
    outputTrack: string;
    template: string;
    model: string;
    language: string,
    translate: boolean,
    maxWords: number,
    maxChars: number,
    textFormat: "none" | "uppercase" | "lowercase";
    highlightType: "none" | "outline" | "fill" | "bubble";
    highlightColor: string;
    animationType: "none" | "pop-in" | "fade-in" | "slide-in" | "typewriter";
    wordLevel: boolean;
    removePunctuation: boolean,
    sensitiveWords: Array<string>,
    alignWords: boolean,
    diarizeMode: string,
    diarizeSpeakerCount: number,
    enabledSteps: EnabeledSteps;
}