import * as React from "react"
import { ArrowUpIcon, Upload, FileUp } from "lucide-react"
import { open } from '@tauri-apps/plugin-dialog'
import { downloadDir } from "@tauri-apps/api/path"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { useGlobal } from "@/contexts/GlobalContext"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Captions, LoaderCircle, CirclePlay, XCircle } from "lucide-react"

interface ActionBarProps {
    isTranscribing?: boolean
    isExporting?: boolean
    labeledProgress?: any
    exportProgress?: number
    isMobile?: boolean
    fileInput?: string | null
    onShowMobileSubtitles?: () => void
    onStartTranscription?: () => void
    onCancelTranscription?: () => void
    getProgressColorClass?: (type: string) => string
}

export function ActionBar({
    isTranscribing = false,
    isExporting = false,
    labeledProgress,
    exportProgress = 0,
    isMobile = false,
    fileInput = null,
    onShowMobileSubtitles,
    onStartTranscription,
    onCancelTranscription,
    getProgressColorClass = () => ""
}: ActionBarProps) {
    const { settings, updateSetting } = useGlobal()
    const [selectedFile, setSelectedFile] = React.useState<string | null>(null)

    React.useEffect(() => {
        let unlisten: (() => void) | undefined;
        (async () => {
            const webview = await getCurrentWebview();
            unlisten = await webview.onDragDropEvent((event: any) => {
                if (event.payload.type === 'drop') {
                    const files = event.payload.paths as string[] | undefined;
                    if (files && files.length > 0) {
                        const file = files[0];
                        setSelectedFile(file);
                    }
                }
            });
        })();
        return () => {
            if (unlisten) unlisten();
        };
    }, []);

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
        setSelectedFile(file)
    }

    return (
        <Card className="p-3 rounded-2xl space-y-3 sticky bottom-4 mx-4 shadow-xl dark:bg-slate-900 bg-background">
            <div className="grid w-full gap-3">
                <div className="flex-1 flex justify-center">
                    <div className="flex-1 flex justify-center px-2">
                        <Tabs
                            value={settings.isStandaloneMode ? "standalone" : "resolve"}
                            onValueChange={(value) => updateSetting("isStandaloneMode", value === "standalone")}
                            className="w-full"
                        >
                            <TabsList className="w-full rounded-full">
                                <TabsTrigger value="resolve" className="flex-1 rounded-full text-sm">
                                    Resolve
                                </TabsTrigger>
                                <TabsTrigger value="standalone" className="flex-1 rounded-full text-sm">
                                    Standalone
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </div>
                <div
                    className="w-full h-[120px] flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-5 px-2 bg-muted/10 cursor-pointer transition-colors hover:bg-muted/60 hover:dark:bg-muted/20 outline-none"
                    tabIndex={0}
                    role="button"
                    aria-label="Drop audio file here or click to select"
                    onClick={handleFileSelect}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleFileSelect(); }}
                >
                    {selectedFile ? (
                        <div className="flex flex-col items-center gap-2">
                            <FileUp className="h-7 w-7 text-green-500" />
                            <span className="text-sm font-medium text-muted-foreground truncate max-w-[90%]">
                                {selectedFile.split('/').pop()}
                            </span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-1">
                            <Upload className="h-7 w-7 mb-1 text-muted-foreground" />
                            <span className="text-sm font-medium text-muted-foreground">Drop file here or click to select</span>
                            <span className="text-xs text-muted-foreground mt-1">Supports most media formats</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Progress Indicators */}
            {isTranscribing && labeledProgress && (
                <div className="space-y-1">
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{labeledProgress.label || "Processing"}</span>
                        <span>{labeledProgress.progress}%</span>
                    </div>
                    <Progress
                        value={labeledProgress.progress}
                        className={getProgressColorClass(labeledProgress.type)}
                    />
                </div>
            )}

            {isExporting && !settings.isStandaloneMode && (
                <div className="space-y-1">
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Exporting Audio from Timeline</span>
                        <span>{exportProgress}%</span>
                    </div>
                    <Progress
                        value={exportProgress}
                        className="h-2 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-green-600"
                    />
                </div>
            )}

            {/* Start Transcription Button */}
            <div className="flex gap-2">
                <Button
                    onClick={onStartTranscription}
                    disabled={isTranscribing || isExporting || labeledProgress?.type === 'Download' || (settings.selectedInputTracks.length === 0 && !settings.isStandaloneMode) || (fileInput === null && settings.isStandaloneMode)}
                    className="flex-1"
                    size={isMobile ? undefined : "lg"}
                >
                    {isTranscribing || isExporting ? <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> : <CirclePlay className="mr-2 h-5 w-5" />}
                    {isExporting ? "Exporting Audio..." : isTranscribing ? (labeledProgress?.type === 'Download' ? "Downloading Model..." : "Processing...") : "Start Transcription"}
                </Button>

                {(isTranscribing || isExporting) && onCancelTranscription && (
                    <Button
                        onClick={onCancelTranscription}
                        variant="destructive"
                        size={isMobile ? undefined : "lg"}
                        className="px-3"
                    >
                        <XCircle className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </Card>
    )
}