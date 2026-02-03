import { Gauge, Clock } from "lucide-react";
import { DeleteIcon, type DeleteIconHandle } from "@/components/ui/icons/delete";
import { useSettings } from "@/contexts/SettingsContext";
import { ask } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Field, FieldGroup } from "@/components/ui/field";
import { initI18n, normalizeUiLanguage } from "@/i18n";
import { useRef } from "react";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { settings, updateSetting, resetSettings } = useSettings();
  const { t } = useTranslation();
  const deleteIconRef = useRef<DeleteIconHandle>(null);

  const handleResetSettings = async () => {
    const shouldReset = await ask(t("settings.reset.confirm"), {
      title: t("settings.reset.confirmTitle"),
      kind: "warning"
    });
    
    if (shouldReset) {
      resetSettings();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{t("settings.title")}</DialogTitle>
            <DialogDescription className="text-xs">
              {t("settings.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-6">
            {/* Language Settings */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("settings.sections.language")}
              </h4>

              <FieldGroup>
                <Field>
                  <Item variant="outline" size="sm">
                    <ItemContent>
                      <ItemTitle>{t("settings.uiLanguage.title")}</ItemTitle>
                      <ItemDescription className="text-xs leading-tight line-clamp-1">
                        {t("settings.uiLanguage.description")}
                      </ItemDescription>
                    </ItemContent>

                    <ItemActions className="w-[170px] shrink-0 justify-end">
                      <Select
                        value={normalizeUiLanguage(settings.uiLanguage)}
                        onValueChange={(value) => {
                          const normalized = normalizeUiLanguage(value);
                          updateSetting("uiLanguage", normalized);
                          initI18n(normalized);
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="es">Español</SelectItem>
                          <SelectItem value="fr">Français</SelectItem>
                          <SelectItem value="de">Deutsch</SelectItem>
                          <SelectItem value="zh">中文</SelectItem>
                        </SelectContent>
                      </Select>
                    </ItemActions>
                  </Item>
                </Field>
              </FieldGroup>
            </div>

            {/* Transcription Settings */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("settings.sections.transcription")}
              </h4>

              <FieldGroup className="gap-3">
                <Field>
                  <Item variant="outline" size="sm">
                    <ItemMedia variant="icon" className="bg-yellow-100 dark:bg-yellow-900/30">
                      <Gauge className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t("settings.gpu.title")}</ItemTitle>
                      <ItemDescription className="text-xs leading-tight line-clamp-1">
                        {t("settings.gpu.description")}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Switch
                        checked={settings.enableGpu}
                        onCheckedChange={(checked) => updateSetting("enableGpu", checked)}
                      />
                    </ItemActions>
                  </Item>
                </Field>

                <Field>
                  <Item variant="outline" size="sm">
                    <ItemMedia variant="icon" className="bg-blue-100 dark:bg-blue-900/30">
                      <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t("settings.dtw.title")}</ItemTitle>
                      <ItemDescription className="text-xs leading-tight line-clamp-1">
                        {t("settings.dtw.description")}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Switch
                        checked={settings.enableDTW}
                        onCheckedChange={(checked) => updateSetting("enableDTW", checked)}
                      />
                    </ItemActions>
                  </Item>
                </Field>
              </FieldGroup>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={handleResetSettings}
              onMouseEnter={() => deleteIconRef.current?.startAnimation()}
              onMouseLeave={() => deleteIconRef.current?.stopAnimation()}
            >
              <DeleteIcon ref={deleteIconRef} />
              {t("settings.reset.button")}
            </Button>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                {t("common.close")}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>
  );
}
