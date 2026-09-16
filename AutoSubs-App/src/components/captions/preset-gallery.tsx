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
  Image as ImageIcon,
  Pencil,
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
import { PresetThumbnail } from "@/components/captions/preset-thumbnail";

interface PresetGalleryProps {
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
export function PresetGallery({
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
}: PresetGalleryProps) {
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
      toast.success(t("captions.preset.export"));
    } catch (err: any) {
      toast.error(err?.message ?? "Export failed");
    }
  }

  async function handleCopyJson(preset: CaptionPreset) {
    try {
      const json = JSON.stringify(preset, null, 2);
      await navigator.clipboard.writeText(json);
      toast.success(t("captions.preset.copied"));
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
      toast.success(t("captions.preset.import"));
    } catch (err: any) {
      toast.error(err?.message ?? t("captions.preset.errors.invalidJson"));
    }
  }

  async function handlePasteImport() {
    if (!onImportJson) return;
    setPasteError(null);
    try {
      await onImportJson(pasteValue);
      setPasteOpen(false);
      setPasteValue("");
      toast.success(t("captions.preset.import"));
    } catch (err: any) {
      setPasteError(
        err?.message ?? t("captions.preset.errors.invalidJson"),
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
              {t("captions.preset.confirmDeleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("captions.preset.confirmDelete")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("captions.preset.action.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pendingDelete) await onDelete(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              {t("captions.preset.confirmDeleteConfirm")}
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
            <DialogTitle>{t("captions.preset.importTitle")}</DialogTitle>
            <DialogDescription>
              {t("captions.preset.paste")}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            placeholder={t("captions.preset.importPlaceholder")}
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
              {t("captions.preset.action.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handlePasteImport}
              disabled={!pasteValue.trim()}
            >
              {t("captions.preset.importSubmit")}
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
        "group relative cursor-pointer overflow-hidden p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary ring-1 ring-primary",
      )}
    >
      <PresetThumbnail
        preset={preset}
        selected={selected}
        className="aspect-video h-auto w-full rounded-none border-0"
      />
      <div className="absolute inset-x-0 top-0 flex items-center gap-1 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-2 pb-6 pl-3 pt-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">
          {preset.name}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 text-white/80 opacity-60 transition-opacity hover:bg-white/15 hover:text-white focus-visible:opacity-100 data-[state=open]:opacity-100 group-hover:opacity-100"
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
                <ImageIcon />
                {t("captions.preset.preview")}
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
              {t("captions.preset.duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExport}>
              <Download />
              {t("captions.preset.export")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCopyJson}>
              <ClipboardPaste />
              {t("captions.preset.copyJson")}
            </DropdownMenuItem>
            {!preset.builtIn && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onRequestDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 />
                  {t("captions.preset.delete")}
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
      aria-label={t("captions.preset.new", "New Preset")}
      onClick={onCreate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCreate();
        }
      }}
      className="group relative cursor-pointer overflow-hidden border-dashed p-0 text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex aspect-video h-auto w-full items-center justify-center bg-muted/30">
        <Plus className="size-6 group-hover:text-foreground" />
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center gap-1 px-2 py-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          {t("captions.preset.new", "New Preset")}
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
              aria-label={t("captions.preset.paste")}
              title={t("captions.preset.paste")}
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
              aria-label={t("captions.preset.import")}
              title={t("captions.preset.import")}
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
