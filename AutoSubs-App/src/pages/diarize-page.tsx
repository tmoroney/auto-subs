import { useState } from "react"
import { ColorPicker } from "@/components/color-picker"
import {
    AudioLines,
    Check,
    ChevronsUpDown,
    RefreshCw,
    Speech,
    UserPen,
    CaseUpper,
    CaseLower,
    PencilOff,
    Signature,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SpeakerChart } from "@/components/speaker-chart"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useGlobal } from "@/GlobalContext"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"

var colors = [{ value: '#e11d48', label: '' }, { value: '#db2777', label: '' }, { value: '#c026d3', label: '' }, { value: '#9333ea', label: '' }, { value: '#4f46e5', label: '' }, { value: '#0284c7', label: '' }, { value: '#0d9488', label: '' }, { value: '#059669', label: '' }, { value: '#16a34a', label: '' }, { value: '#ca8a04', label: '' }, { value: '#ea580c', label: '' }, { value: '#dc2626', label: '' }, { value: '#000000', label: '' }, { value: '#ffffff', label: '' }];

export function DiarizePage() {
    const {
        topSpeaker,
        speakers,
        timelineInfo,
        currentTemplate,
        textFormat,
        removePunctuation,
        // sensitiveWords,
        setTemplate,
        outputTrack,
        setOutputTrack,
        setTextFormat,
        setRemovePunctuation,
        // setSensitiveWords,
        addSubtitles,
        getTimelineInfo,
        updateSpeaker,
        jumpToTime
    } = useGlobal();

    const [openTemplates, setOpenTemplates] = useState(false);
    const [openTracks, setOpenTracks] = useState(false);
    const [currentColor, setCurrentColor] = useState("#e11d48");
    const [currentStyle, setCurrentStyle] = useState("Outline");
    const [currentLabel, setCurrentLabel] = useState("John Doe");

    return (

        <main className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2 lg:grid-cols-2">
            <div className="relative flex-col items-start gap-8 md:flex">
                <div className="grid w-full items-start gap-4">
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle>Speakers</CardTitle>
                            <CardDescription>People who were speaking in your video</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4">

                            {speakers.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No speakers found</p>
                            ) : null}
                            {speakers.map((speaker, index) => (
                                <div key={index} className="flex items-center justify-between bg-muted/50 rounded-xl px-4 py-3">
                                    <div className="flex items-center space-x-3">
                                        <Avatar>
                                            <AvatarFallback className="text-small h-10 w-10 text-white" style={{ backgroundColor: speaker.color }}>
                                                {speaker.label.split(" ").map((n) => n[0]).join("")}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-medium">{speaker.label}</p>
                                            <p className="text-sm text-muted-foreground">{speaker.word_count} lines</p>
                                        </div>
                                    </div>
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" onClick={
                                                () => {
                                                    setCurrentLabel(speaker.label);
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
                                                            setCurrentLabel(currentTarget.value);
                                                        }}
                                                        className="col-span-3"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label className="text-left">
                                                        Modifier
                                                    </Label>
                                                    <div className="col-span-3">
                                                        <Select defaultValue={speaker.style} onValueChange={(value) => setCurrentStyle(value)}>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Outline" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="Outline">Outline Modifier</SelectItem>
                                                                <SelectItem value="Fill">Fill Modifier</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label className="text-left">
                                                        Color
                                                    </Label>
                                                    <div className="col-span-3">
                                                        <Input
                                                            id="font-color"
                                                            type="color"
                                                            value={currentColor}
                                                            onChange={(e) => setCurrentColor(e.target.value)}
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
                                                        onClick={async () => await jumpToTime(speaker.sample.start)}
                                                    >
                                                        <Speech className="size-4" />
                                                        Jump to speaker on timeline
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
                                                        onClick={async () => await updateSpeaker(index, currentLabel, currentColor, currentStyle)}
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
                        <CardFooter>
                            <Button
                                type="button"
                                variant={"secondary"}
                                size="sm"
                                className="gap-1.5 text-sm w-full"
                                onClick={async () => { addSubtitles() }}
                            >
                                <RefreshCw className="size-4" />
                                Update Speakers
                            </Button>
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle>Update Subtitles</CardTitle>
                            <CardDescription>Apply latest style selections to timeline</CardDescription>
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
                                            onClick={() => getTimelineInfo()}
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
                            <div className="grid gap-3">
                                <Label>Output Track</Label>
                                <Popover open={openTracks} onOpenChange={setOpenTracks}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            className="justify-between font-normal"
                                            onClick={() => getTimelineInfo()}
                                        >
                                            {outputTrack && timelineInfo.outputTracks.length > 0
                                                ? timelineInfo.outputTracks.find((track) => track.value === outputTrack)?.label
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
                                                    {timelineInfo.outputTracks.map((track) => (
                                                        <CommandItem
                                                            key={track.value}
                                                            value={track.value}
                                                            onSelect={(currentValue) => {
                                                                setOutputTrack(currentValue === outputTrack ? "" : currentValue)
                                                                setOpenTracks(false)
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
                        </CardContent>
                        <CardFooter>
                            <Button
                                type="button"
                                size="sm"
                                className="gap-1.5 text-sm w-full"
                                onClick={async () => { addSubtitles() }}
                            >
                                <RefreshCw className="size-4" />
                                Update Subtitles
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
                        <SpeakerChart speakerList={speakers} />
                    </CardContent>
                    <CardFooter className="flex-col gap-2 text-sm">
                        {speakers.length > 0 ? (
                            <>
                                <div className="flex items-center gap-2 font-medium leading-none">
                                    {topSpeaker.label} spoke {topSpeaker.percentage}% of the time <AudioLines className="h-4 w-4" />
                                </div>
                                <div className="leading-none text-muted-foreground">
                                    Shows the distribution of subtitle lines
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-2 font-medium leading-none">
                                    No speakers found in audio <AudioLines className="h-4 w-4" />
                                </div>
                                <div className="leading-none text-muted-foreground">
                                    Enable speaker diarization to see labels
                                </div>
                            </>
                        )
                        }
                    </CardFooter>
                </Card>
            </div>
        </main>
    )
}