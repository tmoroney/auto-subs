import { Button } from "@/components/ui/button"
import {
    Item,
    ItemContent,
    ItemDescription,
    ItemFooter,
    ItemMedia,
    ItemTitle,
} from "@/components/ui/item"
import { Download, Plus } from "lucide-react"

export interface CompletionStepProps {
    onExportToFile: () => void;
    onAddToTimeline: () => void;
}

export function CompletionStepItem({
    onExportToFile,
    onAddToTimeline
}: CompletionStepProps) {
    return (
        <div className="flex w-full flex-col gap-2">
            <Item variant="default" className="bg-muted/30 border-muted-foreground/20">
                <ItemMedia variant="icon">
                    <div className="w-4 h-4 rounded-full bg-muted-foreground/60 flex items-center justify-center">
                        <svg className="w-3 h-3 text-background" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                            <path d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                </ItemMedia>
                <ItemContent>
                    <ItemTitle className="text-muted-foreground">
                        Transcription Complete
                    </ItemTitle>
                    <ItemDescription>
                        Choose how to use your transcript
                    </ItemDescription>
                </ItemContent>
                <ItemFooter>
                    <div className="flex gap-2 mt-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onExportToFile}
                            className="flex items-center gap-2"
                        >
                            <Download className="h-3 w-3" />
                            Export to File
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onAddToTimeline}
                            className="flex items-center gap-2"
                        >
                            <Plus className="h-3 w-3" />
                            Add to Timeline
                        </Button>
                    </div>
                </ItemFooter>
            </Item>
        </div>
    )
}
