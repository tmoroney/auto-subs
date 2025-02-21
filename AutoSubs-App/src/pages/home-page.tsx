import { useEffect, useState } from "react";
import { platform } from '@tauri-apps/plugin-os';
import { cn } from "@/lib/utils"
import {
    Bird,
    Rabbit,
    Turtle,
    Check,
    ChevronsUpDown,
    Languages,
    RefreshCw,
    CirclePlay,
    Rat,
    Share,
    Worm,
    Loader2,
    Speech,
    HelpCircle,
    Signature,
    CaseUpper,
    CaseLower,
    PencilOff,
    AudioLines,
    PencilLine,
    Type,
    Plus,
    Download,
    History,
    FileUp,
    Upload,
    SparklesIcon,
    Highlighter,
    ArrowUpFromLine,
    TypeOutline,
    PaintRoller,
    MessageCircle,
    Keyboard,
    ZoomIn,
    Blend,
    Text,
    WholeWord,
    Trash2,
    AArrowDown,
    AArrowUp,
    Spline,
    Sparkle,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
    DialogTrigger,
} from "@/components/ui/dialog"

import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { SubtitleList } from "@/components/simple-subtitle-list"
import { fetch } from '@tauri-apps/plugin-http';
import { useGlobal } from '@/contexts/GlobalContext';
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Description } from "@radix-ui/react-dialog";

const validateAPI = "http://localhost:56001/validate/";

const languages = [
    { label: "Detect Language Automatically", value: "auto" },
    { label: "English", value: "en" },
    { label: "Chinese", value: "zh" },
    { label: "German", value: "de" },
    { label: "Spanish", value: "es" },
    { label: "Russian", value: "ru" },
    { label: "Korean", value: "ko" },
    { label: "French", value: "fr" },
    { label: "Japanese", value: "ja" },
    { label: "Portuguese", value: "pt" },
    { label: "Turkish", value: "tr" },
    { label: "Polish", value: "pl" },
    { label: "Catalan", value: "ca" },
    { label: "Dutch", value: "nl" },
    { label: "Arabic", value: "ar" },
    { label: "Swedish", value: "sv" },
    { label: "Italian", value: "it" },
    { label: "Indonesian", value: "id" },
    { label: "Hindi", value: "hi" },
    { label: "Finnish", value: "fi" },
    { label: "Vietnamese", value: "vi" },
    { label: "Hebrew", value: "he" },
    { label: "Ukrainian", value: "uk" },
    { label: "Greek", value: "el" },
    { label: "Malay", value: "ms" },
    { label: "Czech", value: "cs" },
    { label: "Romanian", value: "ro" },
    { label: "Danish", value: "da" },
    { label: "Hungarian", value: "hu" },
    { label: "Tamil", value: "ta" },
    { label: "Norwegian", value: "no" },
    { label: "Thai", value: "th" },
    { label: "Urdu", value: "ur" },
    { label: "Croatian", value: "hr" },
    { label: "Bulgarian", value: "bg" },
    { label: "Lithuanian", value: "lt" },
    { label: "Latin", value: "la" },
    { label: "Maori", value: "mi" },
    { label: "Malayalam", value: "ml" },
    { label: "Welsh", value: "cy" },
    { label: "Slovak", value: "sk" },
    { label: "Telugu", value: "te" },
    { label: "Persian", value: "fa" },
    { label: "Latvian", value: "lv" },
    { label: "Bengali", value: "bn" },
    { label: "Serbian", value: "sr" },
    { label: "Azerbaijani", value: "az" },
    { label: "Slovenian", value: "sl" },
    { label: "Kannada", value: "kn" },
    { label: "Estonian", value: "et" },
    { label: "Macedonian", value: "mk" },
    { label: "Breton", value: "br" },
    { label: "Basque", value: "eu" },
    { label: "Icelandic", value: "is" },
    { label: "Armenian", value: "hy" },
    { label: "Nepali", value: "ne" },
    { label: "Mongolian", value: "mn" },
    { label: "Bosnian", value: "bs" },
    { label: "Kazakh", value: "kk" },
    { label: "Albanian", value: "sq" },
    { label: "Swahili", value: "sw" },
    { label: "Galician", value: "gl" },
    { label: "Marathi", value: "mr" },
    { label: "Punjabi", value: "pa" },
    { label: "Sinhala", value: "si" },
    { label: "Khmer", value: "km" },
    { label: "Shona", value: "sn" },
    { label: "Yoruba", value: "yo" },
    { label: "Somali", value: "so" },
    { label: "Afrikaans", value: "af" },
    { label: "Occitan", value: "oc" },
    { label: "Georgian", value: "ka" },
    { label: "Belarusian", value: "be" },
    { label: "Tajik", value: "tg" },
    { label: "Sindhi", value: "sd" },
    { label: "Gujarati", value: "gu" },
    { label: "Amharic", value: "am" },
    { label: "Yiddish", value: "yi" },
    { label: "Lao", value: "lo" },
    { label: "Uzbek", value: "uz" },
    { label: "Faroese", value: "fo" },
    { label: "Haitian Creole", value: "ht" },
    { label: "Pashto", value: "ps" },
    { label: "Turkmen", value: "tk" },
    { label: "Nynorsk", value: "nn" },
    { label: "Maltese", value: "mt" },
    { label: "Sanskrit", value: "sa" },
    { label: "Luxembourgish", value: "lb" },
    { label: "Myanmar", value: "my" },
    { label: "Tibetan", value: "bo" },
    { label: "Tagalog", value: "tl" },
    { label: "Malagasy", value: "mg" },
    { label: "Assamese", value: "as" },
    { label: "Tatar", value: "tt" },
    { label: "Hawaiian", value: "haw" },
    { label: "Lingala", value: "ln" },
    { label: "Hausa", value: "ha" },
    { label: "Bashkir", value: "ba" },
    { label: "Javanese", value: "jw" },
    { label: "Sundanese", value: "su" },
    { label: "Cantonese", value: "yue" },
] as const;

const models = [
    { value: "tiny", label: "Tiny", description: "Ultra-fast", size: "75MB", ram: "1GB", icon: Worm },
    { value: "base", label: "Base", description: "Fast & light", size: "140MB", ram: "1GB", icon: Rat },
    { value: "small", label: "Small", description: "Balanced", size: "480MB", ram: "2GB", icon: Rabbit },
    { value: "medium", label: "Medium", description: "High accuracy", size: "1.5GB", ram: "5GB", icon: Bird },
    { value: "large", label: "Large", description: "Max accuracy", size: "1.6GB", ram: "10GB", icon: Turtle },
] as const;

export function HomePage() {
    const {
        settings,
        timelineInfo,
        subtitles,
        progress,
        audioPath,
        setProgress,
        updateSetting,
        enableStep,
        setError,
        runSteps,
        exportSubtitles,
        importSubtitles,
        refresh,
        resetSettings,
    } = useGlobal();

    const [openLanguages, setOpenLanguages] = useState(false);
    const [openTemplates, setOpenTemplates] = useState(false);
    const [openInputTracks, setOpenInputTracks] = useState(false);
    const [openOutputTracks, setOpenOutputTracks] = useState(false);
    const [openTokenMenu, setOpenTokenMenu] = useState(false);
    const [tooltipOpen, setTooltipOpen] = useState(false)
    const [hfToken, setHfToken] = useState("");
    const [hfMessage, setHfMessage] = useState("");
    const [isDiarizeAvailable, setIsDiarizeAvailable] = useState(false);
    const [isAddStepOpen, setIsAddStepOpen] = useState(false);

    /*
    const [diarizeFormImg, setDiarizeFormImg] = useState<string>("");
    useEffect(() => {
        const fetchImagePath = async () => {
            try {
                const path = await resolveResource("Diarization-Form.png");
                const assetUrl = convertFileSrc(path);
                setDiarizeFormImg(assetUrl);
                console.log("Diarization form image path: ", assetUrl);
            } catch (error) {
                console.error("Error resolving resource path:", error);
            }
        };

        fetchImagePath();
    }, []);
    */

    async function checkDiarizeAvailable(checked: boolean) {
        if (progress.isLoading) return;
        enableStep('diarize', checked);
        if (checked == true && isDiarizeAvailable == false) {
            // check with server if model is available and HF token is correct
            try {
                const response = await fetch(validateAPI, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        token: hfToken,
                    }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                let message = data.message;
                let isAvailable = data.isAvailable || false;
                console.log(data);

                if (isAvailable) {
                    setOpenTokenMenu(false);
                    setIsDiarizeAvailable(true);
                    toast((settings.enabledSteps.diarize ? "Disabled" : "Enabled") + " Speaker Diarization", {
                        description: settings.enabledSteps.diarize ? "Removed from processing steps." : "Added to processing steps.",
                    })
                } else {
                    enableStep('diarize', false);
                    console.log(message);
                    // open menu with instructions
                    setHfMessage(message);
                    setOpenTokenMenu(true);

                }
            } catch (error) {
                enableStep('diarize', false);
                setError({
                    title: "Error",
                    desc: String(error),
                });
            }
        }
    }

    function getStatusColor(step: number) {
        return progress.currentStep === step ? "bg-yellow-500" : progress.currentStep < step ? "bg-sky-500" : "bg-green-500";
    }

    return (

        <main className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2 lg:grid-cols-2">
            <div className="relative flex-col items-start gap-8 md:flex">
                <div className="grid w-full items-start gap-4">
                    <Card className="overflow-hidden">
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center justify-between">
                                <span>Workflow Options</span>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Button variant="ghost" className="m-0" onClick={() => resetSettings()}>
                                                <History className="w-5 h-5 p-0" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            Reset settings to default values
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </CardTitle>
                            <CardDescription>Generate subtitles on the current timeline.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="grid grid-cols-3 gap-4 mb-2">
                                <AnimationOptions />
                                <FormatOptions />
                                <HighlightOptions />
                            </div>
                            <div className="grid gap-5 mb-2">
                                <div className="grid gap-2.5">
                                    <Label htmlFor="template">Subtitle Template</Label>
                                    <Popover open={openTemplates} onOpenChange={setOpenTemplates}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={openTemplates}
                                                className="justify-between font-normal"
                                                onClick={async () => await refresh()}
                                            >
                                                {settings.template && timelineInfo.templates.length > 0
                                                    ? timelineInfo.templates.find((template) => template.value === settings.template)?.label
                                                    : "Select Template..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="p-0">
                                            <Command>
                                                <CommandInput placeholder="Search MediaPool for Text+" />
                                                <CommandList>
                                                    <CommandEmpty>No Text+ in the Media Pool.</CommandEmpty>
                                                    <CommandGroup>
                                                        {timelineInfo.templates.map((template) => (
                                                            <CommandItem
                                                                key={template.value}
                                                                value={template.value}
                                                                onSelect={(currentValue) => {
                                                                    updateSetting('template', currentValue)
                                                                    setOpenTemplates(false)
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        settings.template === template.value ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
                                                                {template.label}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div className="grid gap-2.5">
                                    <Label htmlFor="track">Track to Place Subtitles</Label>
                                    <Popover open={openOutputTracks} onOpenChange={setOpenOutputTracks}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className="justify-between font-normal"
                                                onClick={async () => await refresh()}
                                            >
                                                {settings.outputTrack && timelineInfo.outputTracks.length > 0
                                                    ? timelineInfo.outputTracks.find((track) => track.value === settings.outputTrack)?.label
                                                    : "Select Video Track..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="p-0">
                                            <Command>
                                                <CommandInput placeholder="Select track to place subtitles" />
                                                <CommandList>
                                                    <CommandEmpty>No tracks found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {timelineInfo.outputTracks.map((track) => (
                                                            <CommandItem
                                                                key={track.value}
                                                                value={track.value}
                                                                onSelect={(currentValue) => {
                                                                    updateSetting('outputTrack', currentValue)
                                                                    setOpenOutputTracks(false)
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        settings.outputTrack === track.value ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
                                                                {track.label}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>


                            {progress.isLoading ? (
                                <Button disabled
                                    type="button"
                                    size="default"
                                    className="gap-2 text-sm w-full"
                                >
                                    <Loader2 className="size-4 animate-spin cursor-progress" />
                                    {progress.message}
                                </Button>
                            ) : (
                                audioPath.length > 0 && !settings.enabledSteps.customSrt ? (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                type="button"
                                                size="default"
                                                className="gap-2 text-sm w-full"
                                            >
                                                <CirclePlay className="size-4" />
                                                Start Process
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-full">
                                            <DropdownMenuItem onClick={async () => await runSteps(false)}>
                                                <Download className="mr-2 h-4 w-4" />
                                                <span>Export Latest Audio</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={async () => await runSteps(true)}>
                                                <History className="mr-2 h-4 w-4" />
                                                <span>Use Audio from Previous Job</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                ) : (
                                    <Button
                                        type="button"
                                        size="default"
                                        className="gap-2 text-sm w-full"
                                        onClick={async () => await runSteps(false)}
                                    >
                                        <CirclePlay className="size-4" />
                                        Start Process
                                    </Button>
                                )
                            )}
                            {/* <Progress value={20} /> */}
                        </CardContent>
                        <CardFooter className="p-0">
                            <Progress value={progress.value} className="rounded-b-md rounded-t-none h-3" />
                        </CardFooter>
                    </Card>
                    <Dialog open={isAddStepOpen} onOpenChange={setIsAddStepOpen}>
                        <DialogTrigger asChild>
                            <Button
                                variant="outline"
                                size="lg"
                                className="w-full border-2 border-dashed hover:border-solid hover:bg-accent"
                            >
                                <Plus className="mr-2 h-5 w-5" />
                                Add Processing Step
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>Add Processing Step</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                {[
                                    {
                                        key: "1",
                                        enabled: settings.enabledSteps.diarize,
                                        onClick: () => checkDiarizeAvailable(!settings.enabledSteps.diarize),
                                        icon: <Speech className="h-6 w-6 text-primary" />,
                                        title: "Diarize Speakers",
                                        description: "Label different speakers with AI"
                                    },
                                    // {
                                    //     key: "2",
                                    //     enabled: settings.enabledSteps.textFormat,
                                    //     onClick: () => {
                                    //         const newStatus = !settings.enabledSteps.textFormat;
                                    //         setEnabledSteps({ ...settings.enabledSteps, textFormat: newStatus });
                                    //         toast((newStatus ? "Enabled" : "Disabled") + " Text Formatting", {
                                    //             description: newStatus ? "Removed from processing steps." : "Added to processing steps.",
                                    //         });
                                    //     },
                                    //     icon: <Type className="h-6 w-6 text-primary" />,
                                    //     title: "Text Formatting",
                                    //     description: "Customise format of subtitle text"
                                    // },
                                    // platform() === 'windows' ? {
                                    //     key: "3",
                                    //     enabled: settings.enabledSteps.advancedOptions,
                                    //     onClick: () => {
                                    //         const newStatus = !settings.enabledSteps.advancedOptions;
                                    //         setEnabledSteps({ ...settings.enabledSteps, advancedOptions: newStatus });
                                    //         toast((newStatus ? "Disabled" : "Enabled") + " Advanced Options", {
                                    //             description: newStatus ? "Removed from processing steps." : "Added to processing steps.",
                                    //         });
                                    //     },
                                    //     icon: <Shield className="h-6 w-6 text-primary" />,
                                    //     title: "Advanced Options",
                                    //     description: "Fine-tune with additional options"
                                    // } : null,
                                    {
                                        key: "4",
                                        enabled: settings.enabledSteps.customSrt,
                                        onClick: () => {
                                            const newStatus = !settings.enabledSteps.customSrt;
                                            updateSetting('enabledSteps',
                                                { ...settings.enabledSteps, customSrt: newStatus, exportAudio: !newStatus, transcribe: !newStatus, diarize: newStatus ? false : settings.enabledSteps.diarize })
                                            toast(`${newStatus ? "Enabled" : "Disabled"} Custom SRT`, {
                                                description: newStatus ? "Added to processing steps." : "Removed from processing steps.",
                                            });
                                        },
                                        icon: <FileUp className="h-6 w-6 text-primary" />,
                                        title: "Custom SRT",
                                        description: "Import your own subtitles file"
                                    }
                                ].filter((item) => item !== null).map(({ key, enabled, onClick, icon, title, description }) => (
                                    <Card
                                        key={key}
                                        className={`cursor-pointer transition-colors hover:bg-accent ${enabled && 'border-primary bg-primary/10 hover:bg-primary/10'}`}
                                        onClick={onClick}
                                        style={{ userSelect: 'none' }}
                                    >
                                        <CardContent className="flex items-center p-6">
                                            <div className="p-3 bg-primary/10 rounded-full mr-4 hover:animate-spin">
                                                {icon}
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg">{title}</CardTitle>
                                                <CardDescription>{description}</CardDescription>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </DialogContent>
                    </Dialog>
                    {settings.enabledSteps.exportAudio && (
                        <Card>
                            <CardContent className="p-5 grid gap-1 pb-4">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-2 bg-primary/10 rounded-full">
                                            <AudioLines className="h-6 w-6 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">Audio Source</h3>
                                            <p className="text-sm text-muted-foreground">Select input track and language</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid gap-4">
                                    <div className="grid gap-2.5">
                                        <Label htmlFor="inputTrack">Input Track (Audio)</Label>
                                        <Popover open={openInputTracks} onOpenChange={setOpenInputTracks}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    className="justify-between font-normal"
                                                    onClick={async () => await refresh()}
                                                >
                                                    {settings.inputTrack && timelineInfo.inputTracks.length > 0
                                                        ? timelineInfo.inputTracks.find((track) => track.value === settings.inputTrack)?.label
                                                        : "Select Audio Track..."}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="p-0">
                                                <Command>
                                                    <CommandInput placeholder="Select track to place subtitles" />
                                                    <CommandList>
                                                        <CommandEmpty>No tracks found.</CommandEmpty>
                                                        <CommandGroup>
                                                            {timelineInfo.inputTracks.map((track) => (
                                                                <CommandItem
                                                                    key={track.value}
                                                                    value={track.value}
                                                                    onSelect={(currentValue) => {
                                                                        updateSetting('inputTrack', currentValue)
                                                                        setOpenInputTracks(false)
                                                                    }}
                                                                >
                                                                    <Check
                                                                        className={cn(
                                                                            "mr-2 h-4 w-4",
                                                                            settings.inputTrack === track.value ? "opacity-100" : "opacity-0"
                                                                        )}
                                                                    />
                                                                    {track.label}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    <div className="grid gap-2.5">
                                        <Label htmlFor="sensitiveWords">Language Spoken</Label>
                                        <Popover open={openLanguages} onOpenChange={setOpenLanguages}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    aria-expanded={openLanguages}
                                                    className="justify-between font-normal"
                                                >
                                                    {settings.language
                                                        ? languages.find((language) => language.value === settings.language)?.label
                                                        : "Select Audio Language..."}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="p-0">
                                                <Command>
                                                    <CommandInput placeholder="Search languages..." />
                                                    <CommandList className="max-h-[220px]">
                                                        <CommandEmpty>No language found.</CommandEmpty>
                                                        <CommandGroup>
                                                            {languages
                                                                .slice() // Create a shallow copy of the languages array
                                                                .sort((a, b) => {
                                                                    // Keep the first language at the top and sort the rest alphabetically
                                                                    if (a === languages[0]) return -1;
                                                                    if (b === languages[0]) return 1;
                                                                    return a.label.localeCompare(b.label);
                                                                })
                                                                .map((language) => (
                                                                    <CommandItem
                                                                        value={language.label}
                                                                        key={language.value}
                                                                        onSelect={() => {
                                                                            updateSetting('language', language.value);
                                                                            setOpenLanguages(false);
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
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="pb-5 flex justify-between pr-5">
                                {(() => {
                                    let step = 1;
                                    return (
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${getStatusColor(step)}`} />
                                            <span className="text-sm text-muted-foreground">
                                                {progress.currentStep === step ? "Exporting Audio..." : progress.currentStep < step ? "Pending" : "Complete"}
                                            </span>
                                        </div>
                                    );
                                })()}
                            </CardFooter>
                        </Card>
                    )}
                    {settings.enabledSteps.transcribe && (
                        <Card>
                            <CardContent className="p-5 grid gap-0.5 pb-3.5">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-2.5 bg-primary/10 rounded-full">
                                            <PencilLine className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">Transcribe</h3>
                                            <p className="text-sm text-muted-foreground">Select an AI transcription model</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid gap-4">
                                    <Select value={settings.model} onValueChange={(value) => updateSetting('model', value)}>
                                        <SelectTrigger
                                            id="model"
                                            className="[&_[data-description]]:hidden"
                                        >
                                            <SelectValue placeholder="Select a model..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {models.map((m) => (
                                                <SelectItem key={m.value} value={m.value}>
                                                    <div className="flex items-center gap-3 text-muted-foreground">
                                                        <m.icon className="size-5 flex-shrink-0 text-foreground" />
                                                        <div className="grid gap-0.5 text-left">
                                                            <p className="font-medium text-foreground">
                                                                {m.label} <span className="text-muted-foreground">({m.description})</span>
                                                            </p>
                                                            <p className="text-xs" data-description>
                                                                Size: {m.size}, RAM: {m.ram}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2.5">
                                            <Label htmlFor="maxWords">Words per line</Label>
                                            <Input value={settings.maxWords} id="maxWords" type="number" placeholder="6" onChange={(e) => updateSetting('maxWords', Math.abs(Number.parseInt(e.target.value)))} />
                                        </div>
                                        <div className="grid gap-2.5">
                                            <Label htmlFor="maxChars">Characters per line</Label>
                                            <Input value={settings.maxChars} id="maxChars" type="number" placeholder="30" onChange={(e) => updateSetting('maxChars', Math.abs(Number.parseInt(e.target.value)))} />
                                        </div>
                                    </div>
                                    <div className=" flex items-center space-x-4 rounded-md border p-4">
                                        <Languages className="w-5" />
                                        <div className="flex-1 space-y-1">
                                            <p className="text-sm font-medium leading-none">
                                                Translate to English
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                Supports any language
                                            </p>
                                        </div>
                                        <Switch checked={settings.translate} onCheckedChange={(checked) => updateSetting('translate', checked)} />
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="pb-5">
                                {(() => {
                                    let step = 2;
                                    return (
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${getStatusColor(step)}`} />
                                            <span className="text-sm text-muted-foreground">
                                                {progress.currentStep === step ? "Transcribing Audio..." : progress.currentStep < step ? "Pending" : "Complete"}
                                            </span>
                                        </div>
                                    );
                                })()}
                            </CardFooter>
                        </Card>
                    )}
                    {/* {settings.enabledSteps.advancedOptions && (
                        <Card>
                            <CardContent className="p-5 grid gap-0.5 pb-3.5">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-2.5 bg-primary/10 rounded-full">
                                            <Shield className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">Advanced Settings</h3>
                                            <p className="text-sm text-muted-foreground">Fine-tune additional options</p>

                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-4 rounded-md border p-4">
                                    <Pickaxe className="w-5" />
                                    <div className="flex-1 space-y-1">
                                        <p className="text-sm font-medium leading-none">
                                            Force Align Words
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Improve word level timing
                                        </p>
                                    </div>
                                    <Switch checked={settings.alignWords} onCheckedChange={(checked) => setAlignWords(checked)} />
                                </div>
                            </CardContent>
                            <CardFooter className="pb-5 flex justify-between pr-5">
                                {(() => {
                                    let step = 3;
                                    return (
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${getStatusColor(step)}`} />
                                            <span className="text-sm text-muted-foreground">
                                                {progress.currentStep === step ? "Finetuning subtitles..." : progress.currentStep < step ? "Pending" : "Complete"}
                                            </span>
                                        </div>
                                    );
                                })()}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-xs border border-red-500 text-red-500 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900"
                                    onClick={() => setEnabledSteps({ ...enabledSteps, advancedOptions: false })}
                                >
                                    Disable
                                </Button>
                            </CardFooter>
                        </Card>
                    )} */}
                    {settings.enabledSteps.customSrt && (
                        <Card>
                            <CardContent className="p-5 grid gap-0.5 pb-3.5">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-2.5 bg-primary/10 rounded-full">
                                            <FileUp className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">Custom SRT</h3>
                                            <p className="text-sm text-muted-foreground">Import your own subtitles file</p>
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    size="default"
                                    onClick={() => importSubtitles()}>
                                    <Upload className="mr-2 h-4 w-4" />
                                    Import Subtitles
                                </Button>
                            </CardContent>
                            <CardFooter className="pb-5 flex justify-between pr-5">
                                {(() => {
                                    let step = 4;
                                    return (
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${getStatusColor(step)}`} />
                                            <span className="text-sm text-muted-foreground">
                                                {progress.currentStep === step ? "Finetuning subtitles..." : progress.currentStep < step ? "Pending" : "Complete"}
                                            </span>
                                        </div>
                                    );
                                })()}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-xs border border-red-500 text-red-500 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-950"
                                    onClick={() => updateSetting('enabledSteps', { ...settings.enabledSteps, customSrt: false, exportAudio: true, transcribe: true })}
                                >

                                    Disable
                                </Button>
                            </CardFooter>
                        </Card>
                    )}
                    {/* {settings.enabledSteps.textFormat && (
                        <Card>
                            <CardContent className="p-5 grid gap-0.5 pb-3.5">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-2.5 bg-primary/10 rounded-full">
                                            <Type className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">Text Formatting</h3>
                                            <p className="text-sm text-muted-foreground">Customise format of subtitle text</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid gap-4">
                                    <div className="grid gap-2.5">
                                        <Label htmlFor="sensitiveWords">Censored Words</Label>
                                        <Input value={settings.sensitiveWords} id="sensitiveWords" type="string" placeholder="bomb, gun, kill" onChange={(e) => updateSetting('sensitiveWords', e.target.value)} />
                                    </div>
                                    <ToggleGroup
                                        type="single"
                                        value={settings.textFormat}
                                        onValueChange={(value: string) => value && updateSetting('textFormat', value)}
                                        className="grid grid-cols-3 gap-3 h-20"
                                    >
                                        <ToggleGroupItem
                                            value="normal"
                                            className={`h-full flex flex-col items-center justify-center border-2 bg-transparent hover:text-accent-foreground data-[state=on]:border-primary data-[state=on]:bg-card`}
                                        >
                                            <PencilOff />
                                            <span className="text-xs">None</span>
                                        </ToggleGroupItem>
                                        <ToggleGroupItem
                                            value="lowercase"
                                            className={`h-full flex flex-col items-center justify-center border-2 bg-transparent hover:text-accent-foreground data-[state=on]:border-primary data-[state=on]:bg-card`}
                                        >
                                            <CaseLower />
                                            <span className="text-xs">Lower</span>
                                        </ToggleGroupItem>
                                        <ToggleGroupItem
                                            value="uppercase"
                                            className={`h-full flex flex-col items-center justify-center border-2 bg-transparent hover:text-accent-foreground data-[state=on]:border-primary data-[state=on]:bg-card`}
                                        >
                                            <CaseUpper />
                                            <span className="text-xs">Upper</span>
                                        </ToggleGroupItem>
                                    </ToggleGroup>
                                    <div className="flex items-center space-x-4 rounded-md border p-4">
                                        <Signature className="w-5" />
                                        <div className="flex-1 space-y-1">
                                            <p className="text-sm font-medium leading-none">
                                                Remove Punctuation
                                            </p>
                                        </div>
                                        <Switch checked={settings.removePunctuation} onCheckedChange={(checked) => updateSetting('removePunctuation', checked)} />
                                    </div>

                                </div>
                            </CardContent>
                            <CardFooter className="pb-5 flex justify-between pr-5">
                                {(() => {
                                    let step = 5;
                                    return (
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${getStatusColor(step)}`} />
                                            <span className="text-sm text-muted-foreground">
                                                {progress.currentStep === step ? "Formatting Text..." : progress.currentStep < step ? "Pending" : "Complete"}
                                            </span>
                                        </div>
                                    );
                                })()}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-xs border border-red-500 text-red-500 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-950"
                                    onClick={() => enableStep('textFormat', false)}
                                >

                                    Disable
                                </Button>
                            </CardFooter>
                        </Card>
                    )} */}
                    {settings.enabledSteps.diarize && (
                        <Card>
                            <CardContent className="p-5 grid gap-5 pb-4">
                                <div className="flex items-start justify-between mb-0">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-2.5 bg-primary/10 rounded-full">
                                            <Speech className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">Diarize Speakers</h3>
                                            <p className="text-sm text-muted-foreground">Label different speakers with AI</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-2.5">
                                    <Label htmlFor="numSpeakers">Speaker Detection Mode</Label>
                                    <Select value={settings.diarizeMode} onValueChange={(value) => updateSetting('diarizeMode', value)}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Choose detection mode" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="auto">Auto detect speakers</SelectItem>
                                            <SelectItem value="specific">Specify number of speakers</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {settings.diarizeMode !== "auto" && (
                                    <div className="grid gap-3">
                                        <Label htmlFor="speakerCount">Number of Speakers</Label>
                                        <Input value={settings.diarizeSpeakerCount} id="speakerCount" type="number" placeholder="Enter number of speakers" onChange={(e) => updateSetting('diarizeSpeakerCount', Math.abs(Number.parseInt(e.target.value)))} />
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="pb-5 flex justify-between pr-5">
                                {(() => {
                                    let step = 6;
                                    return (
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${getStatusColor(step)}`} />
                                            <span className="text-sm text-muted-foreground">
                                                {progress.currentStep === step ? "Diarizing Speakers..." : progress.currentStep < step ? "Pending" : "Complete"}
                                            </span>
                                        </div>
                                    );
                                })()}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-xs border border-red-500 text-red-500 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-950"
                                    onClick={() => enableStep('diarize', false)}
                                >
                                    Disable
                                </Button>
                            </CardFooter>
                        </Card>
                    )}
                </div>
            </div>
            <div className="sticky top-0 hidden md:flex h-[calc(100vh-5.5rem)] flex-col rounded-xl bg-muted/50 p-4 lg:col-span-1">
                <div className="flex flex-row w-full gap-2 pb-4">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-sm w-1/2"
                        onClick={async () => await refresh()}
                    >
                        <RefreshCw className="size-3.5" />
                        Refresh
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-sm w-1/2"
                        onClick={async () => await exportSubtitles()}
                    >
                        <Share className="size-3.5" />
                        Export
                    </Button>
                </div>
                <div className="overflow-y-auto flex-1">
                    {subtitles.length > 0 ? (
                        <>
                            <SubtitleList subtitles={subtitles} />
                        </>
                    ) : (
                        <>
                            <Label className="flex justify-center items-center text-center opacity-70 py-2">No subtitles found for this timeline</Label>
                            <div className="space-y-2 pt-4 px-2">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-[80%]" />
                                <Skeleton className="h-4 w-[60%]" />
                                <Skeleton className="h-4 w-[50%]" />
                            </div>
                        </>
                    )}
                </div>
            </div>





            <Dialog open={openTokenMenu} onOpenChange={setOpenTokenMenu}>
                <DialogContent className="sm:max-w-[540px]">
                    <DialogHeader className="space-y-2">
                        <DialogTitle className="text-2xl">Diarization Setup</DialogTitle>
                        <DialogDescription className="flex flex-col items-start">
                            <span>Follow these steps to enable speaker diarization for free.</span>
                            <TooltipProvider>
                                <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
                                    <TooltipTrigger asChild>
                                        <span className="mt-1 p-0 h-auto font-normal cursor-pointer text-primary hover:underline" onClick={() => setTooltipOpen(!tooltipOpen)}>
                                            Why do I need to do this?
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" align="center" className="max-w-[300px]">
                                        <p>
                                            This is a one-time setup process to allow the AI model to be downloaded.<br /><br /> <b>Pyannote</b> provides their Diarization model for free but asks for basic details to support their research and secure funding for improvements and other projects.
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh] pb-2 pt-1">
                        <div className="space-y-6">
                            <section className="space-y-2">
                                <h2 className="text-lg font-semibold flex items-center">
                                    <span className="inline-flex items-center justify-center w-6 h-6 mr-2 text-sm font-bold text-white bg-primary rounded-full">
                                        1
                                    </span>
                                    Create Hugging Face account
                                </h2>
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">
                                        Sign up at{' '}
                                        <a href="https://huggingface.co/join?next=%2Fpyannote%2Fspeaker-diarization-3.1" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                            Hugging Face{' '}
                                        </a>
                                        if you don’t already have an account.
                                    </p>
                                </div>
                            </section>
                            <section className="space-y-2">
                                <h2 className="text-lg font-semibold flex items-center">
                                    <span className="inline-flex items-center justify-center w-6 h-6 mr-2 text-sm font-bold text-white bg-primary rounded-full">
                                        2
                                    </span>
                                    Agree to Model Terms
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="h-4 w-8 ml-2 hover:bg-transparent hover:cursor-pointer">
                                                    <HelpCircle className="h-4 w-4" />
                                                    <span className="sr-only">See example of model terms form</span>
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom" align="center" className="max-w-[600px] px-2">
                                                <img
                                                    src="https://raw.githubusercontent.com/tmoroney/auto-subs/refs/heads/AutoSubsV2-Dev/Diarization-Form.png"
                                                    alt="Example of model terms form"
                                                    className="w-full h-auto rounded-md mt-1"
                                                />
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </h2>
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">
                                        Agree to the terms for these models (top of page):
                                    </p>
                                    <div className="flex space-x-2">
                                        <a href="https://hf.co/pyannote/segmentation-3.0" target="_blank" rel="noopener noreferrer">
                                            <Button variant="outline" size="sm" className="w-full">
                                                Segmentation 3.0
                                            </Button>
                                        </a>
                                        <a href="https://huggingface.co/pyannote/speaker-diarization-3.1" target="_blank" rel="noopener noreferrer">
                                            <Button variant="outline" size="sm" className="w-full">
                                                Speaker Diarization 3.1
                                            </Button>
                                        </a>
                                    </div>
                                </div>
                            </section>
                            <section className="space-y-2">
                                <h2 className="text-lg font-semibold flex items-center">
                                    <span className="inline-flex items-center justify-center w-6 h-6 mr-2 text-sm font-bold text-white bg-primary rounded-full">
                                        3
                                    </span>
                                    Create Access Token
                                </h2>
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">
                                        Generate a{' '}
                                        <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                            Hugging Face token
                                        </a>{' '}
                                        with <b>read</b> permissions and enter it below:
                                    </p>
                                    <div className="grid gap-1.5">
                                        <Input
                                            id="hf_token"
                                            type="password"
                                            placeholder="Enter your Hugging Face access token"
                                            value={hfToken}
                                            onChange={(e) => setHfToken(e.target.value)}
                                        />
                                    </div>
                                    {hfMessage && <p className="text-sm text-red-500">{hfMessage}</p>}
                                </div>
                            </section>
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button
                                variant="outline"
                                type="button"
                                size="sm"
                                className="gap-1.5 text-sm"
                                onClick={() => setOpenTokenMenu(false)}
                            >
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            variant="default"
                            type="button"
                            size="sm"
                            className="gap-1.5 text-sm"
                            onClick={async () => {
                                setProgress({ ...progress, isLoading: true });
                                await checkDiarizeAvailable(true);
                                setProgress({ ...progress, isLoading: false });
                            }}
                        >
                            {progress.isLoading ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" />
                                    Checking...
                                </>
                            ) : (
                                "Save Changes"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </main >
    )
}

const renderToggleGroup = (
    items: typeof animationTypes | typeof highlightTypes | typeof formatTypes,
    value: string,
    onValueChange: (value: string) => void,
) => (
    <ToggleGroup
        type="single"
        value={value}
        onValueChange={(newValue) => {
            onValueChange(newValue || "none");
        }}
        className="flex flex-wrap gap-2.5"
    >
        {items.map((m) => (
            <ToggleGroupItem
                key={m.value}
                value={m.value}
                className="flex items-center justify-center flex-grow basis-[calc(50%-0.5rem)] sm:basis-[calc(33.333%-0.5rem)] md:basis-auto p-6 h-12 hover:text-accent-foreground rounded-md border-2 border-accent data-[state=on]:border-primary"
                aria-label={m.label}
            >
                <m.icon className="size-5 flex-shrink-0 text-foreground" />
                <span className="text-sm">{m.label}</span>
            </ToggleGroupItem>
        ))}
    </ToggleGroup>
);

const renderSelect = (
    items: typeof formatTypes | typeof highlightTypes,
    value: string,
    onValueChange: (value: string) => void,
) => (
    <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full h-12 [&_[data-description]]:hidden">
            <SelectValue placeholder="Select format" />
        </SelectTrigger>
        <SelectContent>
            {items.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                    <div className="flex items-center gap-4 text-muted-foreground">
                        <m.icon className="size-5 flex-shrink-0 text-foreground ml-1" />
                        <div className="grid gap-0.5 text-left">
                            <p className="font-medium text-foreground">
                                {m.label}
                            </p>
                            <p className="text-xs" data-description>
                                {m.description}
                            </p>
                        </div>
                    </div>
                </SelectItem>
            ))}
        </SelectContent>
    </Select>
);

const animationTypes = [
    { value: "none", label: "None", description: "No Animation", icon: PencilOff },
    { value: "pop-in", label: "Pop In", description: "Subtitle will bounce in", icon: ZoomIn },
    { value: "fade-in", label: "Fade In", description: "Subtitle will fade in gradually", icon: Blend },
    { value: "slide-in", label: "Slide Up", icon: ArrowUpFromLine, description: "Subtitle will slide in from the bottom" },
    { value: "typewriter", label: "Typewriter", icon: Keyboard, description: "Subtitle will appear as if being typed" },
] as const

type AnimationType = (typeof animationTypes)[number]["value"]

function AnimationOptions() {
    const { settings, updateSetting } = useGlobal();
    const [animationType, setAnimationType] = useState<AnimationType>(settings.animationType);
    const [wordLevel, setWordLevel] = useState(false);

    useEffect(() => {
        updateSetting('animationType', animationType);
        updateSetting('wordLevel', wordLevel);
    }, [animationType, wordLevel]);

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="secondary" size="lg">
                    <Sparkle className="size-5 text-red-500" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()} >
                <DialogHeader>
                    <DialogTitle>Animation Options</DialogTitle>
                    <DialogDescription>
                        Choose an animation for your subtitles.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                    <div className="grid gap-3">
                        <Select value={wordLevel.toString()} onValueChange={(value) => setWordLevel(value === "true")}>
                            <SelectTrigger id="wordLevel" className="[&_[data-description]]:hidden h-11">
                                <SelectValue placeholder="Select animation type..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="false">
                                    <div className="flex items-center gap-3 text-muted-foreground">
                                        <Text className="size-5 flex-shrink-0 text-foreground" />
                                        <div className="grid gap-0.5 text-left">
                                            <p className="font-medium text-foreground">Segment Level</p>
                                            <p className="text-xs" data-description>Entire subtitle will be animated at once</p>
                                        </div>
                                    </div>
                                </SelectItem>
                                <SelectItem value="true">
                                    <div className="flex items-center gap-3 text-muted-foreground">
                                        <WholeWord className="size-5 flex-shrink-0 text-foreground" />
                                        <div className="grid gap-0.5 text-left">
                                            <p className="font-medium text-foreground">Word Level</p>
                                            <p className="text-xs" data-description>Each word will appear individually when spoken</p>
                                        </div>
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-3">
                        {renderToggleGroup(animationTypes, animationType, setAnimationType as (value: string) => void)}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

const formatTypes = [
    { value: "none", label: "No Formatting", description: "Keep the subtitle text unchanged.", icon: PencilOff },
    { value: "lowercase", label: "Format to Lowercase", description: "Convert all subtitle text to lowercase.", icon: AArrowDown },
    { value: "uppercase", label: "Format to Uppercase", description: "Convert all subtitle text to uppercase.", icon: AArrowUp },
] as const

type FormatType = (typeof formatTypes)[number]["value"]

function FormatOptions() {
    const { settings, updateSetting } = useGlobal();
    const [textFormat, setTextFormat] = useState<FormatType>(settings.textFormat);

    useEffect(() => {
        updateSetting('textFormat', textFormat);
    }, [textFormat]);

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="secondary" size="lg"><Type className="size-5 text-blue-500" /></Button>
            </DialogTrigger>
            <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Text Formatting Options</DialogTitle>
                    <DialogDescription>
                        Customize the appearance and format of your subtitles.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    <div className="grid gap-3">
                        {renderSelect(formatTypes, textFormat, setTextFormat as (value: string) => void)}
                    </div>
                    <div className="flex items-center space-x-4 rounded-md border p-4">
                        <Signature className="w-5" />
                        <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium leading-none">
                                Remove Punctuation
                            </p>
                        </div>
                        <Switch checked={settings.removePunctuation} onCheckedChange={(checked) => updateSetting('removePunctuation', checked)} />
                    </div>
                    <Card>
                        <CardHeader className="py-4">
                            <CardTitle className="text-md">Censored Words</CardTitle>
                            <CardDescription>Hide specific words when they appear in your subtitles.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-2 px-4">
                            <ScrollArea className="max-h-[150px]">
                                {settings.sensitiveWords.map((word: string, index: number) => (
                                    <div key={index} className="flex items-center m-1 mb-2 mr-3">
                                        <Input
                                            value={word}
                                            type="string"
                                            placeholder="Enter word"
                                            onChange={(e) => {
                                                const newWords = [...settings.sensitiveWords];
                                                newWords[index] = e.target.value;
                                                updateSetting('sensitiveWords', newWords);
                                            }}
                                        />
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            className="ml-2"
                                            onClick={() => {
                                                const newWords = settings.sensitiveWords.filter((_, i) => i !== index);
                                                updateSetting('sensitiveWords', newWords);
                                            }}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                ))}
                            </ScrollArea>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="mx-1"
                                onClick={() => updateSetting('sensitiveWords', [...settings.sensitiveWords, ""])}
                            >
                                Add Word
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </DialogContent>
        </Dialog>
    );
}

const highlightTypes = [
    { value: "none", label: "None", description: "No highlighting.", icon: PencilOff },
    { value: "outline", label: "Outline", description: "Adds a word outline.", icon: TypeOutline },
    { value: "fill", label: "Fill", description: "Fills words with color.", icon: PaintRoller },
    { value: "bubble", label: "Bubble", description: "Adds a rounded box.", icon: MessageCircle },
] as const
type HighlightType = (typeof highlightTypes)[number]["value"]

function HighlightOptions() {
    const { settings, updateSetting } = useGlobal();
    const [highlightType, setHighlightType] = useState<HighlightType>(settings.highlightType);
    const [fontColor, setFontColor] = useState("#000000");

    useEffect(() => {
        updateSetting('highlightType', highlightType);
    }, [highlightType]);

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="secondary" size="lg"><Highlighter className="size-5 text-yellow-500" /></Button>
            </DialogTrigger>
            <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Highlight Options</DialogTitle>
                    <DialogDescription>
                        Emphasize the currently spoken word with different highlight styles.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-5">
                    <div className="grid gap-3">
                        {renderSelect(highlightTypes, highlightType, setHighlightType as (value: string) => void)}
                    </div>
                    <div className="grid gap-3">
                        <Card className="shadow-none">
                            <CardContent className="px-3 py-2">
                                <div className="flex items-center gap-3">
                                    <Highlighter className="h-5 w-5 ml-2" />
                                    <Label htmlFor="fontColor" className="font-medium">Highlight Colour</Label>
                                    <Input
                                        id="fontColor"
                                        type="color"
                                        value={fontColor}
                                        onChange={(e) => setFontColor(e.target.value)}
                                        className="w-14 h-12 transition-all hover:bg-muted rounded-md ml-auto cursor-pointer py-1 px-2"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}