export interface Subtitle {
    start: string;
    end: string;
    text: string;
    speaker: string;
}

export interface SubtitleListProps {
    subtitles: Subtitle[];
}