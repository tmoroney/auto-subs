// src/utils/srtUtils.ts
export function formatTimecode(seconds: number): string {
    const ms = Math.floor((seconds % 1) * 1000);
    const total = Math.floor(seconds);
    const s = total % 60;
    const m = Math.floor((total / 60) % 60);
    const h = Math.floor(total / 3600);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function generateSrt(subtitles: any[]): string {
    return subtitles.map((sub, i) => (
        `${i + 1}\n${formatTimecode(Number(sub.start))} --> ${formatTimecode(Number(sub.end))}\n${sub.text.trim()}\n`
    )).join("\n");
}