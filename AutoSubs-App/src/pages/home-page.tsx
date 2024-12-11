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
    Download, History,
    Pickaxe
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
} from "@/components/ui/dialog"

import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
//import { resolveResource } from "@tauri-apps/api/path";
//import { convertFileSrc } from '@tauri-apps/api/core';

const validateAPI = "http://localhost:55000/validate/";

const languages = [
    { label: "Detect Automatically", value: "auto" },
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
        timeline,
        trackList,
        templateList,
        subtitles,
        currentTemplate,
        currentLanguage,
        currentTrack,
        diarize,
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
        setTrack,
        setDiarize,
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
        populateSubtitles,
        getTemplates,
        getTracks,
    } = useGlobal();

    const [openLanguages, setOpenLanguages] = useState(false);
    const [openTemplates, setOpenTemplates] = useState(false);
    const [openTracks, setOpenTracks] = useState(false);
    const [openTokenMenu, setOpenTokenMenu] = useState(false);
    const [tooltipOpen, setTooltipOpen] = useState(false)
    const [hfToken, setHfToken] = useState("");
    const [hfMessage, setHfMessage] = useState("");
    const [isDiarizeAvailable, setIsDiarizeAvailable] = useState(false);

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
        setDiarize(checked);
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
                    setDiarize(true);
                    setOpenTokenMenu(false);
                    setIsDiarizeAvailable(true);
                    console.log("Diarization enabled");
                } else {
                    setDiarize(false);
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

    return (

        <main className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2 lg:grid-cols-2">
            <div
                className="relative flex-col items-start gap-8 md:flex"
            >
                <div className="grid w-full items-start gap-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Subtitle Generation</CardTitle>
                            <CardDescription>Generate subtitles on the current timeline</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-5">
                            <div className="grid gap-3">
                                <Label htmlFor="template">Subtitle Template</Label>
                                <Popover open={openTemplates} onOpenChange={setOpenTemplates}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openTemplates}
                                            className="justify-between font-normal"
                                            onClick={async () => await getTemplates()}
                                        >
                                            {currentTemplate && templateList.length > 0
                                                ? templateList.find((template) => template.value === currentTemplate)?.label
                                                : "Select template..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0">
                                        <Command>
                                            <CommandInput placeholder="Search MediaPool for Text+" />
                                            <CommandList>
                                                <CommandEmpty>No Text+ in the Media Pool.</CommandEmpty>
                                                <CommandGroup>
                                                    {templateList.map((template) => (
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
                            <div className="grid gap-3">
                                <Label>Output Track</Label>
                                <Popover open={openTracks} onOpenChange={setOpenTracks}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            className="justify-between font-normal"
                                            onClick={async () => await getTracks()}
                                        >
                                            {currentTrack && trackList.length > 0
                                                ? trackList.find((track) => track.value === currentTrack)?.label
                                                : "Select Track..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0">
                                        <Command>
                                            <CommandInput placeholder="Select track to place subtitles" />
                                            <CommandList>
                                                <CommandEmpty>No tracks found.</CommandEmpty>
                                                <CommandGroup>
                                                    {trackList.map((track) => (
                                                        <CommandItem
                                                            key={track.value}
                                                            value={track.value}
                                                            onSelect={(currentValue) => {
                                                                setTrack(currentValue === currentTrack ? "" : currentValue)
                                                                setOpenTracks(false)
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    currentTrack === track.value ? "opacity-100" : "opacity-0"
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
                            <div className="grid gap-3">
                                <Label>Language</Label>
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
                                                : "Select language..."}
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
                            <div className=" flex items-center space-x-4 rounded-md border p-4">
                                <Speech />
                                <div className="flex-1 space-y-1">
                                    <p className="text-sm font-medium leading-none">
                                        Speaker Diarization
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Labels different speakers using AI
                                    </p>
                                </div>
                                <Switch checked={diarize} onCheckedChange={async (checked) => checkDiarizeAvailable(checked)} />
                            </div>
                        </CardContent>
                        <CardFooter className="flex items-center gap-2">
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
                                                Generate
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
                                        Generate
                                    </Button>
                                )
                            )}
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Advanced Settings</CardTitle>
                            <CardDescription>Customize subtitle generation parameters</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-5">
                            <div className="grid gap-3">
                                <Label htmlFor="model">Model</Label>
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
                                                            Medium
                                                        </span>
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
                            </div>
                            <div className=" flex items-center space-x-4 rounded-md border p-4">
                                <Languages className="w-5" />
                                <div className="flex-1 space-y-1">
                                    <p className="text-sm font-medium leading-none">
                                        Translate to English
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Any Language to English
                                    </p>
                                </div>
                                <Switch checked={translate} onCheckedChange={(checked) => setTranslate(checked)} />
                            </div>
                            <div className="grid gap-3">
                                <Label htmlFor="textFormat">Text Formatting</Label>
                                <ToggleGroup
                                    type="single"
                                    value={textFormat}
                                    onValueChange={(value: string) => value && setTextFormat(value)}
                                    className="grid grid-cols-3 gap-3 h-20"
                                >
                                    <ToggleGroupItem
                                        value="normal"
                                        className={`h-full flex flex-col items-center justify-center border-2 bg-transparent hover:text-accent-foreground`}
                                    >
                                        <PencilOff />
                                        <span className="text-xs">None</span>
                                    </ToggleGroupItem>
                                    <ToggleGroupItem
                                        value="lowercase"
                                        className={`h-full flex flex-col items-center justify-center border-2 bg-transparent hover:text-accent-foreground`}
                                    >
                                        <CaseLower />
                                        <span className="text-xs">Lower</span>
                                    </ToggleGroupItem>
                                    <ToggleGroupItem
                                        value="uppercase"
                                        className={`h-full flex flex-col items-center justify-center border-2 bg-transparent hover:text-accent-foreground`}
                                    >
                                        <CaseUpper />
                                        <span className="text-xs">Upper</span>
                                    </ToggleGroupItem>
                                </ToggleGroup>
                            </div>
                            <div className="flex items-center space-x-4 rounded-md border p-4">
                                <Signature className="w-5" />
                                <div className="flex-1 space-y-1">
                                    <p className="text-sm font-medium leading-none">
                                        Remove Punctuation
                                    </p>
                                </div>
                                <Switch checked={removePunctuation} onCheckedChange={(checked) => setRemovePunctuation(checked)} />
                            </div>
                            <div className="grid gap-3">
                                <Label htmlFor="sensitiveWords">Censored Words</Label>
                                <Input value={sensitiveWords} id="sensitiveWords" type="string" placeholder="bomb, gun, kill" onChange={(e) => setSensitiveWords(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-3">
                                    <Label htmlFor="maxWords">Max words</Label>
                                    <Input value={maxWords} id="maxWords" type="number" placeholder="6" onChange={(e) => setMaxWords(Math.abs(Number.parseInt(e.target.value)))} />
                                </div>
                                <div className="grid gap-3">
                                    <Label htmlFor="maxChars">Max characters</Label>
                                    <Input value={maxChars} id="maxChars" type="number" placeholder="30" onChange={(e) => setMaxChars(Math.abs(Number.parseInt(e.target.value)))} />
                                </div>
                            </div>

                            {platform() === 'windows' && (
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
                            )}

                        </CardContent>
                    </Card>
                </div>
            </div>
            <div className="sticky top-0 hidden md:flex h-[calc(100vh-5.5rem)] flex-col rounded-xl bg-muted/50 p-4 lg:col-span-1">
                <div className="flex flex-row w-full gap-2 pb-4">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-sm w-1/2"
                        onClick={async () => populateSubtitles(timeline)}
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