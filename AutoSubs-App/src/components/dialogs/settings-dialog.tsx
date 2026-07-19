import * as React from "react";
import { AudioLines, Gauge, Clock, GraduationCap, Terminal } from "lucide-react";
import { DeleteIcon, type DeleteIconHandle } from "@/components/ui/icons/delete";
import { useSettingsStore } from "@/stores/settings-store";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
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
import { uiLanguages } from "@/lib/languages";
import { useRef } from "react";
import { getVersion } from "@tauri-apps/api/app";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const enableGpu = useSettingsStore((s) => s.enableGpu);
  const enableDTW = useSettingsStore((s) => s.enableDTW);
  const enableForcedAlignment = useSettingsStore((s) => s.enableForcedAlignment);
  const translate = useSettingsStore((s) => s.translate);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const resetSettings = useSettingsStore((s) => s.resetSettings);
  const { t, i18n } = useTranslation();
  const deleteIconRef = useRef<DeleteIconHandle>(null);
  const [appVersion, setAppVersion] = React.useState<string>("");

  React.useEffect(() => {
    let cancelled = false;
    getVersion()
      .then((v) => {
        if (!cancelled) setAppVersion(v);
      })
      .catch(() => {
        if (!cancelled) setAppVersion("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleResetSettings = async () => {
    const shouldReset = await ask(t("settings.reset.confirm"), {
      title: t("settings.reset.confirmTitle"),
      kind: "warning"
    });

    if (shouldReset) {
      resetSettings();
    }
  };

  const handleRestartOnboarding = () => {
    updateSetting("onboardingCompleted", false);
    updateSetting("tourCompleted", false);
    onOpenChange(false);
  };

  const handleOpenLogsFolder = React.useCallback(async () => {
    try {
      await invoke("open_log_dir");
    } catch (err) {
      console.error("[SettingsDialog] failed to open logs folder:", err);
    }
  }, []);

  // Command-line tool ("autosubs" on PATH). Status is queried when the dialog
  // opens; install/uninstall are handled by the backend per-platform.
  type CliStatus = {
    installed: boolean;
    manageable: boolean;
    location: string | null;
    note: string | null;
  };
  const [cliStatus, setCliStatus] = React.useState<CliStatus | null>(null);
  const [cliBusy, setCliBusy] = React.useState(false);

  const refreshCliStatus = React.useCallback(async () => {
    try {
      setCliStatus(await invoke<CliStatus>("cli_command_status"));
    } catch (err) {
      console.error("[SettingsDialog] failed to read CLI status:", err);
      setCliStatus(null);
    }
  }, []);

  React.useEffect(() => {
    if (open) refreshCliStatus();
  }, [open, refreshCliStatus]);

  const handleCliToggle = React.useCallback(async () => {
    if (!cliStatus?.manageable) return;
    const command = cliStatus.installed ? "uninstall_cli_command" : "install_cli_command";
    setCliBusy(true);
    try {
      setCliStatus(await invoke<CliStatus>(command));
    } catch (err) {
      const msg = String(err);
      // User dismissing the macOS admin prompt is a normal, silent outcome.
      if (msg !== "Cancelled.") {
        console.error("[SettingsDialog] CLI install/uninstall failed:", err);
        await message(msg, { title: t("settings.cli.errorTitle", "Command-line tool"), kind: "error" });
      }
      await refreshCliStatus();
    } finally {
      setCliBusy(false);
    }
  }, [cliStatus, refreshCliStatus, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form>
        <DialogContent className="sm:max-w-[560px]" key={i18n.language}>
          <DialogHeader>
            <DialogTitle>{t("settings.title")}</DialogTitle>
            <DialogDescription className="text-xs">
              {t("settings.description")}
              {appVersion && (
                <span className="ml-1 text-muted-foreground/70">
                  · v{appVersion}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
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
                        value={normalizeUiLanguage(uiLanguage)}
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
                          {uiLanguages.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>
                              {lang.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </ItemActions>
                  </Item>
                </Field>
              </FieldGroup>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleRestartOnboarding}
                >
                  <GraduationCap/>
                  {t("settings.restartOnboarding")}
                </Button>

                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleOpenLogsFolder}
                >
                  <Terminal className="size-4" />
                  {t("settings.openLogsFolder")}
                </Button>
              </div>
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
                      <Gauge className="size-4 text-yellow-600 dark:text-yellow-400" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t("settings.gpu.title")}</ItemTitle>
                      <ItemDescription className="text-xs leading-tight line-clamp-1">
                        {t("settings.gpu.description")}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Switch
                        checked={enableGpu}
                        onCheckedChange={(checked) => updateSetting("enableGpu", checked)}
                      />
                    </ItemActions>
                  </Item>
                </Field>

                <Field>
                  <Item variant="outline" size="sm">
                    <ItemMedia variant="icon" className="bg-blue-100 dark:bg-blue-900/30">
                      <Clock className="size-4 text-blue-600 dark:text-blue-400" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t("settings.dtw.title")}</ItemTitle>
                      <ItemDescription className="text-xs leading-tight line-clamp-1">
                        {t("settings.dtw.description")}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Switch
                        checked={enableDTW}
                        onCheckedChange={(checked) => updateSetting("enableDTW", checked)}
                      />
                    </ItemActions>
                  </Item>
                </Field>

                <Field>
                  <Item variant="outline" size="sm">
                    <ItemMedia variant="icon" className="bg-purple-100 dark:bg-purple-900/30">
                      <AudioLines className="size-4 text-purple-600 dark:text-purple-400" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t("settings.forcedAlignment.title")}</ItemTitle>
                      <ItemDescription className="text-xs leading-tight line-clamp-2">
                        {translate
                          ? t("settings.forcedAlignment.translationIncompatible")
                          : t("settings.forcedAlignment.description")}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Switch
                        checked={enableForcedAlignment}
                        disabled={translate}
                        onCheckedChange={(checked) =>
                          updateSetting("enableForcedAlignment", checked)
                        }
                        aria-label={t("settings.forcedAlignment.title")}
                      />
                    </ItemActions>
                  </Item>
                </Field>
              </FieldGroup>
            </div>

            {/* Command-line tool */}
            {cliStatus && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("settings.sections.cli", "Command line")}
                </h4>

                <FieldGroup className="gap-3">
                  <Field>
                    <Item variant="outline" size="sm">
                      <ItemMedia variant="icon" className="bg-green-100 dark:bg-green-900/30">
                        <Terminal className="size-4 text-green-600 dark:text-green-400" />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{t("settings.cli.title", "Command-line tool")}</ItemTitle>
                        <ItemDescription className="text-xs leading-tight line-clamp-2">
                          {cliStatus.manageable
                            ? t(
                                "settings.cli.description",
                                "Install the `autosubs` command so you can transcribe files from any terminal."
                              )
                            : cliStatus.note ?? ""}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        {cliStatus.manageable ? (
                          <Button
                            variant={cliStatus.installed ? "outline" : "secondary"}
                            size="sm"
                            disabled={cliBusy}
                            onClick={handleCliToggle}
                          >
                            {cliStatus.installed
                              ? t("settings.cli.remove", "Remove")
                              : t("settings.cli.install", "Install")}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {cliStatus.installed
                              ? t("settings.cli.available", "Available")
                              : t("settings.cli.notFound", "Not found")}
                          </span>
                        )}
                      </ItemActions>
                    </Item>
                  </Field>
                </FieldGroup>
              </div>
            )}
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
