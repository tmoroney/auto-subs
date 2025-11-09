import { Progress } from "@/components/ui/progress"
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemFooter,
    ItemMedia,
    ItemTitle,
} from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { CompletionStepItem } from "./completion-step-item"

export interface ProcessingStepProps {
    title: string;
    description: string;
    progress: number;
    isActive: boolean;
    isCompleted: boolean;
    id?: string;
    onExportToFile?: () => void;
    onAddToTimeline?: () => void;
}

export function ProcessingStepItem({
    title,
    description,
    progress,
    isActive,
    isCompleted,
    id,
    onExportToFile,
    onAddToTimeline
}: ProcessingStepProps) {
    // If this is the completion step, render the special completion component
    if (id === 'completion' && onExportToFile && onAddToTimeline) {
        return <CompletionStepItem onExportToFile={onExportToFile} onAddToTimeline={onAddToTimeline} />;
    }

    return (
        <div className="flex w-full flex-col gap-2">
            <Item 
                variant={isCompleted ? "default" : "outline"}
                className={isCompleted ? "bg-muted/30 border-muted-foreground/20" : ""}
            >
                <ItemMedia variant="icon">
                    {isCompleted ? (
                        <div className="w-4 h-4 rounded-full bg-muted-foreground/60 flex items-center justify-center">
                            <svg className="w-3 h-3 text-background" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                                <path d="M5 13l4 4L19 7"></path>
                            </svg>
                        </div>
                    ) : (
                        <Spinner className={isActive ? "text-primary" : "text-muted-foreground"} />
                    )}
                </ItemMedia>
                <ItemContent>
                    <ItemTitle className={isCompleted ? "text-muted-foreground" : ""}>
                        {title}
                    </ItemTitle>
                    <ItemDescription>
                        {description}
                    </ItemDescription>
                </ItemContent>
                <ItemActions className="hidden sm:flex">
                    <div className="text-xs font-medium text-muted-foreground">
                        {Math.round(progress)}%
                    </div>
                </ItemActions>
                <ItemFooter>
                    <Progress 
                        value={progress} 
                        className={isCompleted ? "bg-muted/50" : ""}
                    />
                </ItemFooter>
            </Item>
        </div>
    )
}
