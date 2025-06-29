// src/utils/srtUtils.ts
export function formatTimecode(seconds: number): string {
    const ms = Math.floor((seconds % 1) * 1000);
    const total = Math.floor(seconds);
    const s = total % 60;
    const m = Math.floor((total / 60) % 60);
    const h = Math.floor(total / 3600);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

interface Subtitle {
  start: number | string;
  end: number | string;
  text: string;
  [key: string]: any; // Allow additional properties
}

export function generateSrt(subtitles: Subtitle[]): string {
    console.log('Generating SRT from subtitles:', subtitles);
    
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
            const text = sub.text !== undefined ? String(sub.text).trim() : '';
            
            if (isNaN(start) || isNaN(end)) {
                console.error('Invalid timestamp in subtitle:', sub);
                return ''; // Skip entries with invalid timestamps
            }
            
            return `${i + 1}\n${formatTimecode(start)} --> ${formatTimecode(end)}\n${text}\n`;
        })
        .filter(Boolean) // Remove any empty strings from invalid entries
        .join("\n");
}