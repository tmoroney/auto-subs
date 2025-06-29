import { Caption } from "@/data/captions";

// Function to format seconds into SRT timestamp format (HH:MM:SS,mmm)
const formatSrtTime = (seconds: number): string => {
  const date = new Date(0);
  date.setSeconds(seconds);
  return date.toISOString().substr(11, 12).replace('.', ',');
};

// Convert captions to SRT format
export const captionsToSrt = (captions: Caption[]): string => {
  return captions
    .map((caption, index) => {
      // Extract start and end times from the timestamp
      const [hours, minutes, seconds] = caption.timestamp.split(':').map(Number);
      const startTime = hours * 3600 + minutes * 60 + seconds;
      // Assume each caption is 3 seconds long for the end time
      const endTime = startTime + 3;
      
      return `${index + 1}\n` +
             `${formatSrtTime(startTime)} --> ${formatSrtTime(endTime)}\n` +
             `${caption.text}\n\n`;
    })
    .join('');
};

// Function to download content as a file
export const downloadFile = (content: string, filename: string, type: string) => {
  try {
    console.log('Creating blob with content:', content.substring(0, 100) + '...');
    const blob = new Blob([content], { type });
    console.log('Blob created, size:', blob.size);
    
    const url = URL.createObjectURL(blob);
    console.log('Object URL created:', url);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    // Add event listener for better debugging
    a.addEventListener('click', () => {
      console.log('Download link clicked');
    });
    
    document.body.appendChild(a);
    console.log('Triggering download for:', filename);
    a.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('Cleanup complete');
    }, 100);
    
    return true;
  } catch (error) {
    console.error('Error in downloadFile:', error);
    return false;
  }
};

// Function to export captions as SRT
export const exportCaptionsAsSrt = (captions: Caption[], filename: string = 'captions.srt'): boolean => {
  try {
    if (!captions || captions.length === 0) {
      alert('No captions available to export');
      return false;
    }
    const srtContent = captionsToSrt(captions);
    
    if (!srtContent) {
      console.error('Failed to generate SRT content');
      alert('Failed to generate SRT content');
      return false;
    }
    
    const success = downloadFile(srtContent, filename, 'text/srt');
    if (!success) {
      alert('Failed to initiate download. Please check the console for more details.');
    }
    return success;
  } catch (error) {
    console.error('Error exporting captions:', error);
    alert('An error occurred while exporting captions. Please check the console for details.');
    return false;
  }
};

// Function to format seconds into HH:MM:SS format
const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':');
};

// Colors for different speakers
const SPEAKER_COLORS = [
  'red-600',
  'blue-600',
  'green-600',
  'purple-600',
  'pink-600',
  'indigo-600',
  'teal-600',
  'orange-600',
];

// Map to track speaker colors
const speakerColorMap = new Map<string, string>();
let colorIndex = 0;

// Function to get or assign a color for a speaker
const getSpeakerColor = (speaker: string): string => {
  if (!speakerColorMap.has(speaker)) {
    speakerColorMap.set(speaker, SPEAKER_COLORS[colorIndex % SPEAKER_COLORS.length]);
    colorIndex++;
  }
  return speakerColorMap.get(speaker)!;
};

// Function to transform JSON caption data to our Caption interface
export const transformCaptions = (jsonCaptions: Array<{
  id: number;
  start: number;
  end: number;
  text: string;
  speaker?: string;
}>): Caption[] => {
  return jsonCaptions.map(caption => {
    // Only include speaker if it's explicitly provided
    const speaker = caption.speaker;
    return {
      id: caption.id,
      ...(speaker ? { speaker } : {}),
      timestamp: formatTime(caption.start),
      text: caption.text.trim(),
      ...(speaker ? { color: getSpeakerColor(speaker) } : { color: 'foreground' }),
    };
  });
};

// Function to fetch captions from the JSON file
export const fetchCaptions = async (): Promise<Caption[]> => {
  try {
    const response = await fetch('/example-captions.json');
    if (!response.ok) {
      throw new Error('Failed to fetch captions');
    }
    const jsonData = await response.json();
    return transformCaptions(jsonData);
  } catch (error) {
    console.error('Error loading captions:', error);
    return [];
  }
};
