import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  ClipboardPaste,
  Download,
  Ellipsis,
  FileUp,
  Pencil,
  Play,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { CaptionPreset } from "@/types";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { downloadDir } from "@tauri-apps/api/path";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AnimatedPresetPickerProps {
  presets: CaptionPreset[];
  selectedPresetId: string;
  onSelect: (id: string) => void;
  onRequestEdit: (preset: CaptionPreset) => void;
  onRequestPreview?: (preset: CaptionPreset) => void;
  onDelete: (id: string) => Promise<void> | void;
  onExportJson: (id: string) => string;
  onDuplicate: (preset: CaptionPreset) => Promise<void> | void;
  previewLoadingId?: string | null;
}

interface AnimatedPresetActionsProps {
  onRequestCreate: () => void;
  onImportJson: (json: string) => Promise<CaptionPreset>;
  className?: string;
}

export function AnimatedPresetActions({
  onRequestCreate,
  onImportJson,
  className,
}: AnimatedPresetActionsProps) {
  const { t } = useTranslation();
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasteValue, setPasteValue] = React.useState("");
  const [pasteError, setPasteError] = React.useState<string | null>(null);

  async function handleImportFromFile() {
    const file = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!file) return;
    try {
      const json = await readTextFile(file as string);
      await onImportJson(json);
      toast.success(t("addToTimeline.preset.import"));
    } catch (err: any) {
      toast.error(err?.message ?? t("addToTimeline.preset.errors.invalidJson"));
    }
  }

  async function handlePasteImport() {
    setPasteError(null);
    try {
      await onImportJson(pasteValue);
      setPasteOpen(false);
      setPasteValue("");
      toast.success(t("addToTimeline.preset.import"));
    } catch (err: any) {
      setPasteError(
        err?.message ?? t("addToTimeline.preset.errors.invalidJson"),
      );
    }
  }

  return (
    <>
      <div
        className={cn(
          "grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:shrink-0 sm:items-center sm:gap-1",
          className,
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full text-sm font-semibold sm:w-auto"
            >
              <Upload className="h-4 w-4" />
              {t("importExport.importTab")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setPasteOpen(true)}>
              <ClipboardPaste />
              {t("addToTimeline.preset.paste")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleImportFromFile}>
              <FileUp />
              {t("addToTimeline.preset.import")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          className="w-full text-sm font-semibold sm:w-auto"
          onClick={onRequestCreate}
        >
          <Plus className="h-4 w-4" />
          {t("addToTimeline.preset.new", "New Preset")}
        </Button>
      </div>

      <Dialog
        open={pasteOpen}
        onOpenChange={(o) => {
          setPasteOpen(o);
          if (!o) {
            setPasteValue("");
            setPasteError(null);
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
  );
}

/**
 * Full-width animated caption preset list with an overflow menu per preset.
 */
export function AnimatedPresetPicker({
  presets,
  selectedPresetId,
  onSelect,
  onRequestEdit,
  onRequestPreview,
  onDelete,
  onExportJson,
  onDuplicate,
  previewLoadingId,
}: AnimatedPresetPickerProps) {
  const { t } = useTranslation();
  const [pendingDelete, setPendingDelete] =
    React.useState<CaptionPreset | null>(null);

  async function handleExport(preset: CaptionPreset) {
    try {
      const json = onExportJson(preset.id);
      const defaultPath = `${await downloadDir()}/${slug(preset.name)}.autosubs-preset.json`;
      const target = await save({
        defaultPath,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!target) return;
      await writeTextFile(target, json);
      toast.success(t("addToTimeline.preset.export"));
    } catch (err: any) {
      toast.error(err?.message ?? "Export failed");
    }
  }

  async function handleCopyJson(preset: CaptionPreset) {
    try {
      const json = JSON.stringify(preset, null, 2);
      await navigator.clipboard.writeText(json);
      toast.success(t("addToTimeline.preset.copied"));
    } catch (err: any) {
      toast.error(err?.message ?? "Copy failed");
    }
  }

  return (
    <>
      <ScrollArea className="h-[296px] w-full">
        <div className="space-y-2 pr-3">
          {presets.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              selected={selectedPresetId === preset.id}
              onSelect={() => onSelect(preset.id)}
              onPreview={
                onRequestPreview ? () => onRequestPreview(preset) : undefined
              }
              isPreviewLoading={previewLoadingId === preset.id}
              onEdit={() => onRequestEdit(preset)}
              onDuplicate={() => onDuplicate(preset)}
              onExport={() => handleExport(preset)}
              onCopyJson={() => handleCopyJson(preset)}
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
                if (pendingDelete) await onDelete(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              {t("addToTimeline.preset.confirmDeleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}

interface PresetCardProps {
  preset: CaptionPreset;
  selected: boolean;
  isPreviewLoading?: boolean;
  onSelect: () => void;
  onPreview?: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onCopyJson: () => void;
  onRequestDelete: () => void;
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
  onCopyJson,
  onRequestDelete,
}: PresetCardProps) {
  const { t } = useTranslation();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={preset.name}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative flex min-h-[72px] cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-background hover:bg-muted/50",
      )}
    >
      <div
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30 bg-background",
        )}
      >
        {selected && <Check className="h-3 w-3" />}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold leading-tight text-foreground">
            {preset.name}
          </span>
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {preset.builtIn
              ? t("addToTimeline.preset.builtIn")
              : t("addToTimeline.preset.custom")}
          </span>
        </div>
        {preset.description && (
          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
            {preset.description}
          </p>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {onPreview && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
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
        )}
        {!preset.builtIn && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
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
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={onDuplicate}>
              <Plus className="h-3.5 w-3.5" />
              {t("addToTimeline.preset.duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExport}>
              <Download className="h-3.5 w-3.5" />
              {t("addToTimeline.preset.export")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCopyJson}>
              <ClipboardPaste className="h-3.5 w-3.5" />
              {t("addToTimeline.preset.copyJson")}
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
  );
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "preset"
  );
}
