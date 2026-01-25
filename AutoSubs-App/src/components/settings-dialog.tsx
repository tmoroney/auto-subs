import React from "react";
import { Heart, Github, Settings, Gauge, Clock } from "lucide-react";
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

export function SettingsDialog() {
  const { settings, updateSetting, resetSettings } = useSettings();
  const { t } = useTranslation();
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
          variant="ghost"
          size="icon"
          data-tauri-drag-region="false"
        >
          <Settings />
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

          {/* Appearance */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("settings.sections.appearance")}
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

          {/* Support Section */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("settings.sections.support")}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="outline"
                asChild
                className="group relative justify-start px-3 py-2.5 h-auto hover:bg-pink-50/80 hover:border-pink-300 dark:hover:bg-pink-950/30 dark:hover:border-pink-700 overflow-hidden"
              >
                <a
                  href="https://buymeacoffee.com/tmoroney"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="p-1.5 rounded-md bg-pink-100 dark:bg-pink-900/30 group-hover:bg-pink-200 dark:group-hover:bg-pink-800/50 transition-colors">
                    <Heart className="h-4 w-4 text-pink-600 dark:text-pink-400 group-hover:fill-pink-500 transition-all" />
                  </div>
                  <span className="min-w-0 flex-1 text-sm font-medium leading-tight">
                    {t("settings.support.supportAutoSubs")}
                  </span>

                  <div className="absolute inset-0 pointer-events-none">
                    {[
                      { tx: "-80px", ty: "-80px", s: 1.5, r: "-20deg", d: "0s" },
                      { tx: "70px", ty: "-90px", s: 1.2, r: "25deg", d: "0.05s" },
                      { tx: "-30px", ty: "-120px", s: 1.4, r: "5deg", d: "0.1s" },
                      { tx: "90px", ty: "-70px", s: 1.1, r: "-15deg", d: "0.15s" },
                      { tx: "0px", ty: "-110px", s: 1.6, r: "0deg", d: "0.2s" },
                      { tx: "-90px", ty: "-60px", s: 1.2, r: "15deg", d: "0.25s" },
                      { tx: "60px", ty: "-110px", s: 1.3, r: "-5deg", d: "0.3s" },
                    ].map((p, i) => (
                      <Heart
                        key={i}
                        className="heart-anim absolute top-1/2 left-1/2 h-5 w-5 text-pink-400 opacity-0"
                        style={{
                          "--tx": p.tx,
                          "--ty": p.ty,
                          "--s": p.s,
                          "--r": p.r,
                          animationDelay: p.d,
                        } as React.CSSProperties}
                      />
                    ))}
                  </div>
                </a>
              </Button>

              <Button
                variant="outline"
                asChild
                className="group justify-start px-3 py-2.5 h-auto hover:bg-slate-50/80 hover:border-slate-300 dark:hover:bg-slate-950/30 dark:hover:border-slate-700"
              >
                <a
                  href="https://github.com/tmoroney/auto-subs"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-900/30 group-hover:bg-slate-200 dark:group-hover:bg-slate-800/50 transition-colors">
                    <Github className="h-4 w-4 text-slate-600 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors" />
                  </div>
                  <span className="min-w-0 flex-1 text-sm font-medium leading-tight">
                    {t("settings.support.viewSource")}
                  </span>
                </a>
              </Button>
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
