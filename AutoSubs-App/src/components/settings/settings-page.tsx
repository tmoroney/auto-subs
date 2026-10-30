import * as React from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, ExternalLink, FolderOpen } from "lucide-react";
import { Button, Menu, MenuPopup, MenuRadioItem, Segmented, Switch } from "@/components/kit";
import { SupportDialog } from "@/components/dialogs/support-dialog";
import { useTheme } from "@/components/providers/theme-provider";
import { uiLanguages } from "@/lib/languages";
import { useSettingsStore } from "@/stores/settings-store";
import { initI18n, normalizeUiLanguage } from "@/i18n";
import { useErrorDialog } from "@/contexts/ErrorDialogContext";

type Props = { onBack: () => void };
type RowProps = { title: string; description?: string; control: React.ReactNode };
type CliStatus = { installed: boolean; manageable: boolean; location: string | null; note: string | null };
type ResolveStatus = { supported: boolean; enabled: boolean };

export function SettingsPage({ onBack }: Props) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { showError } = useErrorDialog();
  const enableForcedAlignment = useSettingsStore((s) => s.enableForcedAlignment);
  const enableDTW = useSettingsStore((s) => s.enableDTW);
  const enableVad = useSettingsStore((s) => s.enableVad);
  const enableGpu = useSettingsStore((s) => s.enableGpu);
  const translate = useSettingsStore((s) => s.translate);
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const resetSettings = useSettingsStore((s) => s.resetSettings);
  const [version, setVersion] = React.useState("");
  const [cliStatus, setCliStatus] = React.useState<CliStatus | null>(null);
  const [cliBusy, setCliBusy] = React.useState(false);
  const [resolveStatus, setResolveStatus] = React.useState<ResolveStatus | null>(null);
  const [supportOpen, setSupportOpen] = React.useState(false);

  React.useEffect(() => {
    void getVersion().then(setVersion).catch(() => {});
    void invoke<CliStatus>("cli_command_status").then(setCliStatus).catch(() => setCliStatus(null));
    void invoke<ResolveStatus>("open_from_resolve_status").then(setResolveStatus).catch(() => setResolveStatus(null));
  }, []);
  const changeLanguage = async (value: string) => {
    const language = normalizeUiLanguage(value);
    updateSetting("uiLanguage", language);
    await initI18n(language);
    await i18n.changeLanguage(language);
  };
  const toggleResolve = async (checked: boolean) => {
    try {
      setResolveStatus(await invoke<ResolveStatus>("set_open_from_resolve", { enabled: checked }));
    } catch (error) {
      console.error("Failed to update Resolve setting", error);
      await invoke<ResolveStatus>("open_from_resolve_status").then(setResolveStatus).catch(() => setResolveStatus(null));
      showError({ title: t("settings.openFromResolve.title"), message: String(error) });
    }
  };
  const openLogs = () => void invoke("open_log_dir").catch((error) => console.error(error));
  const reset = async () => {
    if (await ask(t("settings.reset.confirm"), { title: t("settings.reset.confirmTitle"), kind: "warning" })) resetSettings();
  };
  const Row = ({ title, description, control }: RowProps) => <div className="as-setting-row"><div><div className="as-setting-title">{title}</div>{description && <div className="as-setting-description">{description}</div>}</div><div className="as-setting-control">{control}</div></div>;
  const group = (title: string, children: React.ReactNode) => <section className="as-settings-group"><h2>{title}</h2>{children}</section>;
  const toggle = (value: boolean, key: "enableForcedAlignment" | "enableDTW" | "enableVad" | "enableGpu") => <Switch checked={value} onCheckedChange={(checked) => updateSetting(key, checked)} />;

  return <div className="as-content-page as-settings-page">
    <Button variant="ghost" className="as-back-link" onClick={onBack}>‹ {t("common.back")}</Button>
    <h1 className="as-content-title">{t("settings.title")}</h1>
    <p className="as-page-meta">{version && t("redesign.version", "Version {{version}}", { version })}</p>
    {group(t("redesign.wordTiming", "Word timing"), <>
      <Row title={t("settings.forcedAlignment.title")} description={t("settings.forcedAlignment.description")} control={toggle(enableForcedAlignment, "enableForcedAlignment")} />
      <Row title={t("settings.dtw.title")} description={enableForcedAlignment && !translate ? t("settings.dtw.supersededByAlignment") : t("settings.dtw.description")} control={<Switch checked={enableDTW} disabled={enableForcedAlignment && !translate} onCheckedChange={(checked) => updateSetting("enableDTW", checked)} />} />
      <Row title={t("settings.speechDetection.title")} description={t("settings.speechDetection.description")} control={toggle(enableVad, "enableVad")} />
    </>)}
    {group(t("redesign.performance", "Performance"), <Row title={t("settings.gpu.title")} description={t("settings.gpu.description")} control={toggle(enableGpu, "enableGpu")} />)}
    {group(t("redesign.app", "App"), <>
      <Row title={t("settings.uiLanguage.title")} description={t("settings.uiLanguage.description")} control={<Menu.Root><Menu.Trigger className="as-settings-select">{uiLanguages.find((l) => l.value === uiLanguage)?.label ?? uiLanguage}<span><ChevronUp size={12} /><ChevronDown size={12} /></span></Menu.Trigger><MenuPopup className="as-sort-menu"><Menu.RadioGroup value={uiLanguage} onValueChange={(v) => void changeLanguage(v)}>{uiLanguages.map((lang) => <MenuRadioItem key={lang.value} value={lang.value}>{lang.label}</MenuRadioItem>)}</Menu.RadioGroup></MenuPopup></Menu.Root>} />
      <Row title={t("redesign.appearance", "Appearance")} description={t("redesign.appearanceDescription", "Follows your system by default")} control={<Segmented ariaLabel={t("redesign.appearance", "Appearance")} value={theme} onValueChange={(v) => setTheme(v as "system" | "light" | "dark")} options={[{ value: "system", label: t("redesign.system", "System") }, { value: "light", label: t("redesign.light", "Light") }, { value: "dark", label: t("redesign.dark", "Dark") }]} />} />
      {resolveStatus?.supported && <Row title={t("settings.openFromResolve.title")} description={t("settings.openFromResolve.description")} control={<Switch checked={resolveStatus.enabled} onCheckedChange={(checked) => void toggleResolve(checked)} />} />}
      {cliStatus && <Row title={t("settings.cli.title")} description={t("redesign.cliDescription")} control={cliStatus.manageable
        ? <Button variant="ghost" disabled={cliBusy} onClick={() => {
            setCliBusy(true);
            void invoke<CliStatus>(cliStatus.installed ? "uninstall_cli_command" : "install_cli_command").then(setCliStatus).catch(async (error) => {
              if (String(error) !== "Cancelled.") showError({ title: t("settings.cli.errorTitle"), message: String(error) });
              await invoke<CliStatus>("cli_command_status").then(setCliStatus).catch(() => setCliStatus(null));
            }).finally(() => setCliBusy(false));
          }}>{t(cliStatus.installed ? "settings.cli.remove" : "settings.cli.install")}</Button>
        : <span className="as-setting-description">{cliStatus.note || t(cliStatus.installed ? "settings.cli.available" : "settings.cli.notFound")}</span>} />}
    </>)}
    {group(t("redesign.help", "Help"), <>
      <Row title={t("redesign.logs", "Logs")} description={t("redesign.logsDescription", "For bug reports")} control={<Button variant="ghost" onClick={openLogs}><FolderOpen size={14} />{t("redesign.openFolder", "Open folder")}</Button>} />
      <Row title={t("redesign.viewSource")} description="" control={<a className="as-settings-link" href="https://github.com/tmoroney/auto-subs" target="_blank" rel="noreferrer">{t("redesign.viewSource")}<ExternalLink size={13} /></a>} />
      <Row title={t("settings.support.supportAutoSubs")} description="" control={<Button variant="ghost" onClick={() => setSupportOpen(true)}>{t("settings.support.supportAutoSubs")}</Button>} />
      <Row title={t("settings.reset.button")} description={t("redesign.resetDescription", "Restores every setting to its default")} control={<Button variant="ghost" className="as-danger" onClick={() => void reset()}>{t("settings.reset.button")}</Button>} />
    </>)}
    {/* TODO(redesign stage 4) */}
    <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
  </div>;
}
