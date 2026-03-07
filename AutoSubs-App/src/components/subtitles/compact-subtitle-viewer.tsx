import { SubtitleViewerPanel } from "@/components/subtitles/subtitle-viewer-panel"

interface CompactSubtitleViewerProps {
  isOpen: boolean
  onClose: () => void
}

export function CompactSubtitleViewer({ isOpen, onClose }: CompactSubtitleViewerProps) {
  return <SubtitleViewerPanel variant="compact" isOpen={isOpen} onClose={onClose} />
}
