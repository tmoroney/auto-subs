import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Speech, ChevronDown, ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Speaker } from "@/types/interfaces"
import { useGlobal } from "@/contexts/GlobalContext"
import { useState, useEffect } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { DialogDescription } from "@radix-ui/react-dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { jumpToTime } from "@/api/resolveAPI"

//const defaultColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"]

// temp function
function addToTimeline() {
    console.log("Adding to timeline");
}


interface SpeakerEditorProps {
    afterTranscription?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    expandedSpeakerIndex?: number;
}

export function SpeakerEditor({ afterTranscription = false, open = false, onOpenChange, expandedSpeakerIndex }: SpeakerEditorProps) {
    const { speakers, timelineInfo, settings, markIn, updateSpeakers } = useGlobal();
    const [localSpeakers, setLocalSpeakers] = useState(speakers);
    const [expandedSpeaker, setExpandedSpeaker] = useState<number | null>(null);

    function toggleExpanded(index: number) {
        if (expandedSpeaker === index) {
            setExpandedSpeaker(null);
        } else {
            setExpandedSpeaker(index);
        }
    }

    function updateSpeaker(index: number, updatedSpeaker: Speaker) {
        const newSpeakers = [...localSpeakers];
        newSpeakers[index] = updatedSpeaker;
        setLocalSpeakers(newSpeakers);
    }

    useEffect(() => {
        setLocalSpeakers(speakers);
        // Auto-expand the specified speaker if provided
        if (expandedSpeakerIndex !== undefined && expandedSpeakerIndex >= 0 && expandedSpeakerIndex < speakers.length) {
            setExpandedSpeaker(expandedSpeakerIndex);
        }
        console.log("Expanded speaker index:", expandedSpeakerIndex);
    }, [speakers, expandedSpeakerIndex]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Speakers</DialogTitle>
                    <DialogDescription className="text-sm">These are the speakers detected in the audio.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 overflow-y-auto">
                    {localSpeakers.map((speaker, index) => (
                        <Card key={index} className="overflow-hidden">
                            <div
                                className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => toggleExpanded(index)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2">
                                            {expandedSpeaker === index ? (
                                                <ChevronDown className="w-4 h-4" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4" />
                                            )}
                                            <div
                                                className="w-5 h-5 rounded-full border-4"
                                                style={{
                                                    backgroundColor: speaker.fill.enabled ? speaker.fill.color : "transparent",
                                                    borderColor: speaker.outline.enabled ? speaker.outline.color : "",
                                                }}
                                            />
                                        </div>
                                        <span className="font-medium">{speaker.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-xs h-8"
                                                    tabIndex={-1}
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        jumpToTime(speaker.sample.start, markIn);
                                                    }}
                                                >
                                                    <Speech className="w-4 h-4" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom" align="center" className="text-xs">
                                                Jump to sample in timeline
                                            </TooltipContent>
                                        </Tooltip>
                                        <span className="text-xs text-muted-foreground bg-muted rounded-md px-3 h-8 flex items-center">{speaker.track ? timelineInfo.outputTracks[Number(speaker.track)].label : timelineInfo.outputTracks[Number(settings.selectedOutputTrack)].label}</span>
                                    </div>
                                </div>
                            </div>

                            {expandedSpeaker === index && (
                                <CardContent className="p-4 pt-2 border-t space-y-3">
                                    {/* Speaker Name */}
                                    <div className="space-y-2">
                                        <Label htmlFor={`name-${index}`}>Name</Label>
                                        <Input
                                            id={`name-${index}`}
                                            value={speaker.name}
                                            onChange={(e) => updateSpeaker(index, { ...speaker, name: e.target.value })}
                                            placeholder="Enter speaker name"
                                            className="w-full"
                                        />
                                    </div>

                                    {/* Color Settings */}
                                    <div className="space-y-2">
                                        <Label className="text-sm font-medium">Appearance</Label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Fill Color */}
                                            <div className="space-y-2 p-3 rounded-lg bg-muted/40">
                                                <div className="flex items-center gap-2">
                                                    <Checkbox
                                                        id={`fill-${index}`}
                                                        checked={speaker.fill.enabled}
                                                        onCheckedChange={(checked) =>
                                                            updateSpeaker(index, {
                                                                ...speaker,
                                                                fill: { ...speaker.fill, enabled: !!checked },
                                                            })
                                                        }
                                                    />
                                                    <Label htmlFor={`fill-${index}`}>Background Color</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="color"
                                                        value={speaker.fill.color}
                                                        onChange={(e) =>
                                                            updateSpeaker(index, {
                                                                ...speaker,
                                                                fill: { ...speaker.fill, color: e.target.value },
                                                            })
                                                        }
                                                        disabled={!speaker.fill.enabled}
                                                        className="w-10 h-10 rounded-md border-2 border-input bg-background disabled:opacity-50"
                                                    />
                                                    <Input
                                                        value={speaker.fill.color}
                                                        onChange={(e) =>
                                                            updateSpeaker(index, {
                                                                ...speaker,
                                                                fill: { ...speaker.fill, color: e.target.value },
                                                            })
                                                        }
                                                        disabled={!speaker.fill.enabled}
                                                        className="font-mono flex-1"
                                                        placeholder="#000000"
                                                    />
                                                </div>
                                            </div>

                                            {/* Outline Color */}
                                            <div className="space-y-2 p-3 rounded-lg bg-muted/40">
                                                <div className="flex items-center gap-2">
                                                    <Checkbox
                                                        id={`outline-${index}`}
                                                        checked={speaker.outline.enabled}
                                                        onCheckedChange={(checked) =>
                                                            updateSpeaker(index, {
                                                                ...speaker,
                                                                outline: { ...speaker.outline, enabled: !!checked },
                                                            })
                                                        }
                                                    />
                                                    <Label htmlFor={`outline-${index}`}>Border Color</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="color"
                                                        value={speaker.outline.color}
                                                        onChange={(e) =>
                                                            updateSpeaker(index, {
                                                                ...speaker,
                                                                outline: { ...speaker.outline, color: e.target.value },
                                                            })
                                                        }
                                                        disabled={!speaker.outline.enabled}
                                                        className="w-10 h-10 rounded-md border-2 border-input bg-background disabled:opacity-50"
                                                    />
                                                    <Input
                                                        value={speaker.outline.color}
                                                        onChange={(e) =>
                                                            updateSpeaker(index, {
                                                                ...speaker,
                                                                outline: { ...speaker.outline, color: e.target.value },
                                                            })
                                                        }
                                                        disabled={!speaker.outline.enabled}
                                                        className="font-mono flex-1"
                                                        placeholder="#000000"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Track Selection */}
                                    <div className="space-y-2">
                                        <Label>Output Track</Label>
                                        <Select
                                            value={speaker.track || settings.selectedOutputTrack}
                                            onValueChange={(value) => updateSpeaker(index, { ...speaker, track: value })}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select a track" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {timelineInfo.outputTracks.map((track) => (
                                                    <SelectItem key={track.value} value={track.value}>
                                                        {track.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    ))}
                </div>
                <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-0">
                    <DialogClose asChild>
                        {afterTranscription ? (
                            <Button variant="outline" className="w-full sm:w-auto" onClick={() => updateSpeakers(speakers)}>
                                Continue Editing
                            </Button>
                        ) : (
                            <Button variant="outline" className="w-full sm:w-auto">
                                Cancel
                            </Button>
                        )}
                    </DialogClose>
                    <DialogClose asChild>
                        {afterTranscription ? (
                            <Button className="w-full sm:w-auto" onClick={() => { updateSpeakers(localSpeakers); addToTimeline() }}>
                                Save & Add to Timeline
                            </Button>
                        ) : (
                            <Button className="w-full sm:w-auto" onClick={() => { updateSpeakers(localSpeakers) }}>
                                Save Changes
                            </Button>
                        )}
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
