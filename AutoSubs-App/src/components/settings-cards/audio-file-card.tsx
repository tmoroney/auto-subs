import * as React from "react"
import { FileUp, Upload } from "lucide-react"

import { Card } from "@/components/ui/card"
import { open } from '@tauri-apps/plugin-dialog'
import { downloadDir } from "@tauri-apps/api/path"
import { getCurrentWebview } from "@tauri-apps/api/webview"

interface AudioFileCardProps {
  selectedFile: string | null
  onFileSelect: (file: string | null) => void
}

export const AudioFileCard = ({ selectedFile, onFileSelect }: AudioFileCardProps) => {
  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const webview = await getCurrentWebview();
      unlisten = await webview.onDragDropEvent((event: any) => {
        if (event.payload.type === 'drop') {
          const files = event.payload.paths as string[] | undefined;
          if (files && files.length > 0) {
            const file = files[0];
            // Accept all common audio and video file types supported by ffmpeg
            // Backend will validate actual support
            onFileSelect(file);
          }
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [onFileSelect]);
  const handleFileSelect = async () => {
    const file = await open({
      multiple: false,
      directory: false,
      filters: [{
        name: 'Media Files (ffmpeg-supported)',
        extensions: [
          'wav', 'mp3', 'm4a', 'flac', 'ogg', 'aac', 'mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'mpeg', 'mpg', 'm4v', '3gp', 'aiff', 'opus', 'alac', '*'
        ]
      }],
      defaultPath: await downloadDir()
    })
    onFileSelect(file)
  }

  return (
    <Card
      className="p-3.5 shadow-none relative"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
          <FileUp className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <p className="text-sm font-medium">Transcribe File</p>
          <p className="text-xs text-muted-foreground">Generate subtitles from any audio or video</p>
        </div>
      </div>
      {/* Drag and Drop Area */}
      <div
        className="h-[120px] flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-5 px-2 mt-4 bg-muted/10 cursor-pointer transition-colors hover:bg-muted/60 hover:dark:bg-muted/20 outline-none"
        tabIndex={0}
        role="button"
        aria-label="Drop audio file here or click to select"
        onClick={handleFileSelect}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleFileSelect(); }}
      >
        <Upload className="h-7 w-7 mb-1 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Drop file here or click to select</span>
        <span className="text-xs text-muted-foreground mt-1">Supports most media formats</span>
      </div>

      {selectedFile && (
        <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-muted/40 rounded-lg">
          <span className="text-sm text-muted-foreground">Selected:</span>
          <span className="font-mono text-xs bg-background px-2 py-0.5 rounded border border-muted-foreground/10 max-w-[180px] truncate">
            {selectedFile.split('/').pop()}
          </span>
        </div>
      )}
    </Card>
  )
}
