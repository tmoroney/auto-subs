import * as React from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { message, open } from "@tauri-apps/plugin-dialog";
import type { TFunction } from "i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSettingsStore } from "@/stores/settings-store";
import { models } from "@/lib/models";
import { IMPORTED_MODEL_PREFIX, fileNameOf, resolveImportedModelName } from "@/lib/imported-models";

/** What `inspect_whisper_model` reads from a model file's header. */
export interface WhisperModelInfo {
  multilingual: boolean;
  /** The whisper.cpp model it was built from; null turns word timing off. */
  baseModel: string | null;
}

/** A file that passed the header check and is waiting for a name. */
export interface PendingImport extends WhisperModelInfo {
  path: string;
}

const ERROR_KEYS: Record<string, string> = {
  model_file_not_found: "models.imported.errors.notFound",
  model_file_not_ggml: "models.imported.errors.notGgml",
  model_file_unreadable: "models.imported.errors.unreadable",
};

/**
 * Read a model file's header, or tell the user (in their language) why it
 * can't be used. Returns null after showing the message.
 */
export async function inspectWhisperModel(
  path: string,
  t: TFunction,
  title: string,
): Promise<WhisperModelInfo | null> {
  try {
    return await invoke<WhisperModelInfo>("inspect_whisper_model", { path });
  } catch (error) {
    const key = ERROR_KEYS[String(error)] ?? "models.imported.errors.unreadable";
    await message(t(key, { path }), { title, kind: "error" });
    return null;
  }
}

/** Ask for a `.bin` file and check its header. Null when cancelled or rejected. */
export async function pickWhisperModelFile(t: TFunction): Promise<PendingImport | null> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: t("models.imported.fileFilter"), extensions: ["bin"] }],
  });
  if (typeof path !== "string") return null;
  const info = await inspectWhisperModel(path, t, t("models.imported.errors.title"));
  return info ? { path, ...info } : null;
}

interface ImportModelDialogProps {
  pending: PendingImport | null;
  onClose: () => void;
  /** Called with the new model's index in the combined model list. */
  onImported: (modelIndex: number) => void;
}

/** Names a checked file and adds it to the imported models. */
export function ImportModelDialog({ pending, onClose, onImported }: ImportModelDialogProps) {
  const { t } = useTranslation();
  const importedModels = useSettingsStore((s) => s.importedModels);
  const addImportedModel = useSettingsStore((s) => s.addImportedModel);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (pending) setName("");
  }, [pending]);

  const fallbackName = resolveImportedModelName("", importedModels);

  const handleImport = () => {
    if (!pending) return;
    const index = models.length + importedModels.length;
    addImportedModel({
      id: `${IMPORTED_MODEL_PREFIX}${crypto.randomUUID()}`,
      name: resolveImportedModelName(name, importedModels),
      path: pending.path,
      multilingual: pending.multilingual,
    });
    onImported(index);
    // English-only models aren't offered for other languages or auto-detect,
    // so switch to English rather than select a model the picker hides.
    if (!pending.multilingual && useSettingsStore.getState().language !== "en") {
      updateSetting("language", "en");
    }
    onClose();
  };

  return (
    <Dialog open={pending !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            handleImport();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("models.imported.nameTitle")}</DialogTitle>
            <DialogDescription className="break-all">
              {pending ? fileNameOf(pending.path) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={fallbackName}
              aria-label={t("models.imported.nameLabel")}
            />
            <p className="text-xs text-muted-foreground">
              {t("models.imported.nameHint", { name: fallbackName })}
            </p>
            {pending && pending.baseModel === null ? (
              <p className="text-xs text-muted-foreground">
                {t("models.imported.noWordTiming", { feature: t("settings.dtw.title") })}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit">{t("models.imported.confirm")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
