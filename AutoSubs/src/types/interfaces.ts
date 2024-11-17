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