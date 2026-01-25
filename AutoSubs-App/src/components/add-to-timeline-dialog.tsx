import { useState } from "react"
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
import { Settings, TimelineInfo } from "@/types/interfaces"

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
    const [open, setOpen] = useState(false)
    const [selectedOutputTrack, setSelectedOutputTrack] = useState(settings.selectedOutputTrack)
    const [selectedTemplate, setSelectedTemplate] = useState(settings.selectedTemplate.value)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async () => {
        setIsSubmitting(true)
        try {
            await onAddToTimeline(selectedOutputTrack, selectedTemplate)
            setOpen(false)
        } catch (error) {
            console.error('Failed to add to timeline:', error)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add to Timeline</DialogTitle>
                    <DialogDescription>
                        Choose the output track and template for your subtitles.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="output-track" className="text-right font-medium">
                            Output Track
                        </label>
                        <Select
                            value={selectedOutputTrack}
                            onValueChange={setSelectedOutputTrack}
                            disabled={isSubmitting}
                        >
                            <SelectTrigger className="col-span-3">
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
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="template" className="text-right font-medium">
                            Template
                        </label>
                        <Select
                            value={selectedTemplate}
                            onValueChange={setSelectedTemplate}
                            disabled={isSubmitting}
                        >
                            <SelectTrigger className="col-span-3">
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
                </div>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpen(false)}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? "Adding..." : "Add to Timeline"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
