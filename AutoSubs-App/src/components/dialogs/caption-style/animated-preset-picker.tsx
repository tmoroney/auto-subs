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
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  ClipboardPaste,
  Download,
  Ellipsis,
  FileUp,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { CaptionPreset } from "@/types";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { downloadDir } from "@tauri-apps/api/path";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PresetThumbnail } from "@/components/dialogs/caption-style/preset-thumbnail";

interface AnimatedPresetPickerProps {
  presets: CaptionPreset[];
  selectedPresetId: string;
  onSelect: (id: string) => void;
  onRequestEdit: (preset: CaptionPreset) => void;
  onRequestPreview?: (preset: CaptionPreset) => void;
  onDelete: (id: string) => Promise<void> | void;
  onExportJson: (id: string) => string;
  onDuplicate: (preset: CaptionPreset) => Promise<void> | void;
  onImportJson?: (json: string) => Promise<CaptionPreset>;
  previewLoadingId?: string | null;
  onRequestCreate?: () => void;
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
  onImportJson,
  previewLoadingId,
  onRequestCreate,
}: AnimatedPresetPickerProps) {
  const { t } = useTranslation();
  const [pendingDelete, setPendingDelete] =
    React.useState<CaptionPreset | null>(null);
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasteValue, setPasteValue] = React.useState("");
  const [pasteError, setPasteError] = React.useState<string | null>(null);

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

  async function handleImportFromFile() {
    if (!onImportJson) return;
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
    if (!onImportJson) return;
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
      <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
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
        {onRequestCreate && (
          <NewPresetCard
            onCreate={onRequestCreate}
            onImportFromFile={handleImportFromFile}
            onPasteImport={() => setPasteOpen(true)}
            canImport={!!onImportJson}
          />
        )}
      </div>

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

      {/* Paste JSON import */}
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
    <Card
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
      title={preset.description || preset.name}
      className={cn(
        "group cursor-pointer overflow-hidden p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary ring-1 ring-primary",
      )}
    >
      <PresetThumbnail
        preset={preset}
        selected={selected}
        className="aspect-video h-auto w-full rounded-none border-0"
      />
      <div className="flex items-center gap-1 px-2 py-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          {preset.name}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
              aria-label={t("common.edit", "Edit")}
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {onPreview && (
              <DropdownMenuItem
                onClick={onPreview}
                disabled={isPreviewLoading}
              >
                <Play />
                {t("addToTimeline.preset.preview")}
              </DropdownMenuItem>
            )}
            {!preset.builtIn && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil />
                {t("common.edit", "Edit")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDuplicate}>
              <Plus />
              {t("addToTimeline.preset.duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExport}>
              <Download />
              {t("addToTimeline.preset.export")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCopyJson}>
              <ClipboardPaste />
              {t("addToTimeline.preset.copyJson")}
            </DropdownMenuItem>
            {!preset.builtIn && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onRequestDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 />
                  {t("addToTimeline.preset.delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}

interface NewPresetCardProps {
  onCreate: () => void;
  onImportFromFile: () => void;
  onPasteImport: () => void;
  canImport: boolean;
}

function NewPresetCard({
  onCreate,
  onImportFromFile,
  onPasteImport,
  canImport,
}: NewPresetCardProps) {
  const { t } = useTranslation();

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={t("addToTimeline.preset.new", "New Preset")}
      onClick={onCreate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCreate();
        }
      }}
      className="group cursor-pointer overflow-hidden border-dashed p-0 text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex aspect-video h-auto w-full items-center justify-center bg-muted/30">
        <Plus className="size-6 group-hover:text-foreground" />
      </div>
      <div className="flex items-center gap-1 px-2 py-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          {t("addToTimeline.preset.new", "New Preset")}
        </span>
        {canImport && (
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={(e) => {
                e.stopPropagation();
                onPasteImport();
              }}
              aria-label={t("addToTimeline.preset.paste")}
              title={t("addToTimeline.preset.paste")}
            >
              <ClipboardPaste />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={(e) => {
                e.stopPropagation();
                onImportFromFile();
              }}
              aria-label={t("addToTimeline.preset.import")}
              title={t("addToTimeline.preset.import")}
            >
              <FileUp />
            </Button>
          </div>
        )}
      </div>
    </Card>
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
