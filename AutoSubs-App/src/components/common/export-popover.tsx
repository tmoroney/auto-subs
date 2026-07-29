import * as React from "react"
import { Captions, FileText, LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useTranslation } from "react-i18next"

export type ExportFormat = 'srt' | 'txt';

interface ExportFormatConfig {
    format: ExportFormat
    icon: LucideIcon
    titleKey: string
    descriptionKey: string
    ariaLabelKey: string
}

interface ExportPopoverProps {
    onExport?: (format: ExportFormat) => Promise<void>
    hasSubtitles: boolean
    trigger?: React.ReactNode
}

const EXPORT_FORMATS: ExportFormatConfig[] = [
    {
        format: 'srt',
        icon: Captions,
        titleKey: 'importExport.exportFormats.srt.title',
        descriptionKey: 'importExport.exportFormats.srt.description',
        ariaLabelKey: 'importExport.exportAsSrt',
    },
    {
        format: 'txt',
        icon: FileText,
        titleKey: 'importExport.exportFormats.txt.title',
        descriptionKey: 'importExport.exportFormats.txt.description',
        ariaLabelKey: 'importExport.exportAsTxt',
    },
]

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

        if (!hasSubtitles) {
            return null;
        }

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
                        {EXPORT_FORMATS.map(({ format, icon: Icon, titleKey, descriptionKey, ariaLabelKey }) => (
                            <Button
                                key={format}
                                variant="outline"
                                className="h-auto w-full justify-start border px-4 py-3 hover:border-primary hover:bg-primary/10 bg-card"
                                onClick={() => handleExport(format)}
                                aria-label={t(ariaLabelKey)}
                                type="button"
                                disabled={!hasSubtitles}
                            >
                                <div className="flex w-full items-start gap-3 text-left">
                                    <Icon className="mt-0.5 size-4 shrink-0" />
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="text-sm font-medium">{t(titleKey)}</div>
                                        <div className="whitespace-normal break-words text-xs font-normal leading-4 text-muted-foreground">
                                            {t(descriptionKey)}
                                        </div>
                                    </div>
                                </div>
                            </Button>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>
        )
    }
)
ExportPopover.displayName = "ExportPopover"
