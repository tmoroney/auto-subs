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
}

export interface Subtitle {
    start: string;
    end: string;
    text: string;
    speaker: string;
}

export interface SubtitleListProps {
    subtitles: Subtitle[];
}

export interface EnabeledSteps {
    exportAudio: boolean;
    transcribe: boolean;
    textFormat: boolean;
    advancedOptions: boolean;
    diarize: boolean;
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