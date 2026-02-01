import React from "react";
import { Settings, Gauge, Clock, Moon, Sun } from "lucide-react";
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
  DialogTrigger,
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
import { initI18n, normalizeUiLanguage } from "@/i18n";
import { useTheme } from "@/components/theme-provider";

interface SettingsDialogProps {
  variant?: "ghost" | "secondary" | "default" | "outline" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  showIcon?: boolean;
  showText?: boolean;
}

interface SettingsDialogControlledProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialogControlled({ open, onOpenChange }: SettingsDialogControlledProps) {
  const { settings, updateSetting, resetSettings } = useSettings();
  const { t } = useTranslation();

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
      <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{t("settings.title")}</DialogTitle>
            <DialogDescription className="text-xs">
              {t("settings.description")}
            </DialogDescription>
          </DialogHeader>

        <div className="py-2 space-y-4">
          {/* Language Settings */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("settings.sections.language")}
            </h4>

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
          </div>

          {/* Transcription Settings */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("settings.sections.transcription")}
            </h4>

            <div className="space-y-2">
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
            </div>
          </div>

        </div>

        <DialogFooter className="gap-2">
          <Button variant="destructive" size="sm" onClick={handleResetSettings}>
            {t("settings.reset.button")}
          </Button>
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              {t("common.close")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsDialog({ variant = "ghost", size = "icon", showIcon = true, showText = false }: SettingsDialogProps = {}) {
  const { settings, updateSetting, resetSettings } = useSettings();
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = React.useState(false);

  const handleResetSettings = async () => {
    const shouldReset = await ask(t("settings.reset.confirm"), {
      title: t("settings.reset.confirmTitle"),
      kind: "warning"
    });
    
    if (shouldReset) {
      // Use the resetSettings function instead of manually resetting
      resetSettings();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          data-tauri-drag-region="false"
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          {showIcon && <Settings className="h-4 w-4" />}
          {showText && <span className="text-xs">Settings</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{t("settings.title")}</DialogTitle>
            <DialogDescription className="text-xs">
              {t("settings.description")}
            </DialogDescription>
          </DialogHeader>

        <div className="py-2 space-y-4">
          {/* Language Settings */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("settings.sections.language")}
            </h4>

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
          </div>

          {/* Theme Settings */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Theme
            </h4>

            <div className="space-y-2">
              <Item variant="outline" size="sm">
                <ItemMedia variant="icon" className="bg-purple-100 dark:bg-purple-900/30">
                  {theme === "dark" ? <Sun className="h-4 w-4 text-purple-600 dark:text-purple-400" /> : <Moon className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Theme</ItemTitle>
                  <ItemDescription className="text-xs leading-tight line-clamp-1">
                    Switch between light and dark mode
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="h-8 px-2"
                  >
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </Button>
                </ItemActions>
              </Item>
            </div>
          </div>

          {/* Transcription Settings */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("settings.sections.transcription")}
            </h4>

            <div className="space-y-2">
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
            </div>
          </div>

        </div>

        <DialogFooter className="gap-2">
          <Button variant="destructive" size="sm" onClick={handleResetSettings}>
            {t("settings.reset.button")}
          </Button>
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              {t("common.close")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
