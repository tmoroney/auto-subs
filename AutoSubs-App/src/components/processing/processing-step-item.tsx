import { Spinner } from "@/components/ui/spinner"
import { CircleX, Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ProcessingStepProps {
    title: string;
    /** Extra real-world detail discovered during the run, e.g. "3 speakers". */
    detail?: string;
    progress: number;
    isActive: boolean;
    isCompleted: boolean;
    isCancelled?: boolean;
    /** Hides the rail connector below the icon on the final row. */
    isLast?: boolean;
}

/**
 * A single row in the vertical processing stepper.
 *
 * Completed steps collapse to one line so the list stays short as the run
 * progresses; only the active step gets a progress bar. Nothing here animates
 * beyond the spinner — the status surface deliberately carries no motion, since
 * all the real content lives in the transcript panel.
 */
export function ProcessingStepItem({
    title,
    detail,
    progress,
    isActive,
    isCompleted,
    isCancelled = false,
    isLast = false,
}: ProcessingStepProps) {
    const isPending = !isActive && !isCompleted && !isCancelled

    return (
        <div className="flex gap-2.5">
            {/* Rail: status icon plus the connector down to the next step. */}
            <div className="flex flex-col items-center">
                <div className="flex size-6 shrink-0 items-center justify-center">
                    {isCompleted ? (
                        <div className="flex size-6 items-center justify-center rounded-full bg-primary/10">
                            <Check className="size-3.5 text-primary" strokeWidth={3} />
                        </div>
                    ) : isCancelled ? (
                        <CircleX className="size-4.5 text-destructive" />
                    ) : isActive ? (
                        <Spinner className="size-4.5 text-primary" />
                    ) : (
                        <div className="size-2.5 rounded-full bg-muted-foreground/30" />
                    )}
                </div>
                {!isLast && <div className="w-px flex-1 bg-border" />}
            </div>

            <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-3")}>
                <div className="flex items-baseline justify-between gap-2">
                    <span
                        className={cn(
                            "truncate text-base",
                            isActive && "font-medium",
                            (isCompleted || isCancelled) && "text-muted-foreground",
                            isPending && "text-muted-foreground/60",
                        )}
                    >
                        {title}
                    </span>
                    {isActive && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {Math.round(progress)}%
                        </span>
                    )}
                </div>

                {/* Only the active step gets a bar. Completed steps showing a full
                    bar was pure redundancy against the check icon. */}
                {isActive && (
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
                            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                        />
                    </div>
                )}

                {detail && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
                )}
            </div>
        </div>
    )
}
