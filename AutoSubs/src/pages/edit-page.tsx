import { useEffect, useState } from "react"
import { ColorPicker } from "@/components/ui/color-picker"
import {
    CirclePlay,
    Paintbrush,
    PaintBucket,
    RefreshCcw,
    Speech,
    TrendingUp,
    UserPen,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { SpeakerChart } from "@/components/speaker-chart"
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog"
import { SubtitleList } from "@/components/simple-subtitle-list"
import { fetch } from '@tauri-apps/plugin-http';
import { BaseDirectory, readTextFile, exists } from '@tauri-apps/plugin-fs';

var colors = [{ value: '#e11d48', label: '' }, { value: '#db2777', label: '' }, { value: '#c026d3', label: '' }, { value: '#9333ea', label: '' }, { value: '#4f46e5', label: '' }, { value: '#0284c7', label: '' }, { value: '#0d9488', label: '' }, { value: '#059669', label: '' }, { value: '#16a34a', label: '' }, { value: '#ca8a04', label: '' }, { value: '#ea580c', label: '' }, { value: '#dc2626', label: '' }, { value: '#000000', label: '' }, { value: '#ffffff', label: '' }];

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

var speakerList = [
    {
        label: "John Wallis",
        color: "#e11d48",
        lines: 30,
        style: "Outline",
        sample: "3:00 - 5:00",
        wordsSpoken: 234
    },
    {
        label: "Adam Doe",
        color: "#db2777",
        lines: 45,
        style: "Outline",
        sample: "5:00 - 7:00",
        wordsSpoken: 145
    }
]

export function EditPage() {
    const [currentTemplate, setTemplate] = useState("")
    const [topSpeaker, setTopSpeaker] = useState("Speaker 1")
    const [timeline, setTimeline] = useState("opinions")
    const [speakers, setSpeakers] = useState(speakerList);
    const [currentColor, setCurrentColor] = useState("#e11d48");
    const [currentStyle, setCurrentStyle] = useState("Outline");
    const [currentName, setCurrentName] = useState("John Doe");

    const transcriptPath = `AutoSubs/Transcripts/${timeline}.json`;

    function hexToRgb(hex: string) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        } : null;
    }

    function saveSpeaker(index: number) {
        var newSpeakers = [...speakers];
        newSpeakers[index].label = currentName;
        newSpeakers[index].color = currentColor;
        newSpeakers[index].style = currentStyle;
        setSpeakers(newSpeakers);
    }

    function printRGB(color: string) {
        var rgb = hexToRgb(color);
        if (!rgb) {
            console.log("Invalid color");
        } else {
            console.log(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
            console.log(speakers[0].style);
        }
    }

    useEffect(() => {
        // check if subtitles file exists
        exists(transcriptPath, {
            baseDir: BaseDirectory.Document,
        }).then((fileExists) => {
            if (fileExists) {
                populateSpeakers();
            }
        });
    }, [timeline]);

    async function populateSpeakers() {
        // read json file
        console.log("Reading json file...");
        const contents = await readTextFile(transcriptPath, {
            baseDir: BaseDirectory.Document,
        });
        let transcript = JSON.parse(contents);
        //setSpeakers(transcript.speakers);
    }

    return (

        <main className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2 lg:grid-cols-2">
            <div className="relative flex-col items-start gap-8 md:flex">
                <div className="grid w-full items-start gap-4">
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle>Speakers</CardTitle>
                            <CardDescription>People who were speaking in your video.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4">

                            {speakers.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No speakers found</p>
                            ) : null}
                            {speakers.map((speaker, index) => (
                                <div key={index} className="flex items-center justify-between bg-muted/50 rounded-xl px-4 py-3">
                                    <div className="flex items-center space-x-2">
                                        <Avatar>
                                            <AvatarFallback className="font-small h-9 w-9" style={{ backgroundColor: speaker.color }}>
                                                {speaker.label.split(" ").map((n) => n[0]).join("")}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-medium">{speaker.label}</p>
                                            <p className="text-sm text-muted-foreground">{speaker.wordsSpoken} lines</p>
                                        </div>
                                    </div>
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" onClick={
                                                () => {
                                                    setCurrentName(speaker.label);
                                                    setCurrentColor(speaker.color);
                                                    setCurrentStyle(speaker.style);
                                                }
                                            } className="gap-1.5 text-sm">
                                                <UserPen className="size-4" />
                                                Modify
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-[425px]">
                                            <DialogHeader>
                                                <DialogTitle>Edit Speaker</DialogTitle>
                                                <DialogDescription>
                                                    Customise the speaker's name and subtitle color
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="grid gap-4 pt-2 pb-4">
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label className="text-left">
                                                        Name
                                                    </Label>
                                                    <Input
                                                        id="name"
                                                        defaultValue={speaker.label}
                                                        onChange={({ currentTarget }) => {
                                                            setCurrentName(currentTarget.value);
                                                        }}
                                                        className="col-span-3"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label className="text-left">
                                                        Customise
                                                    </Label>
                                                    <div className="col-span-3">
                                                        <ColorPicker
                                                            value={speaker.color}
                                                            onChange={({ color, style }) => {
                                                                setCurrentColor(color);
                                                                setCurrentStyle(style);
                                                            }}
                                                            items={colors}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label className="text-left">
                                                        Sample
                                                    </Label>
                                                    <Button
                                                        variant="secondary"
                                                        className="col-span-3 gap-1.5 text-sm"
                                                    >
                                                        <Speech className="size-4" />
                                                        Jump to {speaker.sample}
                                                    </Button>
                                                </div>
                                            </div>
                                            <DialogFooter>
                                                <DialogClose asChild>
                                                    <Button
                                                        variant="outline"
                                                        type="button"
                                                        size="sm"
                                                        className="gap-1.5 text-sm"
                                                    >
                                                        Cancel
                                                    </Button>
                                                </DialogClose>
                                                <DialogClose asChild>
                                                    <Button
                                                        variant="default"
                                                        type="button"
                                                        size="sm"
                                                        className="gap-1.5 text-sm"
                                                        onClick={() => saveSpeaker(index)}
                                                    >
                                                        Save Changes
                                                    </Button>
                                                </DialogClose>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle>Identify Speakers</CardTitle>
                            <CardDescription>Analyses the timeline and identifies the different speakers</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-5">

                            <div className="grid gap-3">
                                <Label htmlFor="template">Subtitles Track</Label>
                                <Select>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Pick Text+ subtitle track" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectLabel>Tracks available</SelectLabel>
                                            <SelectItem value="apple">Apple</SelectItem>
                                            <SelectItem value="banana">Banana</SelectItem>
                                            <SelectItem value="blueberry">Blueberry</SelectItem>
                                            <SelectItem value="grapes">Grapes</SelectItem>
                                            <SelectItem value="pineapple">Pineapple</SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-3">

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-3">
                                        <Label htmlFor="top-p">Min speakers</Label>
                                        <Input id="top-p" type="number" placeholder="1" />
                                    </div>
                                    <div className="grid gap-3">
                                        <Label htmlFor="top-k">Max speakers</Label>
                                        <Input id="top-k" type="number" placeholder="3" />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button
                                type="button"
                                size="sm"
                                className="gap-1.5 text-sm w-full"
                            >
                                <CirclePlay className="size-4" />
                                Label Speakers
                            </Button>
                        </CardFooter>
                    </Card>

                </div>
            </div>
            <div className="relative flex-col items-start gap-8 md:flex">
                <Card className="w-full">
                    <CardHeader className="items-center pb-0">
                        <CardTitle>Line Distribution</CardTitle>
                        <CardDescription>Number of lines spoken by each person</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 pb-0">
                        <SpeakerChart speakerList={speakerList} />
                    </CardContent>
                    <CardFooter className="flex-col gap-2 text-sm">
                        <div className="flex items-center gap-2 font-medium leading-none">
                            {topSpeaker} spoke 50% of the time <TrendingUp className="h-4 w-4" />
                        </div>
                        <div className="leading-none text-muted-foreground">
                            Showing total number of subtitle lines
                        </div>
                    </CardFooter>
                </Card>
            </div>
        </main>
    )
}