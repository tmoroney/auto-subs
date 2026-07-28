import * as React from "react"
import { Button } from "@/components/ui/button"
import {
    Item,
    ItemContent,
    ItemDescription,
    ItemFooter,
    ItemTitle,
} from "@/components/ui/item"
import { Check, Download, FileText, Loader2, Plus, VolumeX } from "lucide-react"
import { AddToTimelineDialog } from "@/components/dialogs/add-to-timeline-dialog"
import { ExportPopover } from "@/components/common/export-popover"
import { TimelineInfo } from "@/types"
import { useResolve } from "@/contexts/ResolveContext"
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext"
import { useIsMobile } from "@/hooks/use-mobile"
import { useTranslation } from "react-i18next"

export interface CompletionStepProps {
    onExportToFile: () => void;
    onAddToTimeline: (selectedOutputTrack: string, selectedTemplate: string, presetSettings?: Record<string, unknown>) => Promise<void>;
    onViewSubtitles?: () => void;
    isSubtitleViewerOpen?: boolean;
    timelineInfo: TimelineInfo;
    selectedIntegration?: "davinci" | "premiere" | "aftereffects";
}

export function CompletionStepItem({
    onAddToTimeline,
    onViewSubtitles,
    isSubtitleViewerOpen = false,
    timelineInfo,
    selectedIntegration
}: CompletionStepProps) {
    const { t } = useTranslation()
    const isMobile = useIsMobile()
    const {
        templates: resolveTemplates,
        templatesLoading: resolveTemplatesLoading,
        templatesLoaded: resolveTemplatesLoaded,
        refreshTemplates: refreshResolveTemplates,
    } = useResolve()
    const {
        subtitles,
        speakers,
        exportSubtitlesAs,
    } = useSubtitleDocument()

    const isResolveConnected = Boolean(timelineInfo?.timelineId) && selectedIntegration === "davinci"
    const isAdobeConnected = Boolean(timelineInfo?.timelineId) && (selectedIntegration === "premiere" || selectedIntegration === "aftereffects")
    const isAdobe = selectedIntegration === "premiere" || selectedIntegration === "aftereffects"
    const hasSubtitles = subtitles.length > 0

    const [isAddingToTimeline, setIsAddingToTimeline] = React.useState(false)
    const [hasCompletedAdding, setHasCompletedAdding] = React.useState(false)

    const handleAddToTimeline = async (
        selectedOutputTrack: string,
        selectedTemplate: string,
        presetSettings?: Record<string, unknown>,
    ) => {
        setHasCompletedAdding(false)
        setIsAddingToTimeline(true)
        try {
            await onAddToTimeline(selectedOutputTrack, selectedTemplate, presetSettings)
        } finally {
            setIsAddingToTimeline(false)
        }
    }

    return (
        <div className="flex w-full flex-col gap-2">
            <Item variant="default" className="bg-muted/30 border-muted-foreground/20">
                <ItemContent className="px-2">
                    <ItemTitle>
                        {t("completion.processingComplete")}
                    </ItemTitle>
                    <ItemDescription>
                        {hasSubtitles ? (
                            t("completion.subtitlesReady")
                        ) : (
                            <span className="flex items-center gap-2">
                                <VolumeX className="size-4 shrink-0 text-muted-foreground" />
                                {t("completion.noSpeechDetected")}
                            </span>
                        )}
                    </ItemDescription>
                </ItemContent>
                {hasSubtitles && (
                    <ItemFooter>
                        <div className="flex gap-2">
                            {onViewSubtitles && !isSubtitleViewerOpen && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={onViewSubtitles}
                                  className="flex items-center gap-2"
                                >
                                  <FileText />
                                  {t("completion.viewSubtitles")}
                                </Button>
                            )}
                            {(!isResolveConnected || !isMobile) && (
                                <ExportPopover
                                    onExport={(format) => exportSubtitlesAs(format, subtitles, speakers)}
                                    hasSubtitles={hasSubtitles}
                                    trigger={
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="flex items-center gap-2"
                                        >
                                            <Download />
                                            {t("completion.exportToFile")}
                                        </Button>
                                    }
                                />
                            )}
                            {(isResolveConnected || isAdobeConnected) && (
                                <AddToTimelineDialog
                                    timelineInfo={timelineInfo}
                                    templates={isAdobe ? [] : resolveTemplates}
                                    templatesLoading={!isAdobe && resolveTemplatesLoading}
                                    templatesLoaded={isAdobe || resolveTemplatesLoaded}
                                    onLoadTemplates={isAdobe ? undefined : refreshResolveTemplates}
                                    onAddToTimeline={handleAddToTimeline}
                                    onSuccess={() => setHasCompletedAdding(true)}
                                    selectedIntegration={selectedIntegration}

                                >
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex items-center gap-2"
                                        disabled={isAddingToTimeline}
                                    >
                                        {isAddingToTimeline ? (
                                            <>
                                                <Loader2 className="size-4 animate-spin" />
                                                {t("addToTimeline.adding")}
                                            </>
                                        ) : hasCompletedAdding ? (
                                            <>
                                                <Check className="size-4" />
                                                Added to Timeline
                                            </>
                                        ) : (
                                            <>
                                                <Plus />
                                                {t("completion.addToTimeline")}
                                            </>
                                        )}
                                    </Button>
                                </AddToTimelineDialog>
                            )}
                        </div>
                    </ItemFooter>
                )}
            </Item>
        </div>
    )
}
