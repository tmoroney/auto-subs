import {
    Item,
    ItemContent,
    ItemMedia,
    ItemTitle,
} from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { CircleX, CircleCheck } from "lucide-react"
import { CompletionStepItem } from "./completion-step-item"
import { SegmentPreview } from "./segment-preview"
import { Settings, TimelineInfo } from "@/types/interfaces"

export interface ProcessingStepProps {
    title: string;
    progress: number;
    isActive: boolean;
    isCompleted: boolean;
    isCancelled?: boolean;
    id?: string;
    onExportToFile?: () => void;
    onAddToTimeline?: (selectedOutputTrack: string, selectedTemplate: string) => Promise<void>;
    livePreviewSegments?: any[];
    settings?: Settings;
    timelineInfo?: TimelineInfo;
}

export function ProcessingStepItem({
    title,
    progress,
    isActive,
    isCompleted,
    isCancelled = false,
    id,
    onExportToFile,
    onAddToTimeline,
    livePreviewSegments = [],
    settings,
    timelineInfo
}: ProcessingStepProps) {
    // If this is the completion step, render the special completion component
    if (id === 'Complete' && onExportToFile && onAddToTimeline && settings && timelineInfo) {
        return <CompletionStepItem onExportToFile={onExportToFile} onAddToTimeline={onAddToTimeline} settings={settings} timelineInfo={timelineInfo} />;
    }

    return (
        <div className="flex w-full flex-col">
            <Item variant={isCompleted ? "muted" : "outline"}>
                <ItemMedia>
                    {isCompleted ? (
                        <CircleCheck className="text-primary" />
                    ) : isCancelled ? (
                        <CircleX className="text-destructive" />
                    ) : (
                        <Spinner className={isActive ? "text-primary" : "text-muted-foreground"} />
                    )}
                </ItemMedia>
                <ItemContent>
                    <ItemTitle className={isCompleted || isCancelled ? "text-muted-foreground line-clamp-1" : "line-clamp-1"}>
                        {title}
                    </ItemTitle>
                </ItemContent>
                <ItemContent className="flex-none justify-end">
                    <span className="text-sm tabular-nums">{Math.round(progress)}%</span>
                </ItemContent>
                {/* Show live preview for Transcribe step */}
                {id === 'Transcribe' && isActive && livePreviewSegments.length > 0 && (
                    <ItemContent className="w-full bg-muted/50 rounded-xl overflow-y-auto">
                        <SegmentPreview 
                            segments={livePreviewSegments} 
                            isActive={isActive} 
                        />
                    </ItemContent>
                )}
            </Item>
        </div>
    )
}
