import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ColorPopover } from "@/components/color-popover"
import { Speech, ChevronDown, ChevronRight, LoaderPinwheel, LoaderCircle, Palette } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Speaker } from "@/types/interfaces"
import { useGlobal } from "@/contexts/GlobalContext"
import { useState, useEffect } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { DialogDescription } from "@radix-ui/react-dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { jumpToTime } from "@/api/resolveAPI"
import { ScrollArea } from "@/components/ui/scroll-area"
import { generatePreview } from "@/api/resolveAPI"
import { downloadDir } from "@tauri-apps/api/path"
import { convertFileSrc } from "@tauri-apps/api/core"

interface SpeakerEditorProps {
    afterTranscription?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    expandedSpeakerIndex?: number;
}

export function SpeakerEditor({ afterTranscription = false, open = false, onOpenChange, expandedSpeakerIndex }: SpeakerEditorProps) {
    const { speakers, timelineInfo, settings, updateSpeakers, pushToTimeline } = useGlobal();
    const [localSpeakers, setLocalSpeakers] = useState(speakers);
    const [expandedSpeaker, setExpandedSpeaker] = useState<number | null>(null);
    const [previews, setPreviews] = useState<{ [index: number]: string }>({});
    const [loadingPreview, setLoadingPreview] = useState<{ [index: number]: boolean }>({});

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

    // Generate a preview for a specific speaker subtitle
    async function getSubtitlePreview(index: number): Promise<string> {
        setLoadingPreview(prev => ({ ...prev, [index]: true }));
        const downloadPath = await downloadDir();
        let path = await generatePreview(localSpeakers[index], settings.selectedTemplate.value, downloadPath);
        console.log("Generated preview for speaker", localSpeakers[index].name, "at", path);
        try {
            const assetUrl = convertFileSrc(path) + `?t=${Date.now()}`;
            setPreviews(prev => ({ ...prev, [index]: assetUrl }));
            return assetUrl;
        } catch (err) {
            console.error("Failed to create asset URL:", err);
            setPreviews(prev => ({ ...prev, [index]: "" }));
            return "";
        } finally {
            setLoadingPreview(prev => ({ ...prev, [index]: false }));
        }
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
            <DialogContent className="max-h-[calc(100vh-2rem)]">
                <DialogHeader>
                    <DialogTitle>Edit Speakers</DialogTitle>
                    <DialogDescription className="text-sm">These are the speakers detected in the audio.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[calc(100vh-15rem)]">
                    <div className="space-y-4">
                        {localSpeakers.map((speaker, index) => (
                            <Card key={index}>
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
                                                            jumpToTime(speaker.sample.start);
                                                        }}
                                                    >
                                                        <Speech className="w-4 h-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent side="bottom" align="center" className="text-xs">
                                                    Jump to sample in timeline
                                                </TooltipContent>
                                            </Tooltip>
                                            <span className="text-xs text-muted-foreground bg-muted rounded-md px-3 h-8 flex items-center">{speaker.track ? timelineInfo.outputTracks[Number(speaker.track)]?.label : timelineInfo.outputTracks[Number(settings.selectedOutputTrack)]?.label}</span>
                                        </div>
                                    </div>
                                </div>

                                {expandedSpeaker === index && (
                                    <CardContent className="p-4 pb-2 border-t space-y-3 mb-2">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                        </div>

                                        {/* Color Settings */}
                                        <div className="space-y-2">
                                            <Label className="text-sm font-medium">Appearance</Label>
                                            <div className="grid grid-cols-3 gap-4">
                                                {/* Fill Color Popover */}
                                                <ColorPopover
                                                    label="Fill"
                                                    enabled={speaker.fill.enabled}
                                                    onEnabledChange={(enabled: boolean) =>
                                                        updateSpeaker(index, {
                                                            ...speaker,
                                                            fill: { ...speaker.fill, enabled },
                                                        })
                                                    }
                                                    color={speaker.fill.color}
                                                    onColorChange={(color: string) =>
                                                        updateSpeaker(index, {
                                                            ...speaker,
                                                            fill: { ...speaker.fill, color },
                                                        })
                                                    }
                                                />

                                                {/* Outline Color Popover */}
                                                <ColorPopover
                                                    label="Outline"
                                                    enabled={speaker.outline.enabled}
                                                    onEnabledChange={(enabled: boolean) =>
                                                        updateSpeaker(index, {
                                                            ...speaker,
                                                            outline: { ...speaker.outline, enabled },
                                                        })
                                                    }
                                                    color={speaker.outline.color}
                                                    onColorChange={(color: string) =>
                                                        updateSpeaker(index, {
                                                            ...speaker,
                                                            outline: { ...speaker.outline, color },
                                                        })
                                                    }
                                                />

                                                {/* Border Color Popover */}
                                                <ColorPopover
                                                    label="Border"
                                                    enabled={speaker.border.enabled}
                                                    onEnabledChange={(enabled: boolean) =>
                                                        updateSpeaker(index, {
                                                            ...speaker,
                                                            border: { ...speaker.border, enabled },
                                                        })
                                                    }
                                                    color={speaker.border.color}
                                                    onColorChange={(color: string) =>
                                                        updateSpeaker(index, {
                                                            ...speaker,
                                                            border: { ...speaker.border, color },
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>
                                        {/* Show preview */}
                                        <Button
                                            variant="secondary"
                                            className="w-full flex items-center justify-center gap-2"
                                            disabled={loadingPreview[index]}
                                            onClick={async () => { await getSubtitlePreview(index); }}
                                        >
                                            {loadingPreview[index] ? (
                                                <>
                                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                                    Generating Preview...
                                                </>
                                            ) : (
                                                <>
                                                    <Palette className="h-4 w-4" />
                                                    Generate Preview
                                                </>
                                            )}
                                        </Button>
                                        {previews[index] && (
                                            <div className="flex justify-center relative pb-2">
                                                <div className="relative">
                                                    <img
                                                        src={previews[index]}
                                                        alt="Subtitle Preview"
                                                        className="max-w-full rounded-md shadow-none transition-all duration-500 ease-in-out transform -translate-y-4 opacity-0 border-2"
                                                        onLoad={e => {
                                                            e.currentTarget.classList.remove('-translate-y-4', 'opacity-0');
                                                            e.currentTarget.classList.add('translate-y-0', 'opacity-100');
                                                        }}
                                                    />
                                                    {loadingPreview[index] && (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-md">
                                                            <LoaderPinwheel className="h-8 w-8 text-white animate-spin" />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                    </CardContent>
                                )}
                            </Card>
                        ))}
                    </div>
                </ScrollArea>
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
                            <Button className="w-full sm:w-auto" onClick={() => { updateSpeakers(localSpeakers); pushToTimeline() }}>
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
        </Dialog >
    )
}
