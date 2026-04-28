import { Subtitle } from "../types";

// src/utils/srtUtils.ts
export function formatTimecode(seconds: number): string {
    const ms = Math.floor((seconds % 1) * 1000);
    const total = Math.floor(seconds);
    const s = total % 60;
    const m = Math.floor((total / 60) % 60);
    const h = Math.floor(total / 3600);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function generateSrt(subtitles: Subtitle[]): string {
    console.log('Generating SRT from subtitles:', subtitles);

    if (!subtitles || !Array.isArray(subtitles)) {
        console.error('Invalid subtitles input:', subtitles);
        throw new Error('Subtitles must be an array');
    }

    // Deep clone and filter out invalid/malformed entries upfront
    const sanitized = (JSON.parse(JSON.stringify(subtitles)) as any[]).filter(
        sub => sub && typeof sub === 'object' && 'start' in sub && 'end' in sub
    ) as Subtitle[];

    // 1. Enforce minimum duration and fix overlaps
    const MIN_DURATION = 0.4; // 400ms minimum duration for readability

    for (let i = 0; i < sanitized.length; i++) {
        let current = sanitized[i];
        let start = Number(current.start);
        let end = Number(current.end);

        if (isNaN(start) || isNaN(end)) continue;

        // Enforce minimum duration
        if (end - start < MIN_DURATION) {
            let needed = MIN_DURATION - (end - start);

            // Try to expand backward into previous gap
            let prevEnd = i > 0 ? Number(sanitized[i - 1].end) : 0;
            let availableBackward = start - prevEnd;
            if (availableBackward > 0) {
                let expandBackward = Math.min(needed, availableBackward);
                start -= expandBackward;
                needed -= expandBackward;
            }

            // Try to expand forward into next gap
            if (needed > 0) {
                let nextStart = i < sanitized.length - 1 ? Number(sanitized[i + 1].start) : end + needed;
                let availableForward = nextStart - end;
                if (availableForward > 0) {
                    let expandForward = Math.min(needed, availableForward);
                    end += expandForward;
                }
            }
        }

        // Prevent exact overlaps (SRT importers like Premiere prefer a small gap)
        if (i > 0) {
            let prevEnd = Number(sanitized[i - 1].end);
            if (start <= prevEnd) {
                start = prevEnd + 0.001; // Push it forward to create a 1ms gap
                if (end < start) end = start + MIN_DURATION; // Ensure valid duration
            }
        }

        sanitized[i].start = start;
        sanitized[i].end = end;
    }

    return sanitized
        .map((sub, i) => {
            const start = Number(sub.start);
            const end = Number(sub.end);
            let text = sub.text !== undefined ? String(sub.text).trim() : '';

            if (isNaN(start) || isNaN(end) || !text) {
                return ''; // Skip invalid or empty entries
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