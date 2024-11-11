import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import {
    Bird,
    Rabbit,
    Turtle,
    Check,
    ChevronsUpDown,
    Languages,
    PencilLine,
    RefreshCw,
    CirclePlay,
    Star,
    Rat,
    Share,
    HeartHandshake,
    Worm,
    Loader2,
    BellRing,
    Speech
} from "lucide-react"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog"

import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
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

const resolveAPI = "http://localhost:5016/";
const transcribeAPI = "http://localhost:8000/transcribe/";
const validateAPI = "http://localhost:8000/validate/";

const languages = [
    { label: "Detect Automatically", value: "auto" },
    { label: "English", value: "english" },
    { label: "Chinese", value: "chinese" },
    { label: "German", value: "german" },
    { label: "Spanish", value: "spanish" },
    { label: "Russian", value: "russian" },
    { label: "Korean", value: "korean" },
    { label: "French", value: "french" },
    { label: "Japanese", value: "japanese" },
    { label: "Portuguese", value: "portuguese" },
    { label: "Turkish", value: "turkish" },
    { label: "Polish", value: "polish" },
    { label: "Catalan", value: "catalan" },
    { label: "Dutch", value: "dutch" },
    { label: "Arabic", value: "arabic" },
    { label: "Swedish", value: "swedish" },
    { label: "Italian", value: "italian" },
    { label: "Indonesian", value: "indonesian" },
    { label: "Hindi", value: "hindi" },
    { label: "Finnish", value: "finnish" },
    { label: "Vietnamese", value: "vietnamese" },
    { label: "Hebrew", value: "hebrew" },
    { label: "Ukrainian", value: "ukrainian" },
    { label: "Greek", value: "greek" },
    { label: "Malay", value: "malay" },
    { label: "Czech", value: "czech" },
    { label: "Romanian", value: "romanian" },
    { label: "Danish", value: "danish" },
    { label: "Hungarian", value: "hungarian" },
    { label: "Tamil", value: "tamil" },
    { label: "Norwegian", value: "norwegian" },
    { label: "Thai", value: "thai" },
    { label: "Urdu", value: "urdu" },
    { label: "Croatian", value: "croatian" },
    { label: "Bulgarian", value: "bulgarian" },
    { label: "Lithuanian", value: "lithuanian" },
    { label: "Latin", value: "latin" },
    { label: "Maori", value: "maori" },
    { label: "Malayalam", value: "malayalam" },
    { label: "Welsh", value: "welsh" },
    { label: "Slovak", value: "slovak" },
    { label: "Telugu", value: "telugu" },
    { label: "Persian", value: "persian" },
    { label: "Latvian", value: "latvian" },
    { label: "Bengali", value: "bengali" },
    { label: "Serbian", value: "serbian" },
    { label: "Azerbaijani", value: "azerbaijani" },
    { label: "Slovenian", value: "slovenian" },
    { label: "Kannada", value: "kannada" },
    { label: "Estonian", value: "estonian" },
    { label: "Macedonian", value: "macedonian" },
    { label: "Breton", value: "breton" },
    { label: "Basque", value: "basque" },
    { label: "Icelandic", value: "icelandic" },
    { label: "Armenian", value: "armenian" },
    { label: "Nepali", value: "nepali" },
    { label: "Mongolian", value: "mongolian" },
    { label: "Bosnian", value: "bosnian" },
    { label: "Kazakh", value: "kazakh" },
    { label: "Albanian", value: "albanian" },
    { label: "Swahili", value: "swahili" },
    { label: "Galician", value: "galician" },
    { label: "Marathi", value: "marathi" },
    { label: "Punjabi", value: "punjabi" },
    { label: "Sinhala", value: "sinhala" },
    { label: "Khmer", value: "khmer" },
    { label: "Shona", value: "shona" },
    { label: "Yoruba", value: "yoruba" },
    { label: "Somali", value: "somali" },
    { label: "Afrikaans", value: "afrikaans" },
    { label: "Occitan", value: "occitan" },
    { label: "Georgian", value: "georgian" },
    { label: "Belarusian", value: "belarusian" },
    { label: "Tajik", value: "tajik" },
    { label: "Sindhi", value: "sindhi" },
    { label: "Gujarati", value: "gujarati" },
    { label: "Amharic", value: "amharic" },
    { label: "Yiddish", value: "yiddish" },
    { label: "Lao", value: "lao" },
    { label: "Uzbek", value: "uzbek" },
    { label: "Faroese", value: "faroese" },
    { label: "Haitian Creole", value: "haitian_creole" },
    { label: "Pashto", value: "pashto" },
    { label: "Turkmen", value: "turkmen" },
    { label: "Nynorsk", value: "nynorsk" },
    { label: "Maltese", value: "maltese" },
    { label: "Sanskrit", value: "sanskrit" },
    { label: "Luxembourgish", value: "luxembourgish" },
    { label: "Myanmar", value: "myanmar" },
    { label: "Tibetan", value: "tibetan" },
    { label: "Tagalog", value: "tagalog" },
    { label: "Malagasy", value: "malagasy" },
    { label: "Assamese", value: "assamese" },
    { label: "Tatar", value: "tatar" },
    { label: "Hawaiian", value: "hawaiian" },
    { label: "Lingala", value: "lingala" },
    { label: "Hausa", value: "hausa" },
    { label: "Bashkir", value: "bashkir" },
    { label: "Javanese", value: "javanese" },
    { label: "Sundanese", value: "sundanese" },
    { label: "Cantonese", value: "cantonese" },
] as const;
export function HomePage() {
    const {
        timeline,
        trackList,
        templateList,
        subtitles,
        tempSubtitles,
        currentTemplate,
        currentLanguage,
        currentTrack,
        diarize,
        translate,
        processingStep,
        isLoading,
        model,
        setTemplate,
        setLanguage,
        setTrack,
        setDiarize,
        setTranslate,
        setModel,
        setMaxWords,
        setMaxChars,
        setIsLoading,

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
    const [hfToken, setHfToken] = useState("");
    const [hfMessage, setHfMessage] = useState("");
    const [isDiarizeAvailable, setIsDiarizeAvailable] = useState(false);


    async function checkDiarizeAvailable(checked: boolean) {
        setDiarize(checked);
        if (checked == true && isDiarizeAvailable == false) {
            // check with server if model is available and HF token is correct
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
                                            onClick={() => getTemplates()}
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
                                            onClick={() => getTracks()}
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
                                        Distinguish and style subtitles by speaker.
                                    </p>
                                </div>
                                <Switch checked={diarize} onCheckedChange={async (checked) => checkDiarizeAvailable(checked)} />
                            </div>
                        </CardContent>
                        <CardFooter className="flex items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                className="gap-1.5 text-sm w-full"
                                onClick={async () => await fetchTranscription()}
                            >

                                {isLoading ? (
                                    <>
                                        <Loader2 className="size-4 animate-spin" />
                                        {processingStep}
                                    </>
                                ) : (
                                    <>
                                        <CirclePlay className="size-4" />
                                        Generate
                                    </>
                                )}
                            </Button>
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
                                <Select defaultValue={model} onValueChange={(value) => setModel(value)}>
                                    <SelectTrigger
                                        id="model"
                                        className="[&_[data-description]]:hidden"
                                    >
                                        <SelectValue placeholder="Select a model..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="tiny">
                                            <div className="flex items-start gap-3 text-muted-foreground">
                                                <Worm className="size-5" />
                                                <div className="grid gap-0.5">
                                                    <p>
                                                        Whisper{" "}
                                                        <span className="font-medium text-foreground">
                                                            Tiny
                                                        </span>
                                                    </p>
                                                    <p className="text-xs" data-description>
                                                        Lightning fast, but less accurate.
                                                    </p>
                                                </div>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="base">
                                            <div className="flex items-start gap-3 text-muted-foreground">
                                                <Rat className="size-5" />
                                                <div className="grid gap-0.5">
                                                    <p>
                                                        Whisper{" "}
                                                        <span className="font-medium text-foreground">
                                                            Base
                                                        </span>
                                                    </p>
                                                    <p className="text-xs" data-description>
                                                        Fastest model for general use cases.
                                                    </p>
                                                </div>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="small">
                                            <div className="flex items-start gap-3 text-muted-foreground">
                                                <Rabbit className="size-5" />
                                                <div className="grid gap-0.5">
                                                    <p>
                                                        Whisper{" "}
                                                        <span className="font-medium text-foreground">
                                                            Small
                                                        </span>
                                                    </p>
                                                    <p className="text-xs" data-description>
                                                        Good balance of speed and accuracy.
                                                    </p>
                                                </div>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="medium">
                                            <div className="flex items-start gap-3 text-muted-foreground">
                                                <Bird className="size-5" />
                                                <div className="grid gap-0.5">
                                                    <p>
                                                        Whisper{" "}
                                                        <span className="font-medium text-foreground">
                                                            Medium
                                                        </span>
                                                    </p>
                                                    <p className="text-xs" data-description>
                                                        Great accuracy and moderate speed.
                                                    </p>
                                                </div>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="large">
                                            <div className="flex items-start gap-3 text-muted-foreground">
                                                <Turtle className="size-5" />
                                                <div className="grid gap-0.5">
                                                    <p>
                                                        Whisper{" "}
                                                        <span className="font-medium text-foreground">
                                                            Large-V3
                                                        </span>
                                                    </p>
                                                    <p className="text-xs" data-description>
                                                        Most accurate / slowest (best for non-english).
                                                    </p>
                                                </div>
                                            </div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-3">
                                    <Label htmlFor="maxWords">Max words</Label>
                                    <Input id="maxWords" type="number" placeholder="6" onChange={(e) => setMaxWords(Math.abs(Number.parseInt(e.target.value)))} />
                                </div>
                                <div className="grid gap-3">
                                    <Label htmlFor="maxChars">Max characters</Label>
                                    <Input id="maxChars" type="number" placeholder="30" onChange={(e) => setMaxChars(Math.abs(Number.parseInt(e.target.value)))} />
                                </div>
                            </div>
                            <div className=" flex items-center space-x-4 rounded-md border p-4">
                                <Languages />
                                <div className="flex-1 space-y-1">
                                    <p className="text-sm font-medium leading-none">
                                        Translate to English
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        From any language to English.
                                    </p>
                                </div>
                                <Switch checked={translate} onCheckedChange={(checked) => setTranslate(checked)} />
                            </div>

                        </CardContent>
                    </Card>
                </div>
            </div>
            <div className="relative hidden flex md:flex h-full min-h-[50vh] flex-col rounded-xl bg-muted/50 p-4 lg:col-span-1">
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
                        onClick={async () => await exportSubtitles({ segments: subtitles })}
                    >
                        <Share className="size-3.5" />
                        Export
                    </Button>
                </div>
                <div className="overflow-y-auto">
                    {subtitles.length > 0 ? (
                        <SubtitleList subtitles={subtitles} />
                    ) : (
                        <div className="space-y-2 pt-4">
                            <Skeleton className="h-4 w-[250px]" />
                            <Skeleton className="h-4 w-[200px]" />
                        </div>
                    )}
                </div>
            </div>
            <Dialog open={openTokenMenu} onOpenChange={setOpenTokenMenu}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Enable Diarization</DialogTitle>
                        <DialogDescription>
                            Follow the steps below to enable diarization.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-8 pt-2">
                        {/* Step 1 */}
                        <div className="grid gap-3">
                            <Label>
                                Step 1: Accept the user conditions for these models
                            </Label>
                            <div className="flex space-x-2">
                                <a href="https://hf.co/pyannote/segmentation-3.0" target="_blank" rel="noopener noreferrer">
                                    <Button variant="secondary" size="sm" className="w-full">
                                        Segmentation 3.0 Page
                                    </Button>
                                </a>
                                <a href="https://huggingface.co/pyannote/speaker-diarization-3.1/" target="_blank" rel="noopener noreferrer">
                                    <Button variant="secondary" size="sm" className="w-full">
                                        Speaker Diarization 3.1 Page
                                    </Button>
                                </a>
                            </div>
                        </div>

                        <div className="grid gap-3">
                            <Label>
                                Step 2: Create a <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-primary">Hugging Face access token</a> with read permissions
                            </Label>
                            <div className="flex space-x-2">
                                <Input
                                    id="hf_token"
                                    type="password"
                                    placeholder="Enter your Hugging Face access token"
                                    value={hfToken}
                                    onChange={({ currentTarget }) => setHfToken(currentTarget.value)}
                                />
                            </div>
                            <p className="text-sm text-red-500">{hfMessage}</p>
                        </div>
                    </div>

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
        </main>
    )
}