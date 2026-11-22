import * as React from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown, ExternalLink, FolderOpen } from "lucide-react";
import { Button, Menu, MenuPopup, MenuRadioItem, Segmented, Switch } from "@/components/kit";
import { BackLink } from "@/components/back-link";
import { SupportDialog } from "@/components/dialogs/support-dialog";
import { useTheme } from "@/components/providers/theme-provider";
import { useErrorDialog } from "@/contexts/ErrorDialogContext";
import { initI18n, normalizeUiLanguage } from "@/i18n";
import { uiLanguages } from "@/lib/languages";
import { useSettingsStore } from "@/stores/settings-store";

type Props = {
  onBack: () => void;
};

type RowProps = {
  title: string;
  description?: string;
  control: React.ReactNode;
};

type GroupProps = {
  title: string;
  children: React.ReactNode;
};

type CliStatus = {
  installed: boolean;
  manageable: boolean;
  location: string | null;
  note: string | null;
};

type ResolveStatus = {
  supported: boolean;
  enabled: boolean;
};

type BooleanSetting = "enableForcedAlignment" | "enableDTW" | "enableVad" | "enableGpu";

function Row({ title, description, control }: RowProps) {
  return (
    <div className="as-setting-row">
      <div>
        <div className="as-setting-title">{title}</div>
        {description && (
          <div className="as-setting-description">{description}</div>
        )}
      </div>
      <div className="as-setting-control">{control}</div>
    </div>
  );
}

function SettingsGroup({ title, children }: GroupProps) {
  return (
    <section className="as-settings-group">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function SettingsPage({ onBack }: Props) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { showError } = useErrorDialog();
  const enableForcedAlignment = useSettingsStore(
    (state) => state.enableForcedAlignment,
  );
  const enableDTW = useSettingsStore((state) => state.enableDTW);
  const enableVad = useSettingsStore((state) => state.enableVad);
  const enableGpu = useSettingsStore((state) => state.enableGpu);
  const translate = useSettingsStore((state) => state.translate);
  const uiLanguage = useSettingsStore((state) => state.uiLanguage);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const resetSettings = useSettingsStore((state) => state.resetSettings);
  const [version, setVersion] = React.useState("");
  const [cliStatus, setCliStatus] = React.useState<CliStatus | null>(null);
  const [cliBusy, setCliBusy] = React.useState(false);
  const [resolveStatus, setResolveStatus] =
    React.useState<ResolveStatus | null>(null);
  const [resolveBusy, setResolveBusy] = React.useState(false);
  const [supportOpen, setSupportOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    void getVersion()
      .then((currentVersion) => {
        if (!cancelled) setVersion(currentVersion);
      })
      .catch(() => {
        if (!cancelled) setVersion("");
      });
    void invoke<CliStatus>("cli_command_status")
      .then((status) => {
        if (!cancelled) setCliStatus(status);
      })
      .catch(() => {
        if (!cancelled) setCliStatus(null);
      });
    void invoke<ResolveStatus>("open_from_resolve_status")
      .then((status) => {
        if (!cancelled) setResolveStatus(status);
      })
      .catch(() => {
        if (!cancelled) setResolveStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const changeLanguage = (value: string) => {
    const normalized = normalizeUiLanguage(value);
    updateSetting("uiLanguage", normalized);
    initI18n(normalized);
  };
  const toggle = (value: boolean, key: BooleanSetting) => (
    <Switch
      checked={value}
      onCheckedChange={(checked) => updateSetting(key, checked)}
    />
  );
  const toggleResolve = async (enabled: boolean) => {
    setResolveBusy(true);
    try {
      setResolveStatus(
        await invoke<ResolveStatus>("set_open_from_resolve", { enabled }),
      );
    } catch (error) {
      console.error("Failed to update Resolve setting", error);
      await invoke<ResolveStatus>("open_from_resolve_status")
        .then(setResolveStatus)
        .catch(() => setResolveStatus(null));
      showError({
        title: t("settings.openFromResolve.title"),
        message: String(error),
      });
    } finally {
      setResolveBusy(false);
    }
  };
  const toggleCli = async () => {
    if (!cliStatus?.manageable) return;

    const command = cliStatus.installed
      ? "uninstall_cli_command"
      : "install_cli_command";
    setCliBusy(true);
    try {
      setCliStatus(await invoke<CliStatus>(command));
    } catch (error) {
      if (String(error) !== "Cancelled.") {
        showError({
          title: t("settings.cli.errorTitle"),
          message: String(error),
        });
      }
      await invoke<CliStatus>("cli_command_status")
        .then(setCliStatus)
        .catch(() => setCliStatus(null));
    } finally {
      setCliBusy(false);
    }
  };
  const openLogs = () => {
    void invoke("open_log_dir").catch((error) => console.error(error));
  };
  const reset = async () => {
    const confirmed = await ask(t("settings.reset.confirm"), {
      title: t("settings.reset.confirmTitle"),
      kind: "warning",
    });
    if (confirmed) resetSettings();
  };

  return (
    <div className="as-content-page as-settings-page">
      <BackLink onBack={onBack} />
      <h1 className="as-content-title">{t("settings.title")}</h1>
      <p className="as-page-meta">
        {version && t("redesign.version", "Version {{version}}", { version })}
      </p>

      <SettingsGroup title={t("redesign.wordTiming", "Word timing")}>
        <Row
          title={t("settings.forcedAlignment.title")}
          description={t("settings.forcedAlignment.description")}
          control={toggle(enableForcedAlignment, "enableForcedAlignment")}
        />
        <Row
          title={t("settings.dtw.title")}
          description={
            enableForcedAlignment && !translate
              ? t("settings.dtw.supersededByAlignment")
              : t("settings.dtw.description")
          }
          control={
            <Switch
              checked={enableDTW}
              disabled={enableForcedAlignment && !translate}
              onCheckedChange={(checked) => updateSetting("enableDTW", checked)}
            />
          }
        />
        <Row
          title={t("settings.speechDetection.title")}
          description={t("settings.speechDetection.description")}
          control={toggle(enableVad, "enableVad")}
        />
      </SettingsGroup>

      <SettingsGroup title={t("redesign.performance", "Performance")}>
        <Row
          title={t("settings.gpu.title")}
          description={t("settings.gpu.description")}
          control={toggle(enableGpu, "enableGpu")}
        />
      </SettingsGroup>

      <SettingsGroup title={t("redesign.app", "App")}>
        <Row
          title={t("settings.uiLanguage.title")}
          description={t("settings.uiLanguage.description")}
          control={
            <Menu.Root>
              <Menu.Trigger className="as-settings-select">
                {uiLanguages.find((language) => language.value === uiLanguage)
                  ?.label ?? uiLanguage}
                <ChevronsUpDown
                  className="text-[var(--as-fg-muted)]"
                  size={14}
                />
              </Menu.Trigger>
              <MenuPopup className="as-sort-menu">
                <Menu.RadioGroup
                  value={uiLanguage}
                  onValueChange={changeLanguage}
                >
                  {uiLanguages.map((language) => (
                    <MenuRadioItem
                      key={language.value}
                      value={language.value}
                    >
                      {language.label}
                    </MenuRadioItem>
                  ))}
                </Menu.RadioGroup>
              </MenuPopup>
            </Menu.Root>
          }
        />
        <Row
          title={t("redesign.appearance", "Appearance")}
          description={t(
            "redesign.appearanceDescription",
            "Follows your system by default",
          )}
          control={
            <Segmented
              ariaLabel={t("redesign.appearance", "Appearance")}
              value={theme}
              onValueChange={(value) =>
                setTheme(value as "system" | "light" | "dark")
              }
              className="as-settings-segmented"
              options={[
                { value: "system", label: t("redesign.system", "System") },
                { value: "light", label: t("redesign.light", "Light") },
                { value: "dark", label: t("redesign.dark", "Dark") },
              ]}
            />
          }
        />
        {resolveStatus?.supported && (
          <Row
            title={t("settings.openFromResolve.title")}
            description={t("settings.openFromResolve.description")}
            control={
              <Switch
                checked={resolveStatus.enabled}
                disabled={resolveBusy}
                onCheckedChange={(checked) => void toggleResolve(checked)}
              />
            }
          />
        )}
        {cliStatus && (
          <Row
            title={t("settings.cli.title")}
            description={t("redesign.cliDescription")}
            control={
              cliStatus.manageable ? (
                <Button
                  variant="ghost"
                  disabled={cliBusy}
                  onClick={() => void toggleCli()}
                >
                  {t(
                    cliStatus.installed
                      ? "settings.cli.remove"
                      : "settings.cli.install",
                  )}
                </Button>
              ) : (
                <span className="as-setting-description">
                  {cliStatus.note ||
                    t(
                      cliStatus.installed
                        ? "settings.cli.available"
                        : "settings.cli.notFound",
                    )}
                </span>
              )
            }
          />
        )}
      </SettingsGroup>

      <SettingsGroup title={t("redesign.help", "Help")}>
        <Row
          title={t("redesign.logs", "Logs")}
          description={t("redesign.logsDescription", "For bug reports")}
          control={
            <Button variant="ghost" onClick={openLogs}>
              <FolderOpen size={14} />
              {t("redesign.openFolder", "Open folder")}
            </Button>
          }
        />
        <Row
          title={t("redesign.viewSource")}
          control={
            <Button
              variant="icon"
              aria-label={t("redesign.viewSource")}
              title={t("redesign.viewSource")}
              render={
                <a
                  href="https://github.com/tmoroney/auto-subs"
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <ExternalLink size={14} />
            </Button>
          }
        />
        <Row
          title={t("settings.support.supportAutoSubs")}
          control={
            <Button variant="ghost" onClick={() => setSupportOpen(true)}>
              {t("settings.support.supportAutoSubs")}
            </Button>
          }
        />
        <Row
          title={t("settings.reset.button")}
          description={t(
            "redesign.resetDescription",
            "Restores every setting to its default",
          )}
          control={
            <Button
              variant="ghost"
              className="as-danger"
              onClick={() => void reset()}
            >
              {t("settings.reset.button")}
            </Button>
          }
        />
      </SettingsGroup>

      {/* TODO(redesign stage 4) */}
      <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
    </div>
  );
}
