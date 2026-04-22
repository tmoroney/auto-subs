import { SupportedUiLanguage } from '@/i18n';

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

export interface Sample {
    start: number;
    end: number;
}
export interface Speaker {
    name: string;
    style: "Fill" | "Outline" | "None";
    color: string; // hex
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
    badge: string
    languageSupport: 
        | { kind: "multilingual" }
        | { kind: "single_language"; language: string }
        | { kind: "restricted"; languages: string[] }
    accuracy: 1 | 2 | 3 | 4 // 1 = Poor, 2 = Standard, 3 = Excellent, 4 = Best-in-class
    weight: 1 | 2 | 3 | 4 // 1 = Very Heavy, 2 = Heavy, 3 = Standard, 4 = Lightweight
    isDownloaded: boolean
}

// Settings Interface
export interface Settings {
    // Mode
    isStandaloneMode: boolean,

    // UI settings
    uiLanguage: SupportedUiLanguage;
    onboardingCompleted: boolean;
    tourCompleted: boolean;
    showEnglishOnlyModels: boolean;

    // Survey notification settings
    timesDismissedSurvey: number;
    lastSurveyDate: string;

    // Processing settings
    model: number; // index of model in models array
    language: string,
    translate: boolean,
    targetLanguage: string,
    enableDiarize: boolean,
    maxSpeakers: number | null,
    enableDTW: boolean,
    enableGpu: boolean,

    // Text settings
    textDensity: "less" | "standard" | "more" | "single",
    maxLinesPerSubtitle: number,
    splitOnPunctuation: boolean,
    textCase: "none" | "uppercase" | "lowercase" | "titlecase";
    removePunctuation: boolean,
    enableCensor: boolean,
    censoredWords: Array<string>,

    // Davinci Resolve settings
    selectedInputTracks: string[];
    selectedOutputTrack: string;
    selectedTemplate: Template;

    // AutoSubs Caption settings
    presetId: string;
    captionMode: "regular" | "animated";

    // Animation settings
    animationType: string;
    highlightType: string;
    highlightColor: string;
}

// Caption preset for the custom AutoSubs animated caption macro.
// `macroSettings` is an opaque table round-tripped through the Fusion macro's
// built-in GetInputValues / SetInputValues helpers.
export interface CaptionPreset {
    id: string;            // "builtin:<slug>" for shipped presets, uuid for user presets
    name: string;
    description?: string;
    builtIn: boolean;
    version: number;       // schema version (starts at 1)
    createdAt: string;
    updatedAt: string;
    macroSettings: Record<string, unknown>;
}

export interface TranscriptionOptions {
    audioPath: string,
    offset: number,
    model: string,
    lang: string,
    translate: boolean,
    targetLanguage: string,
    enableDtw: boolean,
    enableGpu: boolean,
    enableDiarize: boolean,
    maxSpeakers: number | null,
    density: "less" | "standard" | "more" | "single",
    maxLines: number,
    // Content formatting applied in the Rust backend.
    textCase: "none" | "uppercase" | "lowercase" | "titlecase",
    removePunctuation: boolean,
    censoredWords: string[],
}

// Formatting options for reformatting subtitles without re-transcribing
export interface FormattingOptions {
    maxLines?: number,
    textDensity?: "less" | "standard" | "more" | "single",
    language?: string,
    // Content formatting (applied by Rust backend after structural line wrapping).
    textCase?: "none" | "uppercase" | "lowercase" | "titlecase",
    removePunctuation?: boolean,
    censoredWords?: string[],
}

// Segment format expected by the backend reformat command
export interface BackendSegment {
    start: number,
    end: number,
    text: string,
    speaker_id?: string,
    words?: Array<{
        word: string,
        start: number,
        end: number,
        probability?: number,
    }>,
}
