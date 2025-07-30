// Error message interface
export interface ErrorMsg {
    title: string;
    desc: string;
}

// Resolve Interfaces
export interface AudioInfo {
    timeline: string;
    path: string;
    markIn: number;
    markOut: number;
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
    probability?: number;
}
export interface Subtitle {
    id: number;
    start: string;
    end: string;
    text: string;
    speaker_id: string;
    words?: Array<Word>;
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
    // Processing settings
    model: number; // index of model in models array
    language: string,
    translate: boolean,
    enableDiarize: boolean,
    maxSpeakers: number,

    // Text settings
    maxWords: number,
    maxChars: number,
    numLines: number,
    textFormat: "none" | "uppercase" | "lowercase";
    removePunctuation: boolean,
    enableCensor: boolean,
    censorWords: Array<string>,

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
    model: string,
    lang: string,
    translate: boolean,
    enableDiarize: boolean,
    maxSpeakers: number
}