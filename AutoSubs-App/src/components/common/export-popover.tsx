import * as React from "react"
import { Captions, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useTranslation } from "react-i18next"

export type ExportFormat = 'srt' | 'txt';

interface ExportPopoverProps {
    onExport?: (format: ExportFormat) => Promise<void>
    hasSubtitles: boolean
    trigger?: React.ReactNode
}

export const ExportPopover = React.forwardRef<HTMLButtonElement, ExportPopoverProps>(
    ({ onExport, hasSubtitles, trigger }, ref) => {
        const { t } = useTranslation()
        const [isOpen, setIsOpen] = React.useState(false)

        const handleExport = async (format: ExportFormat) => {
            if (!onExport) return;
            setIsOpen(false);
            try {
                await onExport(format);
            } catch (error) {
                console.error("Failed to export file:", error);
            }
        };

        return (
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>
                    {trigger ?? (
                        <Button ref={ref} variant="outline" className="w-full flex items-center justify-center gap-2">
                            {t("importExport.exportTab")}
                        </Button>
                    )}
                </PopoverTrigger>
                <PopoverContent className="w-80 p-2">
                    <div className="space-y-2">
                        <Button
                            variant="outline"
                            className="h-auto w-full justify-start border px-4 py-3 hover:border-primary hover:bg-primary/10"
                            onClick={() => handleExport('srt')}
                            aria-label={t("importExport.exportAsSrt")}
                            type="button"
                            disabled={!hasSubtitles}
                        >
                            <div className="flex w-full items-start gap-3 text-left">
                                <Captions className="mt-0.5 size-4 shrink-0" />
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="text-sm font-medium">{t("importExport.exportFormats.srt.title")}</div>
                                    <div className="whitespace-normal break-words text-xs font-normal leading-4 text-muted-foreground">
                                        {t("importExport.exportFormats.srt.description")}
                                    </div>
                                </div>
                            </div>
                        </Button>
                        <Button
                            variant="outline"
                            className="h-auto w-full justify-start border px-4 py-3 hover:border-primary hover:bg-primary/10"
                            onClick={() => handleExport('txt')}
                            type="button"
                            disabled={!hasSubtitles}
                        >
                            <div className="flex w-full items-start gap-3 text-left">
                                <FileText className="mt-0.5 size-4 shrink-0" />
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="text-sm font-medium">{t("importExport.exportFormats.txt.title")}</div>
                                    <div className="whitespace-normal break-words text-xs font-normal leading-4 text-muted-foreground">
                                        {t("importExport.exportFormats.txt.description")}
                                    </div>
                                </div>
                            </div>
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>
        )
    }
)
ExportPopover.displayName = "ExportPopover"
