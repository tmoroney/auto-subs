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
    RefreshCcw,
    CirclePlay,
    Star,
    Rat,
    Share,
    HeartHandshake,
    Worm,
    Loader2
} from "lucide-react"
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
import { BaseDirectory, readTextFile, exists, writeTextFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';

const tracks = [
    {
        value: "1",
        label: "Track 1",
    },
    {
        value: "2",
        label: "Track 2",
    },
    {
        value: "3",
        label: "Subtitle Track",
    }
]

const templates = [
    {
        value: "Fusion Title1",
        label: "Fusion Title1",
    },
    {
        value: "Fusion Title2",
        label: "Fusion Title2",
    },
    {
        value: "Fusion Title3",
        label: "Fusion Title3",
    },
    {
        value: "Fusion Title4",
        label: "Fusion Title4",
    },
]

const languages = [
    {
        value: "auto",
        label: "Detect Automatically (Auto)",
    },
    {
        value: "en",
        label: "English",
    },
    {
        value: "es",
        label: "Spanish",
    },
    {
        value: "fr",
        label: "French",
    },
    {
        value: "kr",
        label: "Korean",
    },
    {
        value: "de",
        label: "German",
    },
]

export function HomePage() {
    const [isLoading, setIsLoading] = useState(false);
    const [openLanguages, setOpenLanguages] = useState(false)
    const [openTemplates, setOpenTemplates] = useState(false)
    const [model, setModel] = useState("small")
    const [track, setTrack] = useState("")
    const [currentLanguage, setLanguage] = useState("auto")
    const [currentTemplate, setTemplate] = useState("")
    const [subtitles, setSubtitles] = useState([])
    const [timeline, setTimeline] = useState("opinions")
    const [outputMode, setOutputMode] = useState("transcribe")
    const [maxWords, setMaxWords] = useState(6)
    const [maxChars, setMaxChars] = useState(30)

    const transcriptPath = `AutoSubs/Transcripts/${timeline}.json`;


    useEffect(() => {
        // check if subtitles file exists
        exists(transcriptPath, {
            baseDir: BaseDirectory.Document,
        }).then((fileExists) => {
            if (fileExists) {
                populateSubtitles();
            }
        });
    }, [timeline]);

    async function populateSubtitles() {
        // read json file
        console.log("Reading json file...");
        const contents = await readTextFile(transcriptPath, {
            baseDir: BaseDirectory.Document,
        });
        let transcript = JSON.parse(contents);
        setSubtitles(transcript.segments);
    }

    async function exportSubtitles(jsonData: object) {
        try {
            // Open the save dialog
            const filePath = await save({
                defaultPath: 'subtitles.json', // Suggested file name
                filters: [{ name: 'JSON Files', extensions: ['json'] }],

            });

            if (!filePath) {
                console.log('Save was canceled');
                return;
            }

            // Log the file path to check it's valid
            console.log('Chosen file path:', filePath);

            // Convert the JSON data to string format
            const jsonString = JSON.stringify(jsonData, null, 2);

            console.log(jsonString);

            // Write the JSON string to the file
            await writeTextFile(filePath, jsonString);

            console.log('File saved to', filePath);
        } catch (error) {
            console.error('Failed to save file', error);
        }
    }

    async function fetchTranscription() {
        setIsLoading(true);
        console.log("Fetching transcription...");
        try {
            const response = await fetch('http://localhost:8000/transcribe/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file_path: "/Users/moroneyt/Downloads/opinions.mp3",
                    model: model,
                    language: currentLanguage,
                    task: outputMode,
                    max_words: maxWords,
                    max_chars: maxChars,
                }),
            });

            if (response.status !== 200) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            populateSubtitles();
        } catch (error) {
            console.error("Error fetching transcription:", error);
        } finally {
            setIsLoading(false);
        }
    }

    return (

        <main className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2 lg:grid-cols-3">
            <div
                className="relative flex-col items-start gap-8 md:flex"
            >
                <div className="grid w-full items-start gap-4">
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle>Generate</CardTitle>
                            <CardDescription>Adjust the settings for generating subtitles.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-5">
                            <div className="grid gap-3">
                                <Label htmlFor="model">Model</Label>
                                <Select defaultValue="small" onValueChange={(value) => setModel(value)}>
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
                            <div className="grid gap-3">
                                <Label htmlFor="role">Language</Label>
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
                                    <PopoverContent className="w-[300px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Search languages..." />
                                            <CommandList>
                                                <CommandEmpty>No language found.</CommandEmpty>
                                                <CommandGroup>
                                                    {languages.map((language) => (
                                                        <CommandItem
                                                            key={language.label}
                                                            value={language.label}
                                                            onSelect={(currentValue) => {
                                                                const selectedLanguage = languages.find(lang => lang.label === currentValue);
                                                                setLanguage(selectedLanguage ? selectedLanguage.value : "");
                                                                setOpenLanguages(false);
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    currentLanguage === language.value ? "opacity-100" : "opacity-0"
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
                            <div className="grid gap-3">
                                <Label htmlFor="track">Track to add subtitles</Label>
                                <Select onValueChange={(value) => setTrack(value)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a timeline track" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectLabel>Tracks available</SelectLabel>
                                            {tracks.map((track) => (
                                                <SelectItem key={track.value} value={track.value}>
                                                    {track.label}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-3">
                                <Label htmlFor="template">Template Text+</Label>
                                <Popover open={openTemplates} onOpenChange={setOpenTemplates}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openTemplates}
                                            className="justify-between font-normal"
                                        >
                                            {currentTemplate
                                                ? templates.find((template) => template.value === currentTemplate)?.label
                                                : "Select template..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Search MediaPool for Text+" />
                                            <CommandList>
                                                <CommandEmpty>No language found.</CommandEmpty>
                                                <CommandGroup>
                                                    {templates.map((template) => (
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

                        </CardContent>
                        <CardFooter className="flex items-center gap-2">
                            {isLoading ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    className="gap-1.5 text-sm w-full"
                                    disabled
                                >
                                    <Loader2 className="size-4 animate-spin" />
                                    Transcribing Audio...
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    size="sm"
                                    className="gap-1.5 text-sm w-full"
                                    onClick={async () => await fetchTranscription()}
                                >
                                    <CirclePlay className="size-4" />
                                    Generate
                                </Button>
                            )}
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle>Advanced</CardTitle>
                            <CardDescription>Settings for more advanced users</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-5">
                            <div className="grid gap-3">
                                <Label htmlFor="output">Output Mode</Label>
                                <Select defaultValue="transcribe" onValueChange={(value) => {
                                    setOutputMode(value);
                                    if (value === "translate" && (model === "base" || model === "tiny")) {
                                        setModel("small");
                                    }
                                }

                                }>
                                    <SelectTrigger
                                        id="model"
                                        className="[&_[data-description]]:hidden"
                                    >
                                        <SelectValue placeholder="Select a model..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="transcribe">
                                            <div className="flex items-start gap-3 text-muted-foreground">
                                                <PencilLine className="size-5" />
                                                <div className="grid gap-0.5">
                                                    <p className="text-foreground">
                                                        Transcribe (original language)
                                                    </p>
                                                    <p className="text-xs" data-description>
                                                        Subtitles in the speaker's language.
                                                    </p>
                                                </div>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="translate">
                                            <div className="flex items-start gap-3 text-muted-foreground">
                                                <Languages className="size-5" />
                                                <div className="grid gap-0.5">
                                                    <p className="text-foreground">
                                                        Translate to English
                                                    </p>
                                                    <p className="text-xs" data-description>
                                                        English subtitles for any language.
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
                        </CardContent>
                    </Card>
                </div>
            </div>
            <div className="relative hidden flex md:flex h-full min-h-[50vh] flex-col rounded-xl bg-muted/50 p-4 lg:col-span-2">
                <div className="flex flex-row w-full gap-2 pb-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-sm w-1/2"
                        onClick={() => populateSubtitles()}
                    >
                        <RefreshCcw className="size-3.5" />
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
                    <SubtitleList subtitles={subtitles} />
                </div>
            </div>
        </main>
    )
}