import * as React from "react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
    Check,
    ClipboardPaste,
    Download,
    FileUp,
    MoreHorizontal,
    Pencil,
    Play,
    Plus,
    Trash2,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { CaptionPreset } from "@/types"
import { open, save } from "@tauri-apps/plugin-dialog"
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { downloadDir } from "@tauri-apps/api/path"
import { toast } from "sonner"

interface AnimatedPresetPickerProps {
    presets: CaptionPreset[]
    selectedPresetId: string
    onSelect: (id: string) => void
    onRequestCreate: () => void
    onRequestEdit: (preset: CaptionPreset) => void
    onRequestPreview?: (preset: CaptionPreset) => void
    onDelete: (id: string) => Promise<void> | void
    onImportJson: (json: string) => Promise<CaptionPreset>
    onExportJson: (id: string) => string
    onDuplicate: (preset: CaptionPreset) => Promise<void> | void
    previewLoadingId?: string | null
}

/**
 * Grid of animated caption presets with an overflow menu per user preset and
 * an `+ New preset` tile that triggers the create flow.
 */
export function AnimatedPresetPicker({
    presets,
    selectedPresetId,
    onSelect,
    onRequestCreate,
    onRequestEdit,
    onRequestPreview,
    onDelete,
    onImportJson,
    onExportJson,
    onDuplicate,
    previewLoadingId,
}: AnimatedPresetPickerProps) {
    const { t } = useTranslation()
    const [pendingDelete, setPendingDelete] = React.useState<CaptionPreset | null>(null)
    const [pasteOpen, setPasteOpen] = React.useState(false)
    const [pasteValue, setPasteValue] = React.useState("")
    const [pasteError, setPasteError] = React.useState<string | null>(null)

    async function handleImportFromFile() {
        const file = await open({
            multiple: false,
            directory: false,
            filters: [{ name: "JSON", extensions: ["json"] }],
        })
        if (!file) return
        try {
            const json = await readTextFile(file as string)
            await onImportJson(json)
            toast.success(t("addToTimeline.preset.import"))
        } catch (err: any) {
            toast.error(err?.message ?? t("addToTimeline.preset.errors.invalidJson"))
        }
    }

    async function handlePasteImport() {
        setPasteError(null)
        try {
            await onImportJson(pasteValue)
            setPasteOpen(false)
            setPasteValue("")
            toast.success(t("addToTimeline.preset.import"))
        } catch (err: any) {
            setPasteError(err?.message ?? t("addToTimeline.preset.errors.invalidJson"))
        }
    }

    async function handleExport(preset: CaptionPreset) {
        try {
            const json = onExportJson(preset.id)
            const defaultPath = `${await downloadDir()}/${slug(preset.name)}.autosubs-preset.json`
            const target = await save({
                defaultPath,
                filters: [{ name: "JSON", extensions: ["json"] }],
            })
            if (!target) return
            await writeTextFile(target, json)
            toast.success(t("addToTimeline.preset.export"))
        } catch (err: any) {
            toast.error(err?.message ?? "Export failed")
        }
    }

    return (
        <>
            {/* Top action row: import + paste */}
            <div className="flex items-center justify-end gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setPasteOpen(true)}
                >
                    <ClipboardPaste className="h-3.5 w-3.5" />
                    {t("addToTimeline.preset.paste")}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleImportFromFile}
                >
                    <FileUp className="h-3.5 w-3.5" />
                    {t("addToTimeline.preset.import")}
                </Button>
            </div>

            <ScrollArea className="h-[240px] rounded-md border">
                <div className="p-2 grid grid-cols-2 gap-2">
                    {/* Create new tile */}
                    <button
                        type="button"
                        onClick={onRequestCreate}
                        className="group relative flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-muted-foreground/30 bg-card/50 p-3 text-sm transition-colors hover:border-primary/60 hover:bg-primary/5"
                    >
                        <Plus className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
                        <div className="font-medium text-sm">
                            {t("addToTimeline.preset.new")}
                        </div>
                        <div className="text-[11px] text-muted-foreground text-center leading-tight">
                            {t("addToTimeline.preset.newDescription")}
                        </div>
                    </button>

                    {presets.map((preset) => (
                        <PresetCard
                            key={preset.id}
                            preset={preset}
                            selected={selectedPresetId === preset.id}
                            onSelect={() => onSelect(preset.id)}
                            onPreview={onRequestPreview ? () => onRequestPreview(preset) : undefined}
                            isPreviewLoading={previewLoadingId === preset.id}
                            onEdit={() => onRequestEdit(preset)}
                            onDuplicate={() => onDuplicate(preset)}
                            onExport={() => handleExport(preset)}
                            onRequestDelete={() => setPendingDelete(preset)}
                        />
                    ))}
                </div>
            </ScrollArea>

            {/* Delete confirmation */}
            <AlertDialog
                open={!!pendingDelete}
                onOpenChange={(o) => !o && setPendingDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("addToTimeline.preset.confirmDeleteTitle")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("addToTimeline.preset.confirmDelete")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {t("addToTimeline.preset.action.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                if (pendingDelete) await onDelete(pendingDelete.id)
                                setPendingDelete(null)
                            }}
                        >
                            {t("addToTimeline.preset.confirmDeleteConfirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Paste JSON modal */}
            <Dialog
                open={pasteOpen}
                onOpenChange={(o) => {
                    setPasteOpen(o)
                    if (!o) {
                        setPasteValue("")
                        setPasteError(null)
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("addToTimeline.preset.importTitle")}</DialogTitle>
                        <DialogDescription>
                            {t("addToTimeline.preset.paste")}
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        value={pasteValue}
                        onChange={(e) => setPasteValue(e.target.value)}
                        placeholder={t("addToTimeline.preset.importPlaceholder")}
                        rows={8}
                        className="font-mono text-xs"
                    />
                    {pasteError && (
                        <p className="text-xs text-destructive">{pasteError}</p>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPasteOpen(false)}
                        >
                            {t("addToTimeline.preset.action.cancel")}
                        </Button>
                        <Button
                            type="button"
                            onClick={handlePasteImport}
                            disabled={!pasteValue.trim()}
                        >
                            {t("addToTimeline.preset.importSubmit")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

interface PresetCardProps {
    preset: CaptionPreset
    selected: boolean
    isPreviewLoading?: boolean
    onSelect: () => void
    onPreview?: () => void
    onEdit: () => void
    onDuplicate: () => void
    onExport: () => void
    onRequestDelete: () => void
}

function PresetCard({
    preset,
    selected,
    isPreviewLoading,
    onSelect,
    onPreview,
    onEdit,
    onDuplicate,
    onExport,
    onRequestDelete,
}: PresetCardProps) {
    const { t } = useTranslation()

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={preset.name}
            aria-pressed={selected}
            onClick={onSelect}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onSelect()
                }
            }}
            className={`group relative flex min-h-[96px] cursor-pointer flex-col justify-between rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-muted/60"
            }`}
        >
            {selected && (
                <div className="absolute right-2 top-2 rounded-full bg-primary p-0.5 text-primary-foreground">
                    <Check className="h-3 w-3" />
                </div>
            )}
            <div className="space-y-1 pr-6">
                <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium leading-tight">
                        {preset.name}
                    </span>
                </div>
                {preset.description && (
                    <p className="text-[11px] text-muted-foreground leading-tight line-clamp-2">
                        {preset.description}
                    </p>
                )}
                {preset.builtIn && (
                    <span className="inline-block text-[10px] text-muted-foreground uppercase tracking-wide">
                        {t("addToTimeline.preset.builtIn")}
                    </span>
                )}
            </div>

            <div className="mt-2 flex items-center justify-between gap-1">
                {onPreview ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={(e) => {
                            e.stopPropagation()
                            onPreview()
                        }}
                        disabled={isPreviewLoading}
                    >
                        {isPreviewLoading ? (
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                            <Play className="h-3 w-3" />
                        )}
                        {t("addToTimeline.preset.preview")}
                    </Button>
                ) : (
                    <span />
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        {!preset.builtIn && (
                            <DropdownMenuItem onClick={onEdit}>
                                <Pencil className="h-3.5 w-3.5" />
                                {t("addToTimeline.preset.edit")}
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={onDuplicate}>
                            <Plus className="h-3.5 w-3.5" />
                            {t("addToTimeline.preset.duplicate")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onExport}>
                            <Download className="h-3.5 w-3.5" />
                            {t("addToTimeline.preset.export")}
                        </DropdownMenuItem>
                        {!preset.builtIn && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={onRequestDelete}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    {t("addToTimeline.preset.delete")}
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}

function slug(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        || "preset"
}
