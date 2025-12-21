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
import { initI18n, normalizeUiLanguage } from "@/i18n";

export function SettingsDialog() {
  const { settings, updateSetting, resetSettings } = useSettings();
  const { t } = useTranslation();

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
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-tauri-drag-region="false"
        >
          <Settings />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>
            {t("settings.description")}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-5 py-1 overflow-y-auto max-h-[70vh]">

          
          {/* Transcription Settings */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">{t("settings.sections.transcription")}</h4>
            
            {/* GPU Card */}
            <div className="border rounded-lg overflow-hidden">
              <div className="p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                      <Gauge className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t("settings.gpu.title")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.gpu.description")}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.enableGpu}
                    onCheckedChange={(checked) => updateSetting("enableGpu", checked)}
                  />
                </div>
              </div>
            </div>

            {/* DTW Card */}
            <div className="border rounded-lg overflow-hidden">
              <div className="p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t("settings.dtw.title")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.dtw.description")}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.enableDTW}
                    onCheckedChange={(checked) => updateSetting("enableDTW", checked)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">{t("settings.sections.appearance")}</h4>

            <div className="border rounded-lg overflow-hidden">
              <div className="p-3.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t("settings.uiLanguage.title")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.uiLanguage.description")}
                    </p>
                  </div>

                  <div className="w-[180px]">
                    <Select
                      value={normalizeUiLanguage(settings.uiLanguage)}
                      onValueChange={(value) => {
                        const normalized = normalizeUiLanguage(value);
                        updateSetting("uiLanguage", normalized);
                        initI18n(normalized);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="de">Deutsch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Support Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">{t("settings.sections.support")}</h4>
            
            {/* Support AutoSubs Card */}
            <a
              href="https://buymeacoffee.com/tmoroney"
              target="_blank"
              rel="noopener noreferrer"
              className="border rounded-lg overflow-hidden cursor-pointer hover:bg-accent/50 group relative block transition-colors"
            >
              <div className="p-3.5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-pink-100 dark:bg-pink-900/30 group-hover:bg-pink-200 dark:group-hover:bg-pink-800/50 transition-colors">
                    <Heart className="h-5 w-5 text-pink-600 dark:text-pink-400 group-hover:fill-pink-500 fill-background transition-colors" />
                  </div>
                  <div>
                    <p className="text-sm font-medium group-hover:text-foreground">{t("settings.support.supportAutoSubs")}</p>
                    <p className="text-xs text-muted-foreground group-hover:text-muted-foreground/80 transition-colors">
                      {t("settings.support.helpSupportDevelopment")}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Bursting hearts animation */}
              <div className="absolute inset-0 pointer-events-none">
                {[
                  { tx: '-80px', ty: '-80px', s: 1.5, r: '-20deg', d: '0s' },
                  { tx: '70px', ty: '-90px', s: 1.2, r: '25deg', d: '0.05s' },
                  { tx: '-30px', ty: '-120px', s: 1.4, r: '5deg', d: '0.1s' },
                  { tx: '90px', ty: '-70px', s: 1.1, r: '-15deg', d: '0.15s' },
                  { tx: '0px', ty: '-110px', s: 1.6, r: '0deg', d: '0.2s' },
                  { tx: '-90px', ty: '-60px', s: 1.2, r: '15deg', d: '0.25s' },
                  { tx: '60px', ty: '-110px', s: 1.3, r: '-5deg', d: '0.3s' },
                ].map((p, i) => (
                  <Heart
                    key={i}
                    className="heart-anim absolute top-1/2 left-1/2 h-5 w-5 text-pink-400 opacity-0"
                    style={{
                      '--tx': p.tx,
                      '--ty': p.ty,
                      '--s': p.s,
                      '--r': p.r,
                      animationDelay: p.d,
                    } as React.CSSProperties}
                  />
                ))}
              </div>
            </a>

            {/* View Source Card */}
            <a
              href="https://github.com/tmoroney/auto-subs"
              target="_blank"
              rel="noopener noreferrer"
              className="border rounded-lg overflow-hidden cursor-pointer hover:bg-accent/50 group relative block transition-colors"
            >
              <div className="p-3.5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900/30 group-hover:bg-slate-200 dark:group-hover:bg-slate-800/50 transition-colors">
                    <Github className="h-5 w-5 text-slate-600 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors" />
                  </div>
                  <div>
                    <p className="text-sm font-medium group-hover:text-foreground">{t("settings.support.viewSource")}</p>
                    <p className="text-xs text-muted-foreground group-hover:text-muted-foreground/80 transition-colors">
                      {t("settings.support.viewSourceDescription")}
                    </p>
                  </div>
                </div>
              </div>
            </a>
          </div>
        </div>
        <DialogFooter>
        <DialogClose asChild>
          <Button
              variant="destructive"
              onClick={handleResetSettings}
              className="w-full"
            >
              {t("settings.reset.button")}
            </Button>
        </DialogClose>
      </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
