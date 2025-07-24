export interface ErrorMsg {
    title: string;
    desc: string;
}

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