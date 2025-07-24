export interface Caption {
  id: number;
  speaker?: string;
  timestamp: string;
  text: string;
  color?: string;
}

export const searchCaptions = (captions: Caption[], searchQuery: string): Caption[] => {
  if (!searchQuery.trim()) return captions
  const query = searchQuery.toLowerCase()
  return captions.filter(
    (caption) =>
      caption.text.toLowerCase().includes(query) ||
      (caption.speaker && caption.speaker.toLowerCase().includes(query)) ||
      caption.timestamp.includes(searchQuery)
  )
}

export const exportCaptions = (captions: Caption[]) => {
  const exportText = captions
    .map((caption) => {
      const speakerText = caption.speaker ? `${caption.speaker}: ` : ''
      return `${caption.timestamp} - ${speakerText}${caption.text}`
    })
    .join('\n\n')
  const blob = new Blob([exportText], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "captions.txt"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
