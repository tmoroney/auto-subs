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
import { Spinner } from "@/components/ui/spinner";
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
import type { CaptionPresetActions } from "@/components/captions/use-caption-presets";

interface PresetGalleryProps {
  presets: CaptionPresetActions;
  selectedPresetId: string;
  /** Whether Resolve is reachable. Editing and rendering both need it. */
  isConnected: boolean;
  onEditPreset: (preset: CaptionPreset | null) => void;
}

/** Grid of AutoSubs caption styles, with per preset actions in an overflow menu. */
export function PresetGallery({
  presets,
  selectedPresetId,
  isConnected,
  onEditPreset,
}: PresetGalleryProps) {
  const { t } = useTranslation();
  const [pendingDelete, setPendingDelete] =
    React.useState<CaptionPreset | null>(null);
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasteValue, setPasteValue] = React.useState("");
  const [pasteError, setPasteError] = React.useState<string | null>(null);

  // Newest first, so a preset the user just made or imported is the first card
  // they see. Built-ins are the fallback library rather than the user's own
  // work, so they sit underneath no matter when they were created.
  const ordered = React.useMemo(() => {
    return [...presets.presets].sort((a, b) => {
      if (a.builtIn !== b.builtIn) return a.builtIn ? 1 : -1;
      return createdMs(b) - createdMs(a);
    });
  }, [presets.presets]);

  async function handleExport(preset: CaptionPreset) {
    try {
      const json = presets.exportJson(preset.id);
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
      await navigator.clipboard.writeText(JSON.stringify(preset, null, 2));
      toast.success(t("captions.preset.copied"));
    } catch (err: any) {
      toast.error(err?.message ?? "Copy failed");
    }
  }

  async function handleImportFromFile() {
    const file = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!file) return;
    try {
      await presets.importJson(await readTextFile(file as string));
      toast.success(t("captions.preset.import"));
    } catch (err: any) {
      toast.error(err?.message ?? t("captions.preset.errors.invalidJson"));
    }
  }

  async function handlePasteImport() {
    setPasteError(null);
    try {
      await presets.importJson(pasteValue);
      setPasteOpen(false);
      setPasteValue("");
      toast.success(t("captions.preset.import"));
    } catch (err: any) {
      setPasteError(err?.message ?? t("captions.preset.errors.invalidJson"));
    }
  }

  return (
    <>
      <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        {ordered.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            selected={selectedPresetId === preset.id}
            isRendering={presets.renderingPreviewId === preset.id}
            isConnected={isConnected}
            onSelect={() => presets.select(preset.id)}
            onRenderPreview={() => presets.renderPreview(preset)}
            onEdit={() => onEditPreset(preset)}
            onDuplicate={() => presets.duplicate(preset)}
            onExport={() => handleExport(preset)}
            onCopyJson={() => handleCopyJson(preset)}
            onRequestDelete={() => setPendingDelete(preset)}
          />
        ))}
        <NewPresetCard
          isConnected={isConnected}
          onCreate={() => onEditPreset(null)}
          onImportFromFile={handleImportFromFile}
          onPasteImport={() => setPasteOpen(true)}
        />
      </div>

      {!isConnected && (
        <p className="px-1 pt-2 text-xs text-muted-foreground">
          {t("captions.preset.needsResolve")}
        </p>
      )}

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
                if (pendingDelete) await presets.remove(pendingDelete.id);
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
            <DialogDescription>{t("captions.preset.paste")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            placeholder={t("captions.preset.importPlaceholder")}
            rows={8}
            className="font-mono text-xs"
          />
          {pasteError && <p className="text-xs text-destructive">{pasteError}</p>}
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
  isRendering: boolean;
  isConnected: boolean;
  onSelect: () => void;
  onRenderPreview: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onCopyJson: () => void;
  onRequestDelete: () => void;
}

function PresetCard({
  preset,
  selected,
  isRendering,
  isConnected,
  onSelect,
  onRenderPreview,
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
      aria-busy={isRendering}
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

      {/* Rendering a preview means a round trip into Resolve that takes several
          seconds and touches the user's timeline. Without this the card simply
          sits there and the click looks like it did nothing. */}
      {isRendering && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-background/75 backdrop-blur-[1px]">
          <Spinner className="size-4 text-primary" />
          <span className="px-2 text-center text-[11px] font-medium text-muted-foreground">
            {t("captions.preset.rendering")}
          </span>
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-center gap-1 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-2 pb-6 pl-3 pt-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">
          {preset.name}
        </span>
        {/* Built-ins are read-only, so there is nothing to edit in place;
            Duplicate in the menu gives the user their own copy to change. */}
        {!preset.builtIn && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 text-white/80 opacity-60 transition-opacity hover:bg-white/15 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            disabled={!isConnected}
            title={isConnected ? undefined : t("captions.preset.needsResolve")}
            aria-label={t("common.edit", "Edit")}
          >
            <Pencil />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 text-white/80 opacity-60 transition-opacity hover:bg-white/15 hover:text-white focus-visible:opacity-100 data-[state=open]:opacity-100 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
              aria-label={t("captions.preset.moreActions", "More actions")}
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onClick={onRenderPreview}
              disabled={isRendering || !isConnected}
              title={isConnected ? undefined : t("captions.preset.needsResolve")}
            >
              <ImageIcon />
              {t("captions.preset.preview")}
            </DropdownMenuItem>
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

function NewPresetCard({
  isConnected,
  onCreate,
  onImportFromFile,
  onPasteImport,
}: {
  isConnected: boolean;
  onCreate: () => void;
  onImportFromFile: () => void;
  onPasteImport: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card
      role="button"
      tabIndex={isConnected ? 0 : -1}
      aria-disabled={!isConnected}
      aria-label={t("captions.preset.new", "New Preset")}
      title={isConnected ? undefined : t("captions.preset.needsResolve")}
      onClick={() => isConnected && onCreate()}
      onKeyDown={(e) => {
        if (!isConnected) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCreate();
        }
      }}
      className={cn(
        "group relative overflow-hidden border-dashed p-0 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isConnected
          ? "cursor-pointer hover:bg-muted/50"
          : "cursor-not-allowed opacity-60",
      )}
    >
      <div className="flex aspect-video h-auto w-full items-center justify-center bg-muted/30">
        <Plus
          className={cn("size-6", isConnected && "group-hover:text-foreground")}
        />
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center gap-1 px-2 py-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          {t("captions.preset.new", "New Preset")}
        </span>
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
      </div>
    </Card>
  );
}

/**
 * Creation time in milliseconds. Presets imported from an older file, or from
 * someone else's hand-edited JSON, can be missing a usable `createdAt`; those
 * sort as oldest rather than scattering the order with NaN comparisons.
 */
function createdMs(preset: CaptionPreset): number {
  const ms = Date.parse(preset.createdAt ?? "");
  return Number.isNaN(ms) ? 0 : ms;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "preset"
  );
}
