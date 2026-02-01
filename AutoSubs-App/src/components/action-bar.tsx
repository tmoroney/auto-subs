import * as React from "react"
import { Speech, Languages, Type, AudioLines, Globe, Check, X, Settings2, PlayCircle } from "lucide-react"
import { UploadIcon, type UploadIconHandle } from "@/components/ui/upload"
import { open } from '@tauri-apps/plugin-dialog'
import { downloadDir } from "@tauri-apps/api/path"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { Card } from "@/components/ui/card"
import { useSettings } from "@/contexts/SettingsContext"
import { useResolve } from "@/contexts/ResolveContext"
import { Button } from "@/components/ui/button"
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useTranslation } from "react-i18next"

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
    const { settings, updateSetting } = useSettings()
    const { timelineInfo, refresh } = useResolve()
    const [openLanguage, setOpenLanguage] = React.useState(false)
    const [languageTab, setLanguageTab] = React.useState<'source' | 'translate'>('source')
    const [localSelectedFile, setLocalSelectedFile] = React.useState<string | null>(null)
    const [openTrackSelector, setOpenTrackSelector] = React.useState(false)
    const [openSpeakerPopover, setOpenSpeakerPopover] = React.useState(false)
    const [openTextFormattingPopover, setOpenTextFormattingPopover] = React.useState(false)
    const [openCensorDialog, setOpenCensorDialog] = React.useState(false)
    const [newCensoredWord, setNewCensoredWord] = React.useState("")
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
        <Card className="p-3 space-y-3 sticky bottom-4 mx-4">
            <div className="grid w-full gap-3">
                {/* 1. TRANSCRIPTION SETTINGS - All settings in one row at the top */}
                <div className="flex items-center gap-2">
                    {/* Language selector */}
                    <Popover open={openLanguage} onOpenChange={setOpenLanguage}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="default"
                                role="combobox"
                                aria-expanded={openLanguage}
                                className="flex-1 dark:bg-transparent/50 dark:hover:bg-accent"
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
                            <Tabs value={languageTab} onValueChange={(value) => setLanguageTab(value as 'source' | 'translate')}>
                                <TabsContent value="source" className="mt-0 border-b">
                                    <Command className="max-h-[250px]">
                                        <CommandInput placeholder={t("actionBar.language.searchSourcePlaceholder")} />
                                        <CommandList>
                                            <CommandEmpty>{t("actionBar.language.noLanguageFound")}</CommandEmpty>
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
                                </TabsContent>

                                <TabsContent value="translate" className="mt-0 border-b">
                                    <Command className="max-h-[250px] relative">
                                        <div className="relative">
                                            <CommandInput placeholder={t("actionBar.language.searchTargetPlaceholder")} className="border-0 focus-visible:ring-0 px-0 pr-12" />
                                            <Button
                                                size="sm"
                                                variant={settings.translate ? "default" : "outline"}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs h-8 px-3"
                                                onClick={() => updateSetting("translate", !settings.translate)}
                                            >
                                                {settings.translate ? t("actionBar.common.on") : t("actionBar.common.off")}
                                            </Button>
                                        </div>
                                        <CommandList>
                                            <CommandEmpty>{t("actionBar.language.noLanguageFound")}</CommandEmpty>
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
                                </TabsContent>
                                <TabsList className="h-auto p-1 m-2 flex">
                                    <TabsTrigger value="source" className="flex-1 gap-1.5 text-xs py-2">
                                        <Globe size={14} />
                                        {t("actionBar.language.source")}
                                    </TabsTrigger>
                                    <TabsTrigger value="translate" className="flex-1 gap-1.5 text-xs py-2">
                                        <Languages size={14} />
                                        {t("actionBar.language.translate")}
                                        {settings.translate && (
                                            <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
                                        )}
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
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
                                className="dark:bg-transparent/50 dark:hover:bg-accent"
                            >
                                <Speech className="h-4 w-4" />
                                <span className="text-xs">{settings.enableDiarize ? (settings.maxSpeakers === null ? t("actionBar.common.auto") : settings.maxSpeakers) : t("actionBar.common.off")}</span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-0" side="top">
                            <div className="px-4 py-5">
                                {/* Speaker Count Slider */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-medium">{t("actionBar.speakers.countTitle")}</Label>
                                        <span className={`text-sm font-medium ${settings.enableDiarize ? "text-primary" : "text-red-500"}`}>
                                            {settings.enableDiarize ? (settings.maxSpeakers === null ? t("actionBar.common.auto") : settings.maxSpeakers) : t("actionBar.speakers.disabled")}
                                        </span>
                                    </div>
                                    <Slider
                                        value={[settings.enableDiarize ? (settings.maxSpeakers === null ? 0 : settings.maxSpeakers) : 0]}
                                        onValueChange={([value]: [number]) => settings.enableDiarize && updateSetting("maxSpeakers", value === 0 ? null : value)}
                                        max={10}
                                        min={0}
                                        step={1}
                                        className="w-full"
                                        disabled={!settings.enableDiarize}
                                    />
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>{t("actionBar.common.auto")}</span>
                                        <span>10</span>
                                    </div>
                                </div>
                            </div>
                            <div className="border-t bg-muted/30">
                                <div className="p-4 pt-2 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-sm font-medium">{t("actionBar.speakers.title")}</Label>
                                            <p className="text-xs text-muted-foreground">{t("actionBar.speakers.description")}</p>
                                        </div>
                                        <Switch
                                            checked={settings.enableDiarize}
                                            onCheckedChange={(checked: boolean) => updateSetting("enableDiarize", checked)}
                                        />
                                    </div>
                                </div>
                            </div>
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
                                className="dark:bg-transparent/50 dark:hover:bg-accent"
                            >
                                <Type className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0" align="end">
                            <div className="space-y-3 p-4">
                                {/* Remove Punctuation */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label className="text-sm font-medium">{t("actionBar.format.removePunctuationTitle")}</Label>
                                        <p className="text-xs text-muted-foreground">{t("actionBar.format.removePunctuationDescription")}</p>
                                    </div>
                                    <Switch
                                        checked={settings.removePunctuation}
                                        onCheckedChange={(checked: boolean) => updateSetting("removePunctuation", checked)}
                                    />
                                </div>

                                {/* Censor */}
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-medium">{t("actionBar.censor.title")}</Label>
                                        <p className="text-xs text-muted-foreground">
                                            {t("actionBar.censor.wordCount", { count: (settings.censoredWords || []).length })}
                                            {!settings.enableCensor ? ` · ${t("actionBar.common.off")}` : ""}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Dialog open={openCensorDialog} onOpenChange={setOpenCensorDialog}>
                                            <DialogTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                >
                                                    <Settings2 className="h-4 w-4" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[520px]">
                                                <DialogHeader>
                                                    <DialogTitle>{t("actionBar.censor.dialogTitle")}</DialogTitle>
                                                    <DialogDescription>
                                                        {t("actionBar.censor.dialogDescription")}
                                                    </DialogDescription>
                                                </DialogHeader>

                                                <div className="grid gap-4">
                                                    <form
                                                        className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2"
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
                                                            placeholder={t("actionBar.censor.inputPlaceholder")}
                                                            className="flex-1 h-10 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                                                        />
                                                        <Button
                                                            type="submit"
                                                            size="sm"
                                                            disabled={!newCensoredWord.trim() || (settings.censoredWords || []).includes(newCensoredWord.trim())}
                                                        >
                                                            {t("common.add")}
                                                        </Button>
                                                    </form>

                                                    <div className="space-y-2">
                                                        <ScrollArea className="max-h-[220px] rounded-lg border bg-muted/20 p-3">
                                                            {(settings.censoredWords || []).length === 0 ? (
                                                                <div className="text-sm text-muted-foreground text-center py-6">
                                                                    {t("actionBar.censor.empty")}
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-wrap gap-2">
                                                                    {(settings.censoredWords || []).map((word: string, index: number) => (
                                                                        <Badge
                                                                            key={index}
                                                                            variant="secondary"
                                                                            className="cursor-pointer select-none px-3 py-1.5 text-sm hover:bg-destructive hover:text-destructive-foreground"
                                                                            onClick={() => {
                                                                                const updatedWords = (settings.censoredWords || []).filter((_: string, i: number) => i !== index);
                                                                                updateSetting("censoredWords", updatedWords);
                                                                            }}
                                                                        >
                                                                            <span className="flex items-center gap-1.5">
                                                                                {word}
                                                                                <X className="opacity-50 w-4 h-4" />
                                                                            </span>
                                                                        </Badge>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </ScrollArea>
                                                    </div>
                                                </div>
                                                <DialogFooter>
                                                    <DialogClose asChild>
                                                        <Button variant="outline" onClick={() => setNewCensoredWord("")}>{t("common.done")}</Button>
                                                    </DialogClose>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                        <Switch
                                            checked={settings.enableCensor}
                                            onCheckedChange={(checked: boolean) => updateSetting("enableCensor", checked)}
                                        />
                                    </div>
                                </div>

                                {/* Text Case */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label className="text-sm font-medium">{t("actionBar.format.textCaseTitle")}</Label>
                                        <p className="text-xs text-muted-foreground">{t("actionBar.format.textCaseDescription")}</p>
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
                                                <SelectItem value="none">{t("actionBar.format.textCase.normal")}</SelectItem>
                                                <SelectItem value="lowercase">{t("actionBar.format.textCase.lowercase")}</SelectItem>
                                                <SelectItem value="uppercase">{t("actionBar.format.textCase.uppercase")}</SelectItem>
                                                <SelectItem value="titlecase">{t("actionBar.format.textCase.titleCase")}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* Character Limit */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label className="text-sm font-medium">{t("actionBar.format.characterLimitTitle")}</Label>
                                        <p className="text-xs text-muted-foreground">{t("actionBar.format.characterLimitDescription")}</p>
                                    </div>
                                    <Input
                                        type="number"
                                        min="0"
                                        value={settings.maxCharsPerLine}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSetting("maxCharsPerLine", Number(e.target.value))}
                                        className="w-20"
                                    />
                                </div>

                                {/* Line Count */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label className="text-sm font-medium">{t("actionBar.format.lineCountTitle")}</Label>
                                        <p className="text-xs text-muted-foreground">{t("actionBar.format.lineCountDescription")}</p>
                                    </div>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={settings.maxLinesPerSubtitle}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSetting("maxLinesPerSubtitle", Number(e.target.value))}
                                        className="w-20"
                                    />
                                </div>
                            </div>
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
                                className="w-full h-[120px] justify-center dark:bg-transparent/50 dark:hover:bg-accent"
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
                            {inputTracks.length > 0 ? (
                                <div className="px-4 py-2 bg-gradient-to-br from-red-50/80 to-orange-50/80 dark:from-red-950/50 dark:to-orange-950/50 border-b">
                                    <div className="flex items-center justify-between min-h-[28px]">
                                        <span className="text-sm text-muted-foreground">
                                            {settings.selectedInputTracks.length > 0
                                                ? (settings.selectedInputTracks.length === 1
                                                    ? t("actionBar.tracks.selectedLabel", {
                                                        label: inputTracks.find(track => track.value === settings.selectedInputTracks[0])?.label || t("actionBar.tracks.trackN", { n: settings.selectedInputTracks[0] })
                                                    })
                                                    : t("actionBar.tracks.countSelected", { count: settings.selectedInputTracks.length }))
                                                : t("actionBar.tracks.noneSelected")}
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
                                            {settings.selectedInputTracks.length === inputTracks.length ? t("actionBar.tracks.clearAll") : t("actionBar.tracks.selectAll")}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="px-4 py-3 bg-red-50/30 dark:bg-red-900/10 border-b">
                                    <p className="text-sm text-center text-muted-foreground">
                                        {t("actionBar.tracks.noneFound")}
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
                                                        onCheckedChange={(checked: boolean) => {
                                                            if (checked) {
                                                                updateSetting("selectedInputTracks", [...settings.selectedInputTracks, trackId]);
                                                            } else {
                                                                updateSetting("selectedInputTracks", settings.selectedInputTracks.filter((id: string) => id !== trackId));
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
                                        {t("actionBar.tracks.createTrack")}
                                    </p>
                                </div>
                            )}
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
                        className="w-full"
                    >
                        <X className="h-4 w-4" />
                        Cancel
                    </Button>
                ) : (
                    <Button
                        onClick={onStart}
                        size="default"
                        variant="default"
                        className="w-full"
                        disabled={isProcessing}
                    >
                        <PlayCircle className="h-4 w-4" />
                        Generate Subtitles
                    </Button>
                )}
            </div>
        </Card>
    )
}