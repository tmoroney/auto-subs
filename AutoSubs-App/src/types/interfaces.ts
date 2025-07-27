// Error message interface
export interface ErrorMsg {
    title: string;
    desc: string;
}

// Speaker Interfaces
export interface Speaker {
    name: string;
    sample: {
        start: number;
        end: number;
    };
    fill: ColorModifier;
    outline: ColorModifier;
}

export interface ColorModifier {
    enabled: boolean;
    color: string;
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