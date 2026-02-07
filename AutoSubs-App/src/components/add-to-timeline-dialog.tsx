import { useState, useEffect } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Settings, TimelineInfo, Speaker } from "@/types/interfaces"
import { useTranscript } from "@/contexts/TranscriptContext"
import { Check, ChevronLeft, ChevronRight, Layers, Layout, Palette } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ColorPopover } from "@/components/color-popover"

const PRESET_COLORS = [
    "#ef4444", "#f97316", "#eab308", "#22c55e",
    "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
]

const STEPS = [
    { title: "Template", description: "Choose a style template", icon: Layout },
    { title: "Speakers", description: "Configure speaker tracks and colors", icon: Palette },
    { title: "Output Track", description: "Select the subtitle track", icon: Layers },
]

interface AddToTimelineDialogProps {
    children: React.ReactNode
    settings: Settings
    timelineInfo: TimelineInfo
    onAddToTimeline: (selectedOutputTrack: string, selectedTemplate: string) => Promise<void>
}

export function AddToTimelineDialog({
    children,
    settings,
    timelineInfo,
    onAddToTimeline
}: AddToTimelineDialogProps) {
    const { speakers, updateSpeakers } = useTranscript()
    const [open, setOpen] = useState(false)
    const [currentStep, setCurrentStep] = useState(0)
    const [selectedOutputTrack, setSelectedOutputTrack] = useState(settings.selectedOutputTrack)
    const [selectedTemplate, setSelectedTemplate] = useState(settings.selectedTemplate.value)
    const [localSpeakers, setLocalSpeakers] = useState<Speaker[]>(speakers)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const hasSpeakers = speakers.length > 0
    const activeSteps = hasSpeakers ? STEPS : [STEPS[0], STEPS[2]]
    const totalSteps = activeSteps.length

    useEffect(() => {
        if (open) {
            setCurrentStep(0)
            setSelectedOutputTrack(settings.selectedOutputTrack)
            setSelectedTemplate(settings.selectedTemplate.value)
            setLocalSpeakers(speakers)
        }
    }, [open, settings, speakers])

    const handleSubmit = async () => {
        setIsSubmitting(true)
        try {
            if (localSpeakers.length > 0) {
                await updateSpeakers(localSpeakers)
            }
            await onAddToTimeline(selectedOutputTrack, selectedTemplate)
            setOpen(false)
        } catch (error) {
            console.error('Failed to add to timeline:', error)
        } finally {
            setIsSubmitting(false)
        }
    }

    const updateSpeakerColor = (index: number, color: string) => {
        const newSpeakers = [...localSpeakers]
        newSpeakers[index] = {
            ...newSpeakers[index],
            fill: { ...newSpeakers[index].fill, enabled: true, color },
        }
        setLocalSpeakers(newSpeakers)
    }

    const canProceed = () => {
        const stepTitle = activeSteps[currentStep]?.title
        if (stepTitle === "Template") return !!selectedTemplate
        if (stepTitle === "Output Track") return !!selectedOutputTrack
        return true
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add to Timeline</DialogTitle>
                    <DialogDescription>
                        {activeSteps[currentStep]?.description}
                    </DialogDescription>
                </DialogHeader>

                {/* Stepper */}
                <div className="flex items-center gap-1">
                    {activeSteps.map((step, index) => {
                        const Icon = step.icon
                        return (
                            <div key={index} className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => index < currentStep && setCurrentStep(index)}
                                    disabled={index > currentStep}
                                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                        index < currentStep
                                            ? "bg-primary/10 text-primary cursor-pointer hover:bg-primary/20"
                                            : index === currentStep
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-muted-foreground"
                                    }`}
                                >
                                    {index < currentStep ? (
                                        <Check className="w-3.5 h-3.5" />
                                    ) : (
                                        <Icon className="w-3.5 h-3.5" />
                                    )}
                                    <span className="hidden sm:inline">{step.title}</span>
                                </button>
                                {index < activeSteps.length - 1 && (
                                    <div className={`w-6 h-0.5 rounded-full ${
                                        index < currentStep ? "bg-primary" : "bg-muted"
                                    }`} />
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Step content */}
                <div className="py-2 min-h-[120px]">
                    {activeSteps[currentStep]?.title === "Template" && (
                        <div className="space-y-3">
                            <label className="text-sm font-medium">Template Theme</label>
                            <Select
                                value={selectedTemplate}
                                onValueChange={setSelectedTemplate}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select template" />
                                </SelectTrigger>
                                <SelectContent>
                                    {timelineInfo.templates.map((template) => (
                                        <SelectItem key={template.value} value={template.value}>
                                            {template.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {activeSteps[currentStep]?.title === "Speakers" && (
                        <ScrollArea className="max-h-[300px] pr-3">
                            <div className="space-y-3">
                                {localSpeakers.map((speaker, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center gap-3 rounded-lg border p-3"
                                    >
                                        <div className="shrink-0">
                                            <ColorPopover
                                                label="Unique Colour"
                                                enabled={speaker.fill.enabled}
                                                onEnabledChange={(enabled: boolean) => {
                                                    const newSpeakers = [...localSpeakers]
                                                    newSpeakers[index] = {
                                                        ...newSpeakers[index],
                                                        fill: { ...newSpeakers[index].fill, enabled },
                                                    }
                                                    setLocalSpeakers(newSpeakers)
                                                }}
                                                color={speaker.fill.color}
                                                onColorChange={(color: string) => updateSpeakerColor(index, color)}
                                                presetColors={PRESET_COLORS}
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{speaker.name}</p>
                                            <p className="text-xs text-muted-foreground font-mono">{speaker.fill.color}</p>
                                        </div>
                                        <div className="shrink-0">
                                            <Select
                                                value={speaker.track || settings.selectedOutputTrack}
                                                onValueChange={(value) => {
                                                    const newSpeakers = [...localSpeakers]
                                                    newSpeakers[index] = {
                                                        ...newSpeakers[index],
                                                        track: value
                                                    }
                                                    setLocalSpeakers(newSpeakers)
                                                }}
                                            >
                                                <SelectTrigger className="w-32">
                                                    <SelectValue placeholder="Track" />
                                                </SelectTrigger>
                                                <SelectContent align="end">
                                                    {timelineInfo.outputTracks.map((track) => (
                                                        <SelectItem key={track.value} value={track.value}>
                                                            {track.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}

                    {activeSteps[currentStep]?.title === "Output Track" && (
                        <div className="space-y-3">
                            <label className="text-sm font-medium">Output Track</label>
                            <Select
                                value={selectedOutputTrack}
                                onValueChange={setSelectedOutputTrack}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select output track" />
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
                    )}
                </div>

                <DialogFooter className="flex flex-row justify-between sm:justify-between gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            if (currentStep === 0) {
                                setOpen(false)
                            } else {
                                setCurrentStep((prev) => prev - 1)
                            }
                        }}
                        disabled={isSubmitting}
                    >
                        {currentStep === 0 ? "Cancel" : (
                            <>
                                <ChevronLeft className="w-4 h-4" />
                                Back
                            </>
                        )}
                    </Button>
                    {currentStep < totalSteps - 1 ? (
                        <Button
                            type="button"
                            onClick={() => setCurrentStep((prev) => prev + 1)}
                            disabled={!canProceed()}
                        >
                            Next
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting || !canProceed()}
                        >
                            {isSubmitting ? (
                            <>
                                <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                Adding...
                            </>
                        ) : "Add to Timeline"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
