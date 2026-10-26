import React from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ask } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Model } from "@/types";
import { modelLabel } from "@/lib/models";
import { resolveImportedModelName } from "@/lib/imported-models";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * An imported model's name, editable in place: the pencil turns it into a
 * text field, Enter saves, Escape or leaving the field cancels. A blank name
 * gets the same ImportedModel_N fallback as on import.
 */
function ImportedModelName({ model }: { model: Model }) {
  const { t } = useTranslation();
  const importedModels = useSettingsStore((s) => s.importedModels);
  const renameImportedModel = useSettingsStore((s) => s.renameImportedModel);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(model.label);

  const save = () => {
    const others = importedModels.filter((m) => m.id !== model.value);
    renameImportedModel(model.value, resolveImportedModelName(draft, others));
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            // The dialog ignores this Escape (see onEscapeKeyDown below).
            setEditing(false);
          }
        }}
        aria-label={t("models.imported.nameLabel")}
        data-inline-rename=""
        className="h-7 text-sm"
      />
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <p className="font-medium text-sm break-all">{model.label}</p>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        title={t("models.imported.rename")}
        aria-label={t("models.imported.rename")}
        onClick={() => {
          setDraft(model.label);
          setEditing(true);
        }}
      >
        <Pencil className="size-3.5" />
      </Button>
    </span>
  );
}

interface ManageModelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: Model[];
  onDeleteModel: (modelValue: string) => void;
  onRefresh?: () => Promise<void> | void;
}

export function ManageModelsDialog({
  open,
  onOpenChange,
  models,
  onDeleteModel,
  onRefresh
}: ManageModelsDialogProps) {
  const { t } = useTranslation();
  const removeImportedModel = useSettingsStore((s) => s.removeImportedModel);
  const downloadedModels = models.filter(model => model.isDownloaded);

  // Keep the latest callback in a ref so the effect below only fires on the
  // closed -> open transition; depending on `onRefresh` directly would re-fire
  // whenever a caller passes a new inline function after each refresh.
  const onRefreshRef = React.useRef(onRefresh);
  React.useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  // Re-query the backend every time the dialog opens so a stale (possibly
  // empty) result from window startup doesn't stick until the next
  // transcription finishes.
  React.useEffect(() => {
    if (open) {
      void onRefreshRef.current?.();
    }
  }, [open]);

  // Imported models are the user's own files: forget the entry, keep the file.
  const handleRemoveImported = async (model: Model) => {
    const shouldRemove = await ask(
      t("models.imported.removeConfirmBody", { model: model.label, path: model.importedPath }),
      {
        title: t("models.imported.removeConfirmTitle"),
        kind: "warning",
        okLabel: t("models.imported.remove"),
        cancelLabel: t("common.cancel"),
      },
    );
    if (shouldRemove) {
      removeImportedModel(model.value);
    }
  };

  const handleDeleteModel = async (modelValue: string) => {
    const model = models.find((m) => m.value === modelValue);
    const modelName = model ? modelLabel(model, t) : "";
    const shouldDelete = await ask(t("models.manage.confirmBody", { model: modelName }), {
      title: t("models.manage.confirmTitle"),
      kind: "warning"
    });
    
    if (shouldDelete) {
      onDeleteModel(modelValue);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onEscapeKeyDown={(e) => {
          // Radix sees Escape before the field does; while renaming, Escape
          // cancels the rename and leaves the dialog open.
          if (e.target instanceof HTMLElement && e.target.hasAttribute("data-inline-rename")) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2 align-middle">
              <span>{t("models.manage.title")}</span>
              <Badge variant="default" className="h-5 shadow-none">{downloadedModels.length}</Badge>
            </span>
          </DialogTitle>
          <DialogDescription>
            {t("models.manage.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[340px] overflow-y-auto">
          {downloadedModels.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {t("models.manage.empty")}
            </p>
          ) : (
            downloadedModels.map((model) => (
              <div key={model.value} className="flex items-start justify-between gap-3 p-3 border rounded-lg">
                <div className="flex min-w-0 items-start gap-3">
                  <img
                    src={model.image}
                    alt={modelLabel(model, t)}
                    className="size-9 object-contain rounded"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {model.importedPath ? (
                        <ImportedModelName model={model} />
                      ) : (
                        <p className="font-medium text-sm">{t(model.label)}</p>
                      )}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t(model.badge)}</Badge>
                      {model.unused ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t("models.manage.unused")}</Badge>
                      ) : null}
                    </div>
                    {model.importedPath ? (
                      <p className="text-xs text-muted-foreground break-all">{model.importedPath}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{model.size}</p>
                    )}
                    {model.note ? (
                      <p className="text-xs text-muted-foreground">{t(model.note)}</p>
                    ) : null}
                    {model.license && model.licenseText ? (
                      <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                        <p>{t(model.licenseText.summary)}</p>
                        <p>{t(model.licenseText.attribution)}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {model.repositoryUrl ? (
                            <a
                              href={model.repositoryUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              {t("models.aligner.repository")}
                              <ExternalLink className="size-3" />
                            </a>
                          ) : null}
                          <a
                            href={model.license.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {t("models.aligner.licenseLink")}
                            <ExternalLink className="size-3" />
                          </a>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                {model.importedPath ? (
                  <Button
                    variant="outline"
                    size="icon"
                    title={t("models.imported.remove")}
                    aria-label={t("models.imported.remove")}
                    onClick={() => void handleRemoveImported(model)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="icon"
                    title={t("models.manage.deleteModel")}
                    onClick={() => handleDeleteModel(model.value)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
