import {
    Item,
    ItemContent,
    ItemMedia,
    ItemTitle,
} from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { CircleX, CircleCheck } from "lucide-react"
import { CompletionStepItem } from "./completion-step-item"
import { TimelineInfo } from "@/types"

export interface ProcessingStepProps {
    title: string;
    description: string;
    progress: number;
    isActive: boolean;
    isCompleted: boolean;
    isCancelled?: boolean;
    id?: string;
    onExportToFile?: () => void;
    onAddToTimeline?: (selectedOutputTrack: string, selectedTemplate: string, presetSettings?: Record<string, unknown>) => Promise<void>;
    onViewSubtitles?: () => void;
    isSubtitleViewerOpen?: boolean;
    timelineInfo?: TimelineInfo;
    selectedIntegration?: "davinci" | "premiere" | "aftereffects";
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
    onViewSubtitles,
    isSubtitleViewerOpen = false,
    timelineInfo,
    selectedIntegration
}: ProcessingStepProps) {
    if (id === 'Complete' && onExportToFile && onAddToTimeline && timelineInfo) {
        return <CompletionStepItem onExportToFile={onExportToFile} onAddToTimeline={onAddToTimeline} onViewSubtitles={onViewSubtitles} isSubtitleViewerOpen={isSubtitleViewerOpen} timelineInfo={timelineInfo} selectedIntegration={selectedIntegration} />;
    }

    return (
        <div className="flex w-full flex-col gap-1.5">
            <Item variant="outline">
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
            </Item>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                    style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                />
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">{description}</p>
        </div>
    )
}
