import { Subtitle, Speaker } from "../types/interfaces";

// src/utils/srtUtils.ts
export function formatTimecode(seconds: number): string {
    const ms = Math.floor((seconds % 1) * 1000);
    const total = Math.floor(seconds);
    const s = total % 60;
    const m = Math.floor((total / 60) % 60);
    const h = Math.floor(total / 3600);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function generateSrt(subtitles: Subtitle[], includeSpeakerLabels: boolean, speakers?: Speaker[]): string {
    console.log('Generating SRT from subtitles:', subtitles);
    console.log('Include speaker labels in srt:', includeSpeakerLabels);

    if (!subtitles || !Array.isArray(subtitles)) {
        console.error('Invalid subtitles input:', subtitles);
        throw new Error('Subtitles must be an array');
    }

    return subtitles
        .map((sub, i) => {
            // Log each subtitle being processed
            console.log(`Processing subtitle ${i}:`, sub);

            // Ensure required fields exist
            if (sub === null || typeof sub !== 'object') {
                console.error('Invalid subtitle at index', i, ':', sub);
                return ''; // Skip invalid entries
            }

            const start = Number(sub.start);
            const end = Number(sub.end);
            let text = sub.text !== undefined ? String(sub.text).trim() : '';

            if (isNaN(start) || isNaN(end)) {
                console.error('Invalid timestamp in subtitle:', sub);
                return ''; // Skip entries with invalid timestamps
            }

            if (includeSpeakerLabels && sub.speaker_id) {
                let speakerName = speakers?.[Number(sub.speaker_id)]?.name;
                text = `[${speakerName}]: ${text}`;
            }

            return `${i + 1}\n${formatTimecode(start)} --> ${formatTimecode(end)}\n${text}\n`;
        })
        .filter(Boolean) // Remove any empty strings from invalid entries
        .join("\n");
}

// --- Helper function for robust SRT parsing ---
export function parseSrt(srtData: string) {
    const regex = /(\d+)\s*\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\s*\n([\s\S]*?)(?=\n{2,}|$)/g;
    const segments: { id: string; start: number; end: number; text: string }[] = [];
    let match;
    let idx = 0;
    while ((match = regex.exec(srtData)) !== null) {
        const [, , start, end, text] = match;
        const startInSeconds = srtTimeToSeconds(start);
        const endInSeconds = srtTimeToSeconds(end);
        segments.push({
            id: idx.toString(),
            start: startInSeconds,
            end: endInSeconds,
            text: text.replace(/\n/g, ' ').trim(),
        });
        idx++;
    }
    return segments;
}

function srtTimeToSeconds(time: string) {
    const [h, m, sMs] = time.split(':');
    const [s, ms] = sMs.split(',');
    return (
        parseInt(h) * 3600 +
        parseInt(m) * 60 +
        parseInt(s) +
        parseInt(ms) / 1000
    );
}