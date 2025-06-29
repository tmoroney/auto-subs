export interface Caption {
  id: number;
  speaker?: string;
  timestamp: string;
  text: string;
  color?: string;
}

export const captionData: Caption[] = [
  {
    id: 1,
    speaker: "Speaker 1",
    timestamp: "00:00:15",
    text: "Welcome everyone to today's meeting. I hope you're all doing well and ready to discuss our quarterly progress.",
    color: "red-600",
  },
  {
    id: 2,
    speaker: "Speaker 2",
    timestamp: "00:00:27",
    text: "Thank you! I've prepared the latest figures, and I think you'll all be pleased with the improvements we've made.",
    color: "blue-600",
  },
  {
    id: 3,
    speaker: "Speaker 3",
    timestamp: "00:00:43",
    text: "Before we dive into the numbers, can we quickly go over the agenda for today?",
    color: "green-600",
  },
  {
    id: 4,
    speaker: "Speaker 1",
    timestamp: "00:00:55",
    text: "Absolutely. First, we'll review the financials, then project updates, and finally open discussion for next steps.",
    color: "red-600",
  },
  {
    id: 5,
    speaker: "Speaker 2",
    timestamp: "00:01:12",
    text: "Here are the Q2 results: revenue is up by 12%, expenses have decreased by 5%, and client satisfaction scores are at an all-time high.",
    color: "blue-600",
  },
  {
    id: 6,
    speaker: "Speaker 3",
    timestamp: "00:01:31",
    text: "That's fantastic news! What contributed most to the rise in client satisfaction?",
    color: "green-600",
  },
  {
    id: 7,
    speaker: "Speaker 2",
    timestamp: "00:01:42",
    text: "Our new support system and faster response times played major roles. We've also received positive feedback on our last product update.",
    color: "blue-600",
  },
  {
    id: 8,
    speaker: "Speaker 1",
    timestamp: "00:01:59",
    text: "Great work, team. Let's hear the project updates next.",
    color: "red-600",
  },
  {
    id: 9,
    speaker: "Speaker 3",
    timestamp: "00:02:09",
    text: "The development team has completed phase one of the new dashboard, and beta testing is underway.",
    color: "green-600",
  },
  {
    id: 10,
    speaker: "Speaker 2",
    timestamp: "00:02:23",
    text: "We're on track with the marketing campaign as well. Early engagement metrics look promising.",
    color: "blue-600",
  },
  {
    id: 11,
    speaker: "Speaker 3",
    timestamp: "00:03:01",
    text: "We did encounter a few bugs during testing, but they've been addressed. The dashboard should be ready for full release next month.",
    color: "green-600",
  },
  {
    id: 12,
    speaker: "Speaker 1",
    timestamp: "00:03:15",
    text: "Great problem-solving approach. What are our next steps for the upcoming quarter?",
    color: "red-600",
  },
  {
    id: 13,
    speaker: "Speaker 2",
    timestamp: "00:03:25",
    text: "I'd recommend we focus on consolidating our gains and preparing for the product launch event.",
    color: "blue-600",
  },
  {
    id: 14,
    speaker: "Speaker 3",
    timestamp: "00:03:38",
    text: "I'll coordinate with the dev team and support to ensure we have resources ready for the launch.",
    color: "green-600",
  },
  {
    id: 15,
    speaker: "Speaker 1",
    timestamp: "00:03:50",
    text: "Excellent. Thanks everyone for your hard work and input today. Let's reconvene in two weeks.",
    color: "red-600",
  },
]

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
