import * as React from "react"
import { Download, Upload, FileUp, FileJson, Captions, Speech } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { open } from '@tauri-apps/plugin-dialog'
import { downloadDir } from "@tauri-apps/api/path"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { Switch } from "@/components/ui/switch"
import { Card } from "@/components/ui/card"

type ExportFormat = 'srt' | 'json';

interface ImportExportPopoverProps {
    onImport: () => Promise<void>
    onExport: (format: ExportFormat, includeSpeakerLabels: boolean) => Promise<void>
    hasSubtitles: boolean
}

export function ImportExportPopover({ onImport, onExport, hasSubtitles }: ImportExportPopoverProps) {
    const [selectedFile, setSelectedFile] = React.useState<string | null>(null)
    const [exportFormat, setExportFormat] = React.useState<ExportFormat>('srt')
    const [includeSpeakerLabels, setIncludeSpeakerLabels] = React.useState(false)

    React.useEffect(() => {
        let unlisten: (() => void) | undefined;
        (async () => {
            const webview = await getCurrentWebview();
            unlisten = await webview.onDragDropEvent((event: any) => {
                if (event.payload.type === 'drop') {
                    const files = event.payload.paths as string[] | undefined;
                    if (files && files.length > 0) {
                        const file = files[0];
                        // Accept common subtitle file types
                        if (file.endsWith('.srt')) {
                            setSelectedFile(file);
                        }
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
                name: 'Subtitle Files',
                extensions: ['srt']
            }],
            defaultPath: await downloadDir()
        });

        if (file) {
            setSelectedFile(file as string);
        }
    };

    const handleImportFile = async () => {
        if (selectedFile) {
            try {
                await onImport();
            } catch (error) {
                console.error("Failed to import file:", error);
            }
        }
    };

    const handleExportFile = async () => {
        try {
            await onExport(exportFormat, includeSpeakerLabels);
        } catch (error) {
            console.error("Failed to export file:", error);
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full flex items-center justify-center gap-2">
                    <Upload className="h-4 w-4" />
                    Import / Export
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
                <Tabs defaultValue="import" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="import">Import</TabsTrigger>
                        <TabsTrigger value="export">Export</TabsTrigger>
                    </TabsList>
                    <TabsContent value="import" className="space-y-3">
                        <div
                            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors mt-3 flex flex-col items-center justify-center h-36"
                            onClick={handleFileSelect}
                        >
                            <FileUp className="h-8 w-8 mb-2 text-muted-foreground" />
                            <span className="text-sm font-medium text-muted-foreground">Drop file here or click to select</span>
                            <span className="text-xs text-muted-foreground mt-1">Supports <span className="font-mono">.srt</span> files</span>
                        </div>

                        {selectedFile && (
                            <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-muted/40 rounded-lg">
                                <span className="text-sm text-muted-foreground">Selected:</span>
                                <span className="font-mono text-xs bg-background px-2 py-0.5 rounded border border-muted-foreground/10 max-w-[180px] truncate">
                                    {selectedFile.split('/').pop()}
                                </span>
                            </div>
                        )}

                        <Button
                            onClick={handleImportFile}
                            className="w-full mt-2"
                            disabled={!selectedFile}
                        >
                            Import File
                        </Button>
                    </TabsContent>
                    <TabsContent value="export" className="space-y-3">

                        {/* Switch to include speaker labels or not */}
                        <Card className="flex items-center justify-between p-2 mt-3 shadow-none">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                                    <Speech className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                </div>
                                <p className="text-sm font-medium">
                                    Include speaker labels
                                </p>
                            </div>
                            <Switch checked={includeSpeakerLabels} onCheckedChange={setIncludeSpeakerLabels} />
                        </Card>

                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                className={`flex-1 flex flex-col items-center justify-center h-32 border-2 rounded-xl ${exportFormat === 'srt' ? 'border-primary bg-primary/10' : 'bg-transparent'}`}
                                onClick={() => setExportFormat("srt")}
                                aria-label="Export as SRT"
                                type="button"
                            >
                                <Captions className="!h-6 !w-6 mb-2" />
                                <span className="text-base">SRT</span>
                            </Button>
                            <Button
                                variant="outline"
                                className={`flex-1 flex flex-col items-center justify-center h-32 border-2 rounded-xl ${exportFormat === 'json' ? 'border-primary bg-primary/10' : 'bg-transparent'}`}
                                onClick={() => setExportFormat("json")}
                                aria-label="Export as JSON"
                                type="button"
                            >
                                <FileJson className="!h-6 !w-6 mb-2" />
                                <span className="text-base">JSON</span>
                            </Button>
                        </div>
                        <Button
                            onClick={handleExportFile}
                            className="w-full mt-4"
                            disabled={!hasSubtitles}
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Download {exportFormat.toUpperCase()}
                        </Button>
                    </TabsContent>
                </Tabs>
            </PopoverContent>
        </Popover>
    )
}
