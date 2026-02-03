import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { ask } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Model } from "@/types/interfaces";

interface ManageModelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: Model[];
  onDeleteModel: (modelValue: string) => void;
}

export function ManageModelsDialog({
  open,
  onOpenChange,
  models,
  onDeleteModel
}: ManageModelsDialogProps) {
  const { t } = useTranslation();
  const downloadedModels = models.filter(model => model.isDownloaded);

  const handleDeleteModel = async (modelValue: string) => {
    const modelName = t(models.find((m) => m.value === modelValue)?.label || "");
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("models.manage.title")}</DialogTitle>
          <DialogDescription>
            {t("models.manage.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {downloadedModels.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {t("models.manage.empty")}
            </p>
          ) : (
            downloadedModels.map((model) => (
              <div key={model.value} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <img
                    src={model.image}
                    alt={t(model.label)}
                    className="w-9 h-9 object-contain rounded"
                  />
                  <div>
                    <div className="flex items-center">
                      <p className="font-medium text-sm">{t(model.label)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{model.size}</p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="icon"
                  title={t("models.manage.deleteModel")}
                  onClick={() => handleDeleteModel(model.value)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
