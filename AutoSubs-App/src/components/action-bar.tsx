import * as React from "react"
import { Upload, FileUp, Speech, Languages, Type, ArrowUp, AudioLines, Globe, Check, Brain } from "lucide-react"
import { open } from '@tauri-apps/plugin-dialog'
import { downloadDir } from "@tauri-apps/api/path"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { Card } from "@/components/ui/card"
import { useGlobal } from "@/contexts/GlobalContext"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Download, HardDrive, MemoryStick } from "lucide-react"
import { Track } from "@/types/interfaces"
import { Checkbox } from "@/components/ui/checkbox"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useMediaQuery } from "../hooks/use-media-query";
import { languages } from "@/lib/languages"
import { cn } from "@/lib/utils"

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
}: ActionBarProps) {
    const { settings, updateSetting, modelsState, downloadingModel, downloadProgress, timelineInfo } = useGlobal()
    const [openModelSelector, setOpenModelSelector] = React.useState(false)
    const [openTargetLanguage, setOpenTargetLanguage] = React.useState(false)
    const [activeTab, setActiveTab] = React.useState('all')
    const isSmallScreen = useMediaQuery('(max-width: 640px)')
    const [selectedFile, setSelectedFile] = React.useState<string | null>(null)
    const [openTrackSelector, setOpenTrackSelector] = React.useState(false)
    const [openInputLanguage, setOpenInputLanguage] = React.useState(false)
    const [openSpeakerPopover, setOpenSpeakerPopover] = React.useState(false)
    const [openTextFormattingPopover, setOpenTextFormattingPopover] = React.useState(false)
    const [openCensorDialog, setOpenCensorDialog] = React.useState(false)
    const [newCensoredWord, setNewCensoredWord] = React.useState("")

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
        <Card className="p-3 space-y-3 sticky bottom-4 mx-4">
            <div className="grid w-full gap-3">
                <div className="flex justify-between items-center">
                    <div className="flex gap-1">
                        {/* subtitle formatting options */}
                        <Popover open={openTextFormattingPopover} onOpenChange={setOpenTextFormattingPopover}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="default"
                                    role="combobox"
                                    aria-expanded={openTextFormattingPopover}
                                >
                                    <Type />
                                    Format
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-0" align="start">
                                <div className="space-y-4 p-4">
                                    {/* Text Case */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Label className="text-sm font-medium">Text Case</Label>
                                            <p className="text-xs text-muted-foreground">Modify subtitle case</p>
                                        </div>
                                        <div className="w-36">
                                            <Select
                                                value={settings.textCase}
                                                onValueChange={(val) => updateSetting("textCase", val as "none" | "uppercase" | "lowercase" | "titlecase")}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent align="end">
                                                    <SelectItem value="none">Normal</SelectItem>
                                                    <SelectItem value="lowercase">lowercase</SelectItem>
                                                    <SelectItem value="uppercase">UPPERCASE</SelectItem>
                                                    <SelectItem value="titlecase">Title Case</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* Split on Punctuation */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Label className="text-sm font-medium">Split on Punctuation</Label>
                                            <p className="text-xs text-muted-foreground">Natural line breaks</p>
                                        </div>
                                        <Switch
                                            checked={settings.splitOnPunctuation}
                                            onCheckedChange={(checked) => updateSetting("splitOnPunctuation", checked)}
                                        />
                                    </div>

                                    {/* Remove Punctuation */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Label className="text-sm font-medium">Remove Punctuation</Label>
                                            <p className="text-xs text-muted-foreground">Removes commas, periods, etc.</p>
                                        </div>
                                        <Switch
                                            checked={settings.removePunctuation}
                                            onCheckedChange={(checked) => updateSetting("removePunctuation", checked)}
                                        />
                                    </div>

                                    {/* Character Limit */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Label className="text-sm font-medium">Character Limit</Label>
                                            <p className="text-xs text-muted-foreground">Per line (0 = auto)</p>
                                        </div>
                                        <Input
                                            type="number"
                                            min="0"
                                            value={settings.maxCharsPerLine}
                                            onChange={(e) => updateSetting("maxCharsPerLine", Number(e.target.value))}
                                            className="w-20"
                                        />
                                    </div>

                                    {/* Line Count */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Label className="text-sm font-medium">Line Count</Label>
                                            <p className="text-xs text-muted-foreground">Max lines per subtitle</p>
                                        </div>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={settings.maxLinesPerSubtitle}
                                            onChange={(e) => updateSetting("maxLinesPerSubtitle", Number(e.target.value))}
                                            className="w-20"
                                        />
                                    </div>

                                    {/* Censor Words */}
                                    <div className="space-y-3">
                                        <Dialog open={openCensorDialog} onOpenChange={setOpenCensorDialog}>
                                            <DialogTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="w-full justify-start"
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-2 h-2 rounded-full ${settings.enableCensor ? "bg-primary" : "bg-gray-300"}`} />
                                                            <span className={`text-sm ${!settings.enableCensor ? "text-muted-foreground" : ""}`}>Censor Words</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-muted-foreground">
                                                                {(settings.censoredWords || []).length} words
                                                            </span>
                                                            {!settings.enableCensor && (
                                                                <span className="text-xs text-red-500">Off</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Censor Sensitive Words</DialogTitle>
                                                    <DialogDescription>
                                                        Add words to be censored in the subtitles.
                                                    </DialogDescription>
                                                </DialogHeader>

                                                <div className="space-y-4">
                                                    <form
                                                        className="flex gap-2"
                                                        onSubmit={(e) => {
                                                            e.preventDefault();
                                                            if (!newCensoredWord.trim() || (settings.censoredWords || []).includes(newCensoredWord.trim())) return;
                                                            updateSetting("censoredWords", [...(settings.censoredWords || []), newCensoredWord.trim()]);
                                                            setNewCensoredWord("");
                                                        }}
                                                    >
                                                        <Input
                                                            value={newCensoredWord}
                                                            onChange={(e) => setNewCensoredWord(e.target.value)}
                                                            placeholder="Add word to censor"
                                                            className="flex-1"
                                                        />
                                                        <Button
                                                            type="submit"
                                                            size="sm"
                                                            disabled={!newCensoredWord.trim() || (settings.censoredWords || []).includes(newCensoredWord.trim())}
                                                        >
                                                            Add
                                                        </Button>
                                                    </form>

                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <Label className="text-sm font-medium">Censored Words</Label>
                                                            <span className="text-xs text-muted-foreground">
                                                                {(settings.censoredWords || []).length} words
                                                            </span>
                                                        </div>
                                                        <ScrollArea className="max-h-[200px] border rounded-lg p-2">
                                                            {(settings.censoredWords || []).length === 0 ? (
                                                                <div className="text-xs text-muted-foreground text-center py-4">
                                                                    No words selected to censor
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {(settings.censoredWords || []).map((word: string, index: number) => (
                                                                        <Badge
                                                                            key={index}
                                                                            variant="secondary"
                                                                            className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                                                                            onClick={() => {
                                                                                const updatedWords = (settings.censoredWords || []).filter((_, i) => i !== index);
                                                                                updateSetting("censoredWords", updatedWords);
                                                                            }}
                                                                        >
                                                                            {word}
                                                                            <span className="ml-2">×</span>
                                                                        </Badge>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </ScrollArea>
                                                    </div>
                                                </div>
                                                <DialogFooter>
                                                    <Button
                                                        variant={settings.enableCensor ? "destructive" : "default"}
                                                        onClick={() => {
                                                            updateSetting("enableCensor", !settings.enableCensor);
                                                            if (settings.enableCensor) {
                                                                setOpenCensorDialog(false);
                                                            }
                                                        }}
                                                    >
                                                        {settings.enableCensor ? "Disable Censoring" : "Enable Censoring"}
                                                    </Button>
                                                    <DialogClose asChild>
                                                        <Button variant="outline">Close</Button>
                                                    </DialogClose>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>

                        {/* speaker diarization options */}
                        <Popover open={openSpeakerPopover} onOpenChange={setOpenSpeakerPopover}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="default"
                                    role="combobox"
                                    aria-expanded={openSpeakerPopover}
                                >
                                    <Speech />
                                    {settings.enableDiarize ? (settings.maxSpeakers === null ? "Auto" : settings.maxSpeakers) : ""}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 p-0" side="top">
                                <div className="px-4 py-3">
                                    {/* Speaker Count Slider */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-sm font-medium">Number of Speakers</Label>
                                            <span className={`text-sm font-medium ${settings.enableDiarize ? "text-primary" : "text-red-500"}`}>
                                                {settings.enableDiarize ? (settings.maxSpeakers === null ? "Auto" : settings.maxSpeakers) : "Disabled"}
                                            </span>
                                        </div>
                                        <Slider
                                            value={[settings.enableDiarize ? (settings.maxSpeakers === null ? 0 : settings.maxSpeakers) : 0]}
                                            onValueChange={([value]) => settings.enableDiarize && updateSetting("maxSpeakers", value === 0 ? null : value)}
                                            max={10}
                                            min={0}
                                            step={1}
                                            className="w-full"
                                            disabled={!settings.enableDiarize}
                                        />
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>Auto</span>
                                            <span>10</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="border-t bg-muted/30">
                                    <div className="p-4 pt-2 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="space-y-0.5">
                                                <Label className="text-sm font-medium">Speaker Labels</Label>
                                                <p className="text-xs text-muted-foreground">Identify different speakers</p>
                                            </div>
                                            <Switch
                                                checked={settings.enableDiarize}
                                                onCheckedChange={(checked) => updateSetting("enableDiarize", checked)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>

                        {/* translation button */}
                        <Popover open={openTargetLanguage} onOpenChange={setOpenTargetLanguage}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="default"
                                    role="combobox"
                                    aria-expanded={openTargetLanguage}
                                >
                                    <Languages />
                                    {settings.translate &&
                                        <span>
                                            {languages.find(l => l.value === settings.targetLanguage)?.label}
                                        </span>
                                    }
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-72">
                                <Command className="max-h-[250px]">
                                    <CommandInput placeholder="Search target languages..." />
                                    <CommandList>
                                        <CommandEmpty>No language found.</CommandEmpty>
                                        <CommandGroup>
                                            {languages
                                                .filter(l => l.value !== 'auto')
                                                .slice()
                                                .sort((a, b) => a.label.localeCompare(b.label))
                                                .map((language) => (
                                                    <CommandItem
                                                        value={language.label}
                                                        key={language.value}
                                                        onSelect={() => {
                                                            updateSetting("targetLanguage", language.value);
                                                            if (!settings.translate) {
                                                                updateSetting("translate", true);
                                                            }
                                                            setOpenTargetLanguage(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                language.value === settings.targetLanguage
                                                                    ? "opacity-100"
                                                                    : "opacity-0"
                                                            )}
                                                        />
                                                        {language.label}
                                                    </CommandItem>
                                                ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                                <div className="border-t bg-muted/30">
                                    <div className="p-4 pt-2 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="space-y-0.5">
                                                <Label className="text-sm font-medium">Translate Subtitles</Label>
                                                <p className="text-xs text-muted-foreground">From {languages.find(l => l.value === settings.language)?.label} to {languages.find(l => l.value === settings.targetLanguage)?.label}</p>
                                            </div>
                                            <Switch
                                                checked={settings.translate}
                                                onCheckedChange={(checked) => updateSetting("translate", checked)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div>
                        <Button
                            onClick={onShowMobileSubtitles}
                            size="default"
                            variant="default"
                        >
                            <ArrowUp />
                        </Button>
                    </div>
                </div>

                {/* Conditional rendering: Track Selector for Timeline mode, File Drop for Standalone mode */}
                {!settings.isStandaloneMode ? (
                    // Timeline Mode: Track Selector
                    <Popover open={openTrackSelector} onOpenChange={setOpenTrackSelector}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openTrackSelector}
                                className="w-full h-[120px] justify-center"
                            >
                                <div className="flex flex-col items-center gap-2">
                                    <AudioLines className="h-7 w-7 text-muted-foreground" />
                                    <div className="text-sm font-medium">
                                        {settings.selectedInputTracks.length === 0
                                            ? "Select tracks..."
                                            : settings.selectedInputTracks.length === 1
                                                ? `Track ${settings.selectedInputTracks[0]}`
                                                : `${settings.selectedInputTracks.length} tracks selected`
                                        }
                                    </div>
                                    <span className="text-xs text-muted-foreground">Click to select audio tracks</span>
                                </div>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="min-w-[320px] p-0 overflow-hidden" align="center">
                            {inputTracks.length > 0 ? (
                                <div className="px-4 py-2 bg-gradient-to-br from-red-50/80 to-orange-50/80 dark:from-red-950/50 dark:to-orange-950/50 border-b">
                                    <div className="flex items-center justify-between min-h-[28px]">
                                        <span className="text-sm text-muted-foreground">
                                            {settings.selectedInputTracks.length > 0
                                                ? (settings.selectedInputTracks.length === 1
                                                    ? `${inputTracks.find(track => track.value === settings.selectedInputTracks[0])?.label || `Track ${settings.selectedInputTracks[0]}`} selected`
                                                    : `${settings.selectedInputTracks.length} tracks selected`)
                                                : 'No tracks selected'}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-xs h-7 px-2 hover:bg-white/80 dark:hover:bg-zinc-800/80"
                                            onClick={() => {
                                                if (settings.selectedInputTracks.length === inputTracks.length) {
                                                    updateSetting("selectedInputTracks", []);
                                                } else {
                                                    updateSetting("selectedInputTracks", inputTracks.map(track => track.value));
                                                }
                                            }}
                                        >
                                            {settings.selectedInputTracks.length === inputTracks.length ? "Clear All" : "Select All"}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="px-4 py-3 bg-red-50/30 dark:bg-red-900/10 border-b">
                                    <p className="text-sm text-center text-muted-foreground">
                                        No audio tracks found.
                                    </p>
                                </div>
                            )}
                            {inputTracks.length > 0 ? (
                                <ScrollArea style={{ maxHeight: '200px', width: '100%' }}>
                                    <div className="flex flex-col gap-1 p-2">
                                        {inputTracks.map((track) => {
                                            const trackId = track.value;
                                            const isChecked = settings.selectedInputTracks.includes(trackId);
                                            return (
                                                <div
                                                    key={trackId}
                                                    className={`group relative flex items-center gap-3 py-2 px-3 rounded-lg border transition-all duration-200 w-full cursor-pointer select-none
                                                    ${isChecked
                                                            ? 'bg-red-50/50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
                                                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-zinc-100 dark:border-zinc-800'}`}
                                                    onClick={() => {
                                                        if (isChecked) {
                                                            updateSetting("selectedInputTracks", settings.selectedInputTracks.filter(id => id !== trackId));
                                                        } else {
                                                            updateSetting("selectedInputTracks", [...settings.selectedInputTracks, trackId]);
                                                        }
                                                    }}
                                                >
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors
                                                    ${isChecked
                                                            ? 'bg-red-100 dark:bg-red-900/50'
                                                            : 'bg-zinc-100 dark:bg-zinc-800'}`}
                                                    >
                                                        <AudioLines className={`h-4 w-4 ${isChecked ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'}`} />
                                                    </div>
                                                    <span className={`text-sm font-medium flex-1 text-left ${isChecked ? 'text-red-600 dark:text-red-400' : ''}`}>
                                                        {track.label}
                                                    </span>
                                                    <Checkbox
                                                        id={`track-${trackId}`}
                                                        checked={isChecked}
                                                        tabIndex={-1}
                                                        className="transition-transform duration-150"
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                updateSetting("selectedInputTracks", [...settings.selectedInputTracks, trackId]);
                                                            } else {
                                                                updateSetting("selectedInputTracks", settings.selectedInputTracks.filter(id => id !== trackId));
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            ) : (
                                <div className="p-6 flex items-center justify-center">
                                    <p className="text-sm text-center text-muted-foreground">
                                        Create an audio track in your current timeline to start transcribing.
                                    </p>
                                </div>
                            )}
                        </PopoverContent>
                    </Popover>
                ) : (
                    // Standalone Mode: File Drop Box
                    <div
                        className="w-full h-[120px] flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-5 px-2 cursor-pointer transition-colors hover:bg-muted/50 hover:dark:bg-muted/50 outline-none"
                        tabIndex={0}
                        role="button"
                        aria-label="Drop audio file here or click to select"
                        onClick={handleFileSelect}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleFileSelect(); }}
                    >
                        {selectedFile ? (
                            <div className="flex flex-col items-center gap-2">
                                <FileUp className="h-7 w-7 text-green-500" />
                                <span className="text-sm font-medium text-muted-foreground truncate">
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
                )}
            </div>

            <div className="flex justify-between">
                <div className="justify-start flex items-center gap-1">
                    {/* input language button */}
                    <Popover open={openInputLanguage} onOpenChange={setOpenInputLanguage}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="default"
                                role="combobox"
                                aria-expanded={openInputLanguage}
                            >
                                <Globe />
                                <span>
                                    {settings.language === 'auto' ? 'Auto' : languages.find(l => l.value === settings.language)?.label}
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-full" align="start">
                            <Command className="max-h-[250px]">
                                <CommandInput placeholder="Search languages..." />
                                <CommandList>
                                    <CommandEmpty>No language found.</CommandEmpty>
                                    <CommandGroup>
                                        {languages
                                            .slice()
                                            .sort((a, b) => {
                                                if (a.value === 'en') return -1;
                                                if (b.value === 'en') return 1;
                                                return a.label.localeCompare(b.label);
                                            })
                                            .map((language) => (
                                                <CommandItem
                                                    value={language.label}
                                                    key={language.value}
                                                    onSelect={() => {
                                                        updateSetting("language", language.value);
                                                        setOpenInputLanguage(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            language.value === settings.language
                                                                ? "opacity-100"
                                                                : "opacity-0"
                                                        )}
                                                    />
                                                    {language.label}
                                                </CommandItem>
                                            ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>

                    <Popover open={openModelSelector} onOpenChange={setOpenModelSelector}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="default"
                                role="combobox"
                                aria-expanded={openModelSelector}
                            >
                                <div className="flex items-center gap-2">
                                    <Brain className="w-3 h-3" />
                                    <span className="truncate max-w-20">{modelsState[settings.model].label}</span>
                                    {modelsState[settings.model].isDownloaded ? (
                                        <Check className="h-3 w-3 text-green-600" />
                                    ) : (
                                        <Download className="h-3 w-3 text-gray-500" />
                                    )}
                                </div>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-1">
                            <Tabs defaultValue="all" className="w-full" value={activeTab} onValueChange={setActiveTab}>
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="all" className="text-xs p-2">All Languages</TabsTrigger>
                                    <TabsTrigger value="en" className="text-xs p-2">English-Only</TabsTrigger>
                                </TabsList>
                                <ScrollArea className="my-1.5">
                                    <div className="space-y-1 pr-0">
                                        {modelsState.filter(model => {
                                            if (activeTab === 'all') {
                                                return !model.value.includes('.en');
                                            } else {
                                                return model.value.includes('.en') || model.value === 'large-v3' || model.value === 'large-v3-turbo';
                                            }
                                        }).map((model) => {
                                            const originalIndex = modelsState.findIndex(m => m.value === model.value);
                                            return (
                                                <HoverCard key={originalIndex}>
                                                    <HoverCardTrigger asChild>
                                                        <div
                                                            className={`flex items-center justify-between p-2 cursor-pointer rounded-lg transition-colors duration-200 ${settings.model === originalIndex
                                                                ? "bg-blue-50 dark:bg-blue-900/20"
                                                                : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                                                }`}
                                                            onClick={() => {
                                                                updateSetting("model", originalIndex)
                                                                setOpenModelSelector(false)
                                                            }}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <img src={model.image} alt={model.label + " icon"} className="w-8 h-8 object-contain rounded" />
                                                                <div className="flex flex-col">
                                                                    <span className="font-medium text-xs">{model.label}</span>
                                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                        <div className="flex items-center gap-1">
                                                                            <HardDrive className="h-3 w-3" />
                                                                            <span>{model.size}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1">
                                                                            <MemoryStick className="h-3 w-3" />
                                                                            <span>{model.ram}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {downloadingModel === model.value ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <Progress value={downloadProgress} className="h-1 w-12" />
                                                                        <span className="text-xs text-blue-600 dark:text-blue-400">{downloadProgress}%</span>
                                                                    </div>
                                                                ) : model.isDownloaded ? (
                                                                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                                                        Cached
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                                                        Available
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </HoverCardTrigger>
                                                    <HoverCardContent className="w-80" side={isSmallScreen ? "top" : "right"}>
                                                        <div className="flex items-start gap-3">
                                                            <img
                                                                src={model.image}
                                                                alt={model.label + " icon"}
                                                                className="h-12 w-12 object-contain rounded"
                                                            />
                                                            <div className="space-y-1">
                                                                <h4 className="text-sm font-semibold">{model.label}</h4>
                                                                <p className="text-xs text-muted-foreground">{model.details}</p>
                                                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                                    <div className="flex items-center gap-1">
                                                                        <HardDrive className="h-3 w-3" />
                                                                        <span>{model.size}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-1">
                                                                        <MemoryStick className="h-3 w-3" />
                                                                        <span>{model.ram}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </HoverCardContent>
                                                </HoverCard>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </Tabs>
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="flex">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="secondary" size="sm" className="text-xs">
                                <AudioLines />
                                {settings.isStandaloneMode ? "File Input" : "Timeline"}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                onClick={() => updateSetting("isStandaloneMode", false)}
                                className="text-xs"
                            >
                                <div className="p-0.5">
                                    <div className="font-medium">Timeline</div>
                                    <div className="text-muted-foreground">Connect to Davinci Resolve Timeline</div>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => updateSetting("isStandaloneMode", true)}
                                className="text-xs"
                            >
                                <div className="p-0.5">
                                    <div className="font-medium">File Input</div>
                                    <div className="text-muted-foreground text-xs">Transcribe any audio file</div>
                                </div>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </Card>
    )
}