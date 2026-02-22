import * as React from "react"
import { Speech, Type, AudioLines, Globe, X, PlayCircle } from "lucide-react"
import { UploadIcon, type UploadIconHandle } from "@/components/ui/icons/upload"
import { open } from '@tauri-apps/plugin-dialog'
import { downloadDir } from "@tauri-apps/api/path"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { Card } from "@/components/ui/card"
import { useSettings } from "@/contexts/SettingsContext"
import { useResolve } from "@/contexts/ResolveContext"
import { Button } from "@/components/ui/button"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Track } from "@/types/interfaces"
import { languages, translateLanguages } from "@/lib/languages"
import { useTranslation } from "react-i18next"
import { LanguageSelector } from "@/components/settings/language-selector"
import { SpeakerSelector } from "@/components/settings/diarize-selector"
import { TextFormattingPanel } from "@/components/settings/text-formatting-panel"
import { TrackSelector } from "@/components/settings/track-selector"

interface ActionBarProps {
    selectedFile?: string | null
    onSelectedFileChange?: (file: string | null) => void
    onStart?: () => void
    onCancel?: () => void
    isProcessing?: boolean
}

export function ActionBar({
    selectedFile: selectedFileProp,
    onSelectedFileChange,
    onStart,
    onCancel,
    isProcessing,
}: ActionBarProps) {
    const { t } = useTranslation()
    const { settings } = useSettings()
    const { timelineInfo, refresh } = useResolve()
    const [openLanguage, setOpenLanguage] = React.useState(false)
    const [localSelectedFile, setLocalSelectedFile] = React.useState<string | null>(null)
    const [openTrackSelector, setOpenTrackSelector] = React.useState(false)
    const [openSpeakerPopover, setOpenSpeakerPopover] = React.useState(false)
    const [openTextFormattingPopover, setOpenTextFormattingPopover] = React.useState(false)
    const uploadIconRef = React.useRef<UploadIconHandle>(null)

    const selectedFile = selectedFileProp ?? localSelectedFile

    const setSelectedFile = React.useCallback((file: string | null) => {
        setLocalSelectedFile(file)
        onSelectedFileChange?.(file)
    }, [onSelectedFileChange])

    // Get input tracks from timeline info
    const inputTracks: Track[] = React.useMemo(() => {
        if (!timelineInfo?.inputTracks) return [];
        return timelineInfo.inputTracks;
    }, [timelineInfo])

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
    }, [setSelectedFile]);

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

    const handleTrackSelectorOpen = async (open: boolean) => {
        setOpenTrackSelector(open)
        if (open && !settings.isStandaloneMode) {
            try {
                await refresh()
            } catch (error) {
                console.error("Failed to refresh timeline info:", error)
            }
        }
    }

    return (
        <Card className="p-3 sticky bottom-4 mx-4 z-50 shadow-lg bg-card">
            <div className="grid w-full gap-3">
                {/* 1. TRANSCRIPTION SETTINGS - All settings in one row at the top */}
                <div className="flex items-center gap-1.5">
                    {/* Language selector */}
                    <Popover open={openLanguage} onOpenChange={setOpenLanguage}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="default"
                                role="combobox"
                                aria-expanded={openLanguage}
                                className="dark:bg-background dark:hover:bg-accent rounded-full"
                            >
                                <Globe className="h-4 w-4" />
                                <span className="text-xs truncate">
                                    {settings.translate
                                        ? `${settings.language === 'auto' ? t('actionBar.common.auto') : languages.find(l => l.value === settings.language)?.label} → ${translateLanguages.find(l => l.value === settings.targetLanguage)?.label}`
                                        : settings.language === 'auto' ? t('actionBar.common.auto') : languages.find(l => l.value === settings.language)?.label
                                    }
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-72" align="start" side="top">
                            <LanguageSelector />
                        </PopoverContent>
                    </Popover>

                    {/* Speaker diarization */}
                    <Popover open={openSpeakerPopover} onOpenChange={setOpenSpeakerPopover}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="default"
                                role="combobox"
                                aria-expanded={openSpeakerPopover}
                                className="dark:bg-background dark:hover:bg-accent rounded-full"
                            >
                                <Speech className="h-4 w-4" />
                                <span className="text-xs">{settings.enableDiarize ? (settings.maxSpeakers === null ? t("actionBar.common.auto") : settings.maxSpeakers) : t("actionBar.common.off")}</span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-0" side="top">
                            <SpeakerSelector />
                        </PopoverContent>
                    </Popover>

                    {/* Text formatting */}
                    <Popover open={openTextFormattingPopover} onOpenChange={setOpenTextFormattingPopover}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="default"
                                role="combobox"
                                aria-expanded={openTextFormattingPopover}
                                className="dark:bg-background dark:hover:bg-accent rounded-full"
                            >
                                <Type className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0" align="center">
                            <TextFormattingPanel />
                        </PopoverContent>
                    </Popover>
                </div>

                {/* 2. INPUT SOURCE */}
                {!settings.isStandaloneMode ? (
                    // Timeline Mode: Track Selector
                    <Popover open={openTrackSelector} onOpenChange={handleTrackSelectorOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openTrackSelector}
                                className="w-full h-[120px] justify-center dark:bg-background dark:hover:bg-accent"
                                size="sm"
                            >
                                <div className="flex flex-col items-center gap-2">
                                    <AudioLines className="h-6 w-6" />
                                    <div className="text-sm font-medium">
                                        {settings.selectedInputTracks.length === 0
                                            ? t("actionBar.tracks.selectTracks")
                                            : settings.selectedInputTracks.length === 1
                                                ? t("actionBar.tracks.trackN", { n: settings.selectedInputTracks[0] })
                                                : t("actionBar.tracks.countSelected", { count: settings.selectedInputTracks.length })
                                        }
                                    </div>
                                    <span className="text-xs text-muted-foreground">{t("actionBar.tracks.selectMultiple")}</span>
                                </div>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="min-w-[320px] p-0 overflow-hidden" align="center">
                            <TrackSelector inputTracks={inputTracks} />
                        </PopoverContent>
                    </Popover>
                ) : (
                    // Standalone Mode: File Drop Box
                    <div
                        className="w-full h-[120px] flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-4 px-2 cursor-pointer transition-colors hover:bg-muted/50 hover:dark:bg-muted outline-none"
                        tabIndex={0}
                        role="button"
                        aria-label={t("actionBar.fileDrop.aria")}
                        onClick={handleFileSelect}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleFileSelect(); }}
                        onMouseEnter={() => uploadIconRef.current?.startAnimation()}
                        onMouseLeave={() => uploadIconRef.current?.stopAnimation()}
                    >
                        {selectedFile ? (
                            <div className="flex flex-col items-center gap-1">
                                <UploadIcon ref={uploadIconRef} size={24} className="text-green-500" />
                                <span className="text-sm font-medium text-muted-foreground truncate max-w-full px-2">
                                    {selectedFile.split('/').pop()}
                                </span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-1">
                                <UploadIcon ref={uploadIconRef} size={24} className="text-muted-foreground" />
                                <span className="text-sm font-medium text-muted-foreground">{t("actionBar.fileDrop.prompt")}</span>
                                <span className="text-xs text-muted-foreground">{t("actionBar.fileDrop.supports")}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* 3. ACTION - Primary action, full width */}
                {isProcessing ? (
                    <Button
                        onClick={onCancel}
                        size="default"
                        variant="destructive"
                        className="w-full mt-1"
                    >
                        <X className="h-4 w-4" />
                        {t("common.cancel")}
                    </Button>
                ) : (
                    <Button
                        onClick={onStart}
                        size="default"
                        variant="default"
                        className="w-full mt-1"
                        disabled={isProcessing}
                    >
                        <PlayCircle className="h-4 w-4" />
                        {t("common.generateSubtitles")}
                    </Button>
                )}
            </div>
        </Card>
    )
}