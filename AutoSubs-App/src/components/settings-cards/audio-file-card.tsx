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
            const ext = file.split('.').pop()?.toLowerCase();
            if (ext === 'wav' || ext === 'mp3') {
              onFileSelect(file);
            }
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
        name: 'Audio Files',
        extensions: ['wav', 'mp3']
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
          <p className="text-sm font-medium">Audio File</p>
          <p className="text-xs text-muted-foreground">Select an audio file to transcribe</p>
        </div>
      </div>
      {/* Drag and Drop Area */}
      <div
        className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-5 px-2 mb-2 mt-4 bg-muted/10 cursor-pointer transition-colors hover:bg-muted/60 hover:dark:bg-muted/20 outline-none"
        tabIndex={0}
        role="button"
        aria-label="Drop audio file here or click to select"
        onClick={handleFileSelect}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleFileSelect(); }}
      >
        <Upload className="h-7 w-7 mb-1 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Drop audio file here or click to select</span>
        <span className="text-xs text-muted-foreground mt-1">(WAV or MP3)</span>
      </div>
      {/* Old button removed, replaced by dropzone */}

      {selectedFile && (
        <div className="text-sm text-muted-foreground truncate mt-2">
          <span className="font-medium">Selected: </span>
          {selectedFile.split('/').pop()}
        </div>
      )}
    </Card>
  )
}
