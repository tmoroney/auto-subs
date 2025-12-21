import { Button } from "@/components/ui/button"
import {
    Item,
    ItemContent,
    ItemDescription,
    ItemFooter,
    ItemTitle,
} from "@/components/ui/item"
import { Download, Plus } from "lucide-react"
import { AddToTimelineDialog } from "./add-to-timeline-dialog"
import { Settings, TimelineInfo } from "@/types/interfaces"

export interface CompletionStepProps {
    onExportToFile: () => void;
    onAddToTimeline: (selectedOutputTrack: string, selectedTemplate: string) => Promise<void>;
    settings: Settings;
    timelineInfo: TimelineInfo;
}

export function CompletionStepItem({
    onExportToFile,
    onAddToTimeline,
    settings,
    timelineInfo
}: CompletionStepProps) {
    return (
        <div className="flex w-full flex-col gap-2">
            <Item variant="default" className="bg-muted/30 border-muted-foreground/20">
                <ItemContent className="px-2">
                    <ItemTitle>
                        Processing Complete
                    </ItemTitle>
                    <ItemDescription>
                        Your subtitles are ready to use!
                    </ItemDescription>
                </ItemContent>
                <ItemFooter>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onExportToFile}
                            className="flex items-center gap-2"
                        >
                            <Download className="h-3 w-3" />
                            Export to File
                        </Button>
                        <AddToTimelineDialog
                            settings={settings}
                            timelineInfo={timelineInfo}
                            onAddToTimeline={onAddToTimeline}
                        >
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex items-center gap-2"
                            >
                                <Plus className="h-3 w-3" />
                                Add to Timeline
                            </Button>
                        </AddToTimelineDialog>
                    </div>
                </ItemFooter>
            </Item>
        </div>
    )
}
