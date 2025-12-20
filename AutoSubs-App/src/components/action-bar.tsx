import * as React from "react"
import { Upload, FileUp, Speech, Languages, Type, ArrowUp, AudioLines, Globe, Check, X } from "lucide-react"
import { open } from '@tauri-apps/plugin-dialog'
import { downloadDir } from "@tauri-apps/api/path"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { Card } from "@/components/ui/card"
import { useSettings } from "@/contexts/SettingsContext"
import { useResolve } from "@/contexts/ResolveContext"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Track } from "@/types/interfaces"
import { Checkbox } from "@/components/ui/checkbox"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
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
import { languages, translateLanguages } from "@/lib/languages"
import { cn } from "@/lib/utils"

interface ActionBarProps {
    onStart?: () => void
    onCancel?: () => void
    isProcessing?: boolean
}

export function ActionBar({
    onStart,
    onCancel,
    isProcessing,
}: ActionBarProps) {
    const { settings, updateSetting } = useSettings()
    const { timelineInfo } = useResolve()
    const [openLanguage, setOpenLanguage] = React.useState(false)
    const [languageTab, setLanguageTab] = React.useState<'source' | 'translate'>('source')
    const [selectedFile, setSelectedFile] = React.useState<string | null>(null)
    const [openTrackSelector, setOpenTrackSelector] = React.useState(false)
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
                                    {settings.enableDiarize ? (settings.maxSpeakers === null ? "Auto" : settings.maxSpeakers) : "Off"}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 p-0" side="top">
                                <div className="px-4 py-5">
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
                    </div>
                    <div>
                        {isProcessing ? (
                            <Button
                                onClick={onCancel}
                                size="default"
                                variant="destructive"
                            >
                                <X />
                            </Button>
                        ) : (
                            <Button
                                onClick={onStart}
                                size="default"
                                variant="default"
                                disabled={isProcessing}
                            >
                                <ArrowUp />
                            </Button>
                        )}
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
                        className="w-full h-[120px] flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-5 px-2 cursor-pointer transition-colors hover:bg-muted/50 hover:dark:bg-muted outline-none"
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
                    {/* unified language button */}
                    <Popover open={openLanguage} onOpenChange={setOpenLanguage}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="default"
                                role="combobox"
                                aria-expanded={openLanguage}
                            >
                                <Globe />
                                <span>
                                    {settings.translate 
                                        ? `${settings.language === 'auto' ? 'Auto' : languages.find(l => l.value === settings.language)?.label} → ${translateLanguages.find(l => l.value === settings.targetLanguage)?.label}`
                                        : settings.language === 'auto' ? 'Auto' : languages.find(l => l.value === settings.language)?.label
                                    }
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-72" align="start">
                            {/* Source Language Tab */}
                            {languageTab === 'source' && (
                                <Command className="max-h-[250px]">
                                    <CommandInput placeholder="Search languages..." />
                                    <CommandList>
                                        <CommandEmpty>No language found.</CommandEmpty>
                                        <CommandGroup>
                                            {languages
                                                .slice()
                                                .map((language) => (
                                                    <CommandItem
                                                        value={language.label}
                                                        key={language.value}
                                                        onSelect={() => {
                                                            updateSetting("language", language.value);
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
                            )}

                            {/* Translate Language Tab */}
                            {languageTab === 'translate' && (
                                <Command className="max-h-[250px] relative">
                                    <div className="relative">
                                        <CommandInput placeholder="Search target languages..." className="border-0 focus-visible:ring-0 px-0 pr-12" />
                                        <Button
                                            size="sm"
                                            variant={settings.translate ? "default" : "outline"}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs h-8 px-3"
                                            onClick={() => updateSetting("translate", !settings.translate)}
                                        >
                                            {settings.translate ? "On" : "Off"}
                                        </Button>
                                    </div>
                                    <CommandList>
                                        <CommandEmpty>No language found.</CommandEmpty>
                                        <CommandGroup>
                                            {translateLanguages.map((language) => (
                                                <CommandItem
                                                    value={language.label}
                                                    key={language.value}
                                                    onSelect={() => {
                                                        updateSetting("targetLanguage", language.value);
                                                        if (!settings.translate) {
                                                            updateSetting("translate", true);
                                                        }
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
                            )}

                            {/* Tab Navigation at Bottom */}
                            <div className="border-t">
                                <div className="p-1.5 flex gap-1 bg-muted/50">
                                    <button
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all",
                                            languageTab === 'source'
                                                ? "bg-background text-foreground shadow-sm"
                                                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                                        )}
                                        onClick={() => setLanguageTab('source')}
                                    >
                                        <Globe className="h-4 w-4" />
                                        Source
                                    </button>
                                    <button
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all",
                                            languageTab === 'translate'
                                                ? "bg-background text-foreground shadow-sm"
                                                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                                        )}
                                        onClick={() => setLanguageTab('translate')}
                                    >
                                        <Languages className="h-4 w-4" />
                                        Translate
                                        {settings.translate && (
                                            <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
                                        )}
                                    </button>
                                </div>
                            </div>
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