import { useState } from "react";
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
    Pickaxe,
    AudioLines,
    PencilLine,
    Type,
    Plus,
    Shield,
    Download,
    History,
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
import { useGlobal } from '@/GlobalContext';
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
//import { resolveResource } from "@tauri-apps/api/path";
//import { convertFileSrc } from '@tauri-apps/api/core';

const validateAPI = "http://localhost:55000/validate/";

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

export function HomePage() {
    const {
        timelineInfo,
        subtitles,
        currentTemplate,
        currentLanguage,
        outputTrack,
        inputTrack,
        enabledSteps,
        currentStep,
        progress,
        diarizeMode,
        diarizeSpeakerCount,
        translate,
        processingStep,
        isLoading,
        model,
        maxWords,
        maxChars,
        textFormat,
        removePunctuation,
        sensitiveWords,
        alignWords,
        audioPath,
        setTemplate,
        setLanguage,
        setInputTrack,
        setOutputTrack,
        setEnabledSteps,
        setDiarizeSpeakerCount,
        setDiarizeMode,
        setTranslate,
        setModel,
        setMaxWords,
        setMaxChars,
        setTextFormat,
        setRemovePunctuation,
        setSensitiveWords,
        setAlignWords,
        setIsLoading,
        setError,
        fetchTranscription,
        exportSubtitles,
        getTimelineInfo,
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
        if (isLoading) return;
        setEnabledSteps({
            ...enabledSteps,
            diarize: checked,
        });
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
                    toast((enabledSteps.diarize ? "Disabled" : "Enabled") + " Speaker Diarization", {
                        description: enabledSteps.diarize ? "Removed from processing steps." : "Added to processing steps.",
                    })
                } else {
                    setEnabledSteps({
                        ...enabledSteps,
                        diarize: false,
                    });
                    console.log(message);
                    // open menu with instructions
                    setHfMessage(message);
                    setOpenTokenMenu(true);

                }
            } catch (error) {
                setError({
                    title: "Error",
                    desc: String(error),
                });
            }
        }
    }

    function getStatusColor(step: number) {
        return currentStep === step ? "bg-yellow-500" : currentStep < step ? "bg-sky-500" : "bg-green-500";
    }

    return (

        <main className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2 lg:grid-cols-2">
            <div
                className="relative flex-col items-start gap-8 md:flex"
            >
                <div className="grid w-full items-start gap-4">
                    <Card className="overflow-hidden">
                        <CardHeader className="pb-5">
                            <CardTitle className="flex items-center justify-between">
                                <span>Transcription Flow</span>
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
                            <CardDescription>Configure and run transcription process</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-5">
                            <div className="grid gap-2.5">
                                <Label htmlFor="template">Subtitle Template</Label>
                                <Popover open={openTemplates} onOpenChange={setOpenTemplates}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openTemplates}
                                            className="justify-between font-normal"
                                            onClick={async () => await getTimelineInfo()}
                                        >
                                            {currentTemplate && timelineInfo.templates.length > 0
                                                ? timelineInfo.templates.find((template) => template.value === currentTemplate)?.label
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
                                                                setTemplate(currentValue === currentTemplate ? "" : currentValue)
                                                                setOpenTemplates(false)
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    currentTemplate === template.value ? "opacity-100" : "opacity-0"
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
                                            onClick={async () => await getTimelineInfo()}
                                        >
                                            {outputTrack && timelineInfo.outputTracks.length > 0
                                                ? timelineInfo.outputTracks.find((track) => track.value === outputTrack)?.label
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
                                                                setOutputTrack(currentValue === outputTrack ? "" : currentValue)
                                                                setOpenOutputTracks(false)
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    outputTrack === track.value ? "opacity-100" : "opacity-0"
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

                            {isLoading ? (
                                <Button disabled
                                    type="button"
                                    size="sm"
                                    className="gap-1.5 text-sm w-full"
                                >
                                    <Loader2 className="size-4 animate-spin cursor-progress" />
                                    {processingStep}
                                </Button>
                            ) : (
                                audioPath.length > 0 ? (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="gap-1.5 text-sm w-full"
                                            >
                                                <CirclePlay className="size-4" />
                                                Start Process
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-full">
                                            <DropdownMenuItem onClick={async () => await fetchTranscription("")}>
                                                <Download className="mr-2 h-4 w-4" />
                                                <span>Export Latest Audio</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={async () => await fetchTranscription(audioPath)}>
                                                <History className="mr-2 h-4 w-4" />
                                                <span>Use Audio from Previous Job</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                ) : (
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="gap-1.5 text-sm w-full"
                                        onClick={async () => await fetchTranscription("")}
                                    >
                                        <CirclePlay className="size-4" />
                                        Start Process
                                    </Button>
                                )
                            )}
                            {/* <Progress value={20} /> */}
                        </CardContent>
                        <CardFooter className="p-0">
                            <Progress value={progress} className="rounded-b-md rounded-t-none h-3" />
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
                                <DialogTitle>Add New Processing Step</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <Card
                                    key="1"
                                    className={`cursor-pointer transition-colors hover:bg-accent ${enabledSteps.diarize && 'border-primary bg-primary/10 hover:bg-primary/10'}`}
                                    onClick={() => {
                                        checkDiarizeAvailable(!enabledSteps.diarize);
                                    }}
                                    style={{ userSelect: 'none' }}
                                >
                                    <CardContent className="flex items-center p-6">
                                        <div className="p-3 bg-primary/10 rounded-full mr-4 hover:animate-spin">
                                            <Speech className="h-6 w-6 text-primary" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg ">Diarize Speakers</CardTitle>
                                            <CardDescription>Label different speakers with AI</CardDescription>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card
                                    key="2"
                                    className={`cursor-pointer transition-colors hover:bg-accent ${enabledSteps.textFormat && 'border-primary bg-primary/10 hover:bg-primary/10'}`}
                                    onClick={() => {
                                        setEnabledSteps({ ...enabledSteps, textFormat: !enabledSteps.textFormat })
                                        toast((enabledSteps.textFormat ? "Disabled" : "Enabled") + " Text Formatting", {
                                            description: enabledSteps.textFormat ? "Removed from processing steps." : "Added to processing steps.",
                                        })
                                    }}
                                    style={{ userSelect: 'none' }}
                                >
                                    <CardContent className="flex items-center p-6">
                                        <div className="p-3 bg-primary/10 rounded-full mr-4 hover:animate-spin">
                                            <Type className="h-6 w-6 text-primary" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">Text Formatting</CardTitle>
                                            <CardDescription>Customise format of subtitle text</CardDescription>
                                        </div>
                                    </CardContent>
                                </Card>
                                {platform() === 'windows' && (
                                    <Card
                                        key="3"
                                        className={`cursor-pointer transition-colors hover:bg-accent ${enabledSteps.advancedOptions && 'border-primary bg-primary/10 hover:bg-primary/10'}`}
                                        onClick={() => {
                                            setEnabledSteps({ ...enabledSteps, advancedOptions: !enabledSteps.advancedOptions })
                                            toast((enabledSteps.advancedOptions ? "Disabled" : "Enabled") + " Advanced Options", {
                                                description: enabledSteps.advancedOptions ? "Removed from processing steps." : "Added to processing steps.",
                                            })
                                        }}
                                        style={{ userSelect: 'none' }}
                                    >
                                        <CardContent className="flex items-center p-6">
                                            <div className="p-3 bg-primary/10 rounded-full mr-4 hover:animate-spin">
                                                <Shield className="h-6 w-6 text-primary" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg">Advanced Options</CardTitle>
                                                <CardDescription>Fine-tune with additional options</CardDescription>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </DialogContent>
                    </Dialog>
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
                                                onClick={async () => await getTimelineInfo()}
                                            >
                                                {inputTrack && timelineInfo.inputTracks.length > 0
                                                    ? timelineInfo.inputTracks.find((track) => track.value === inputTrack)?.label
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
                                                                    setInputTrack(currentValue === inputTrack ? "" : currentValue)
                                                                    setOpenInputTracks(false)
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        inputTrack === track.value ? "opacity-100" : "opacity-0"
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
                                                {currentLanguage
                                                    ? languages.find((language) => language.value === currentLanguage)?.label
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
                                                        {languages.map((language) => (
                                                            <CommandItem
                                                                value={language.label}
                                                                key={language.value}
                                                                onSelect={() => {
                                                                    setLanguage(language.value)
                                                                    setOpenLanguages(false)
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        language.value === currentLanguage
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
                                            {currentStep === step ? "Exporting Audio..." : currentStep < step ? "Pending" : "Complete"}
                                        </span>
                                    </div>
                                );
                            })()}
                        </CardFooter>
                    </Card>
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
                                <Select value={model} onValueChange={(value) => setModel(value)}>
                                    <SelectTrigger
                                        id="model"
                                        className="[&_[data-description]]:hidden"
                                    >
                                        <SelectValue placeholder="Select a model..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="tiny">
                                            <div className="flex items-center gap-3 text-muted-foreground">
                                                <Worm className="size-5 flex-shrink-0" />
                                                <div className="grid gap-0.5">
                                                    <p>
                                                        Whisper{" "}
                                                        <span className="font-medium text-foreground">
                                                            Tiny
                                                        </span>
                                                    </p>
                                                    <p className="text-xs" data-description>
                                                        Super fast, lower accuracy.
                                                    </p>
                                                </div>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="base">
                                            <div className="flex items-center gap-3 text-muted-foreground">
                                                <Rat className="size-5 flex-shrink-0" />
                                                <div className="grid gap-0.5">
                                                    <p>
                                                        Whisper{" "}
                                                        <span className="font-medium text-foreground">
                                                            Base
                                                        </span>
                                                    </p>
                                                    <p className="text-xs" data-description>
                                                        Fast and reliable for general use.
                                                    </p>
                                                </div>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="small">
                                            <div className="flex items-center gap-3 text-muted-foreground">
                                                <Rabbit className="size-5 flex-shrink-0" />
                                                <div className="grid gap-0.5">
                                                    <p>
                                                        Whisper{" "}
                                                        <span className="font-medium text-foreground">
                                                            Small
                                                        </span>
                                                    </p>
                                                    <p className="text-xs" data-description>
                                                        Balanced speed and accuracy.
                                                    </p>
                                                </div>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="medium">
                                            <div className="flex items-center gap-3 text-muted-foreground">
                                                <Bird className="size-5 flex-shrink-0" />
                                                <div className="grid gap-0.5">
                                                    <p>
                                                        Whisper{" "}
                                                        <span className="font-medium text-foreground">
                                                            Medium{" "}
                                                        </span>
                                                        (recommended)
                                                    </p>
                                                    <p className="text-xs" data-description>
                                                        Great accuracy, moderate speed.
                                                    </p>
                                                </div>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="large">
                                            <div className="flex items-center gap-3 text-muted-foreground">
                                                <Turtle className="size-6 flex-shrink-0" />
                                                <div className="grid gap-0.5">
                                                    <p>
                                                        Whisper{" "}
                                                        <span className="font-medium text-foreground">
                                                            Large
                                                        </span>
                                                    </p>
                                                    <p className="text-xs" data-description>
                                                        Most accurate, but slower.
                                                    </p>
                                                </div>
                                            </div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-2.5">
                                        <Label htmlFor="maxWords">Words per line</Label>
                                        <Input value={maxWords} id="maxWords" type="number" placeholder="6" onChange={(e) => setMaxWords(Math.abs(Number.parseInt(e.target.value)))} />
                                    </div>
                                    <div className="grid gap-2.5">
                                        <Label htmlFor="maxChars">Characters per line</Label>
                                        <Input value={maxChars} id="maxChars" type="number" placeholder="30" onChange={(e) => setMaxChars(Math.abs(Number.parseInt(e.target.value)))} />
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
                                    <Switch checked={translate} onCheckedChange={(checked) => setTranslate(checked)} />
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
                                            {currentStep === step ? "Transcribing Audio..." : currentStep < step ? "Pending" : "Complete"}
                                        </span>
                                    </div>
                                );
                            })()}
                        </CardFooter>
                    </Card>
                    {enabledSteps.diarize && (
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
                                    <Select value={diarizeMode} onValueChange={(value) => setDiarizeMode(value)}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Choose detection mode" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="auto">Auto detect speakers</SelectItem>
                                            <SelectItem value="specific">Specify number of speakers</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {diarizeMode !== "auto" && (
                                    <div className="grid gap-3">
                                        <Label htmlFor="speakerCount">Number of Speakers</Label>
                                        <Input value={diarizeSpeakerCount} id="speakerCount" type="number" placeholder="Enter number of speakers" onChange={(e) => setDiarizeSpeakerCount(Math.abs(Number.parseInt(e.target.value)))} />
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="pb-5 flex justify-between pr-5">
                                {(() => {
                                    let step = 3;
                                    return (
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${getStatusColor(step)}`} />
                                            <span className="text-sm text-muted-foreground">
                                                {currentStep === step ? "Diarizing Speakers..." : currentStep < step ? "Pending" : "Complete"}
                                            </span>
                                        </div>
                                    );
                                })()}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-xs border border-red-500 text-red-500 hover:bg-red-100 hover:text-red-500"
                                    onClick={() => setEnabledSteps({ ...enabledSteps, diarize: false })}
                                >
                                    Disable
                                </Button>
                            </CardFooter>
                        </Card>
                    )}
                    {enabledSteps.textFormat && (
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
                                        <Input value={sensitiveWords} id="sensitiveWords" type="string" placeholder="bomb, gun, kill" onChange={(e) => setSensitiveWords(e.target.value)} />
                                    </div>
                                    <ToggleGroup
                                        type="single"
                                        value={textFormat}
                                        onValueChange={(value: string) => value && setTextFormat(value)}
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
                                        <Switch checked={removePunctuation} onCheckedChange={(checked) => setRemovePunctuation(checked)} />
                                    </div>

                                </div>
                            </CardContent>
                            <CardFooter className="pb-5 flex justify-between pr-5">
                                {(() => {
                                    let step = 4;
                                    return (
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${getStatusColor(step)}`} />
                                            <span className="text-sm text-muted-foreground">
                                                {currentStep === step ? "Formatting Text..." : currentStep < step ? "Pending" : "Complete"}
                                            </span>
                                        </div>
                                    );
                                })()}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-xs border border-red-500 text-red-500 hover:bg-red-100 hover:text-red-500"
                                    onClick={() => setEnabledSteps({ ...enabledSteps, textFormat: false })}
                                >

                                    Disable
                                </Button>
                            </CardFooter>
                        </Card>
                    )}
                    {enabledSteps.advancedOptions && (
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
                                    <Switch checked={alignWords} onCheckedChange={(checked) => setAlignWords(checked)} />
                                </div>
                            </CardContent>
                            <CardFooter className="pb-5 flex justify-between pr-5">
                                {(() => {
                                    let step = 5;
                                    return (
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${getStatusColor(step)}`} />
                                            <span className="text-sm text-muted-foreground">
                                                {currentStep === step ? "Finetuning subtitles..." : currentStep < step ? "Pending" : "Complete"}
                                            </span>
                                        </div>
                                    );
                                })()}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-xs border border-red-500 text-red-500 hover:bg-red-100 hover:text-red-500"
                                    onClick={() => setEnabledSteps({ ...enabledSteps, advancedOptions: false })}
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
                                setIsLoading(true);
                                await checkDiarizeAvailable(true);
                                setIsLoading(false);
                            }}
                        >
                            {isLoading ? (
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