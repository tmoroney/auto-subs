import { Progress } from "@/components/ui/progress"
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

export interface ProcessingStepProps {
    title: string;
    description: string;
    progress: number;
    isActive: boolean;
    isCompleted: boolean;
    isCancelled?: boolean;
    id?: string;
    onExportToFile?: () => void;
    onAddToTimeline?: () => void;
    livePreviewSegments?: any[];
}

export function ProcessingStepItem({
    title,
    description,
    progress,
    isActive,
    isCompleted,
    isCancelled = false,
    id,
    onExportToFile,
    onAddToTimeline,
    livePreviewSegments = []
}: ProcessingStepProps) {
    // If this is the completion step, render the special completion component
    if (id === 'Complete' && onExportToFile && onAddToTimeline) {
        return <CompletionStepItem onExportToFile={onExportToFile} onAddToTimeline={onAddToTimeline} />;
    }

    return (
        <div className="flex w-full flex-col [--radius:1rem]">
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
