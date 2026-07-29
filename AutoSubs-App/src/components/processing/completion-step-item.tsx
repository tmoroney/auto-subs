import { Button } from "@/components/ui/button"
import {
    Item,
    ItemContent,
    ItemDescription,
    ItemFooter,
    ItemTitle,
} from "@/components/ui/item"
import { Download, FileText, Send, VolumeX } from "lucide-react"
import { ExportPopover } from "@/components/common/export-popover"
import { TimelineInfo } from "@/types"
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext"
import { useOutputPanelStore } from "@/stores/output-panel-store"
import { useIsMobile } from "@/hooks/use-mobile"
import { useTranslation } from "react-i18next"

export interface CompletionStepProps {
    onExportToFile: () => void;
    onViewSubtitles?: () => void;
    isSubtitleViewerOpen?: boolean;
    timelineInfo: TimelineInfo;
    selectedIntegration?: "davinci" | "premiere" | "aftereffects";
}

export function CompletionStepItem({
    onViewSubtitles,
    isSubtitleViewerOpen = false,
    timelineInfo,
    selectedIntegration
}: CompletionStepProps) {
    const { t } = useTranslation()
    const isMobile = useIsMobile()
    const openOutputPanel = useOutputPanelStore((s) => s.open)
    const {
        subtitles,
        speakers,
        exportSubtitlesAs,
    } = useSubtitleDocument()

    const isResolveConnected = Boolean(timelineInfo?.timelineId) && selectedIntegration === "davinci"
    const isAdobeConnected = Boolean(timelineInfo?.timelineId) && (selectedIntegration === "premiere" || selectedIntegration === "aftereffects")
    const hasSubtitles = subtitles.length > 0

    // Sending happens in the viewer's output sheet, where the settings are
    // visible. This button navigates there rather than committing, so it is
    // labelled for what it actually does.
    function handleReviewAndSend() {
        openOutputPanel()
        onViewSubtitles?.()
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
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2"
                                    onClick={handleReviewAndSend}
                                >
                                    <Send />
                                    {t("output.reviewAndSend")}
                                </Button>
                            )}
                        </div>
                    </ItemFooter>
                )}
            </Item>
        </div>
    )
}
