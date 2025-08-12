// Error message interface
export interface ErrorMsg {
    title: string;
    desc: string;
}

// Resolve Interfaces
export interface AudioInfo {
    path: string;
    markIn: number;
    markOut: number;
    offset: number;
}

export interface Template {
    value: string;
    label: string;
}
export interface Track {
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

// Subtitle Interfaces
export interface Word {
    word: string;
    start: number;
    end: number;
    line_number: number;
    probability?: number;
}
export interface Subtitle {
    id: number;
    start: number;
    end: number;
    text: string;
    words: Array<Word>;
    speaker_id?: string;
}

// Speaker Interfaces
export interface ColorModifier {
    enabled: boolean;
    color: string;
}
export interface Sample {
    start: number;
    end: number;
}
export interface Speaker {
    name: string;
    fill: ColorModifier;
    outline: ColorModifier;
    border: ColorModifier;
    sample: Sample;
    track?: string;
}

// Model Interface
export interface Model {
    value: string
    label: string
    description: string
    size: string
    ram: string
    image: string
    details: string
    isDownloaded: boolean
}

// Settings Interface
export interface Settings {
    // Mode
    isStandaloneMode: boolean,

    // Survey notification settings
    timesDismissedSurvey: number;
    lastSurveyDate: string;

    // Processing settings
    model: number; // index of model in models array
    language: string,
    translate: boolean,
    enableDiarize: boolean,
    maxSpeakers: number | null,
    enableDTW: boolean,
    enableGpu: boolean,

    // Text settings
    maxWordsPerLine: number,
    maxCharsPerLine: number,
    maxLinesPerSubtitle: number,
    splitOnPunctuation: boolean,
    textCase: "none" | "uppercase" | "lowercase";
    removePunctuation: boolean,
    enableCensor: boolean,
    censoredWords: Array<string>,

    // Davinci Resolve settings
    selectedInputTracks: string[];
    selectedOutputTrack: string;
    selectedTemplate: Template;

    // Animation settings
    animationType: "none" | "pop-in" | "fade-in" | "slide-in" | "typewriter";
    highlightType: "none" | "outline" | "fill" | "bubble";
    highlightColor: string;
}

export interface TranscriptionOptions {
    audioPath: string,
    offset: number,
    model: string,
    lang: string,
    translate: boolean,
    enableDtw: boolean,
    enableGpu: boolean,
    enableDiarize: boolean,
    maxSpeakers: number | null,
}