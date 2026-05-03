import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Minus,
  Square,
  X,
  Settings,
  Sun,
  Moon,
  Monitor,
  Heart,
  Boxes,
  RotateCcw,
  GitMerge,
  ChevronDown,
  Check,
} from "lucide-react";
import type { HistoryIconHandle } from "@/components/ui/history";
import { platform } from "@tauri-apps/plugin-os";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/animated-tabs";
import { useTheme } from "@/components/providers/theme-provider";
import { useModels } from "@/contexts/ModelsContext";
import type { Model } from "@/types";
import { useState, useEffect, useRef } from "react";
import { SettingsDialog } from "@/components/dialogs/settings-dialog";
import { ManageModelsDialog } from "@/components/settings/model-manager";
import { SupportDialog } from "@/components/dialogs/support-dialog";
import { ArchiveIcon } from "../ui/archive";
import { Spinner } from "@/components/ui/spinner";
import {
  UPDATE_RESTART_NOTICE_KEY,
  useUpdateStatus,
} from "@/hooks/use-update-status";
import { invoke } from "@tauri-apps/api/core";
import { diarizeModel } from "@/lib/models";
import { SubtitleHistoryPopover } from "@/components/common/subtitle-history-popover";

import { useResolve } from "@/contexts/ResolveContext";
import { useAdobe } from "@/contexts/AdobeContext";
import {
  useIntegration,
  type Integration,
} from "@/contexts/IntegrationContext";

function IntegrationStatus() {
  const { t } = useTranslation();
  const { timelineInfo: resolveTimeline, refresh: refreshResolve } =
    useResolve();
  const {
    premiereTimeline,
    afterEffectsTimeline,
    isPremiereConnected,
    isAfterEffectsConnected,
    refresh: refreshAdobe,
  } = useAdobe();
  const { selectedIntegration, setSelectedIntegration } = useIntegration();

  const isResolveConnected = Boolean(resolveTimeline?.timelineId);
  const integrations = {
    davinci: {
      productName: t("titlebar.resolve.productName"),
      logo: "/davinci-resolve-logo.png",
      connected: isResolveConnected,
      timelineName: resolveTimeline?.name,
      connectedText: t("titlebar.resolve.tooltip.connected"),
      disconnectedText: t("titlebar.resolve.tooltip.cantConnect"),
      helperText: isResolveConnected
        ? t("titlebar.resolve.tooltip.canGetAudio")
        : t("titlebar.resolve.tooltip.openResolve"),
      refresh: refreshResolve,
    },
    premiere: {
      productName: t("titlebar.premiere.productName"),
      logo: "/premiere-logo.png",
      connected: isPremiereConnected,
      timelineName: premiereTimeline?.name,
      connectedText: t("titlebar.premiere.tooltip.connected"),
      disconnectedText: t("titlebar.premiere.tooltip.disconnected"),
      helperText: isPremiereConnected
        ? t("titlebar.premiere.tooltip.canGetAudio")
        : t("titlebar.premiere.tooltip.openPremiere"),
      refresh: refreshAdobe,
    },
    aftereffects: {
      productName: t("titlebar.aftereffects.productName"),
      logo: "/aftereffects-logo.png",
      connected: isAfterEffectsConnected,
      timelineName: afterEffectsTimeline?.name,
      connectedText: t("titlebar.aftereffects.tooltip.connected"),
      disconnectedText: t("titlebar.aftereffects.tooltip.disconnected"),
      helperText: isAfterEffectsConnected
        ? t("titlebar.aftereffects.tooltip.canGetAudio")
        : t("titlebar.aftereffects.tooltip.openAfterEffects"),
      refresh: refreshAdobe,
    },
  } satisfies Record<
    Integration,
    {
      productName: string;
      logo: string;
      connected: boolean;
      timelineName?: string;
      connectedText: string;
      disconnectedText: string;
      helperText: string;
      refresh: () => Promise<void>;
    }
  >;

  const activeIntegration = integrations[selectedIntegration];
  const activeLabel = activeIntegration.connected
    ? activeIntegration.timelineName || activeIntegration.connectedText
    : activeIntegration.productName;

  return (
    <div
      className="flex items-center gap-1 select-none"
      data-tauri-drag-region="false"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={`flex items-center gap-2 h-7 text-xs px-2 !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 ${
              activeIntegration.connected
                ? "hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900 dark:hover:text-green-300"
                : "hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950 dark:hover:text-red-300"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${activeIntegration.connected ? "bg-green-500" : "bg-red-500"}`}
            />
            <img
              src={activeIntegration.logo}
              alt={activeIntegration.productName}
              className="h-4 w-4"
            />
            <span className="max-w-[120px] truncate">{activeLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-80 z-50">
          <div className="px-2 py-1.5">
            <div className="flex items-start gap-3">
              <img
                src={activeIntegration.logo}
                alt={activeIntegration.productName}
                className="h-8 w-8"
              />
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">
                  {activeIntegration.productName}
                </h4>
                <p
                  className={`text-sm ${activeIntegration.connected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                >
                  {activeIntegration.connected
                    ? activeIntegration.connectedText
                    : activeIntegration.disconnectedText}
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeIntegration.helperText}
                </p>
              </div>
            </div>
          </div>
          <DropdownMenuSeparator />
          {(Object.keys(integrations) as Integration[]).map((integration) => {
            const item = integrations[integration];
            return (
              <DropdownMenuItem
                key={integration}
                onClick={() => setSelectedIntegration(integration)}
                className="cursor-pointer"
              >
                <div
                  className={`w-2 h-2 rounded-full ${item.connected ? "bg-green-500" : "bg-red-500"}`}
                />
                <img
                  src={item.logo}
                  alt={item.productName}
                  className="h-4 w-4"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span>{item.productName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.connected
                      ? item.timelineName || item.connectedText
                      : item.disconnectedText}
                  </span>
                </div>
                {selectedIntegration === integration ? (
                  <Check className="h-4 w-4" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              void activeIntegration.refresh();
            }}
            className="cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>{t("common.refresh", "Refresh")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SettingsDropdown() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { modelsState, downloadedModelValues, handleDeleteModel } = useModels();
  const [manageModelsOpen, setManageModelsOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);

  // The diarization model is handled separately from transcription models and only added
  // to the model manager when it's actually downloaded. This is because it's a different
  // type of model (speaker diarization vs speech transcription) and has a different
  // download/management pattern.
  const managerModels: Model[] = downloadedModelValues.includes(
    diarizeModel.value,
  )
    ? [...modelsState, { ...diarizeModel, isDownloaded: true }]
    : modelsState;

  const handleThemeChange = (themeValue: string) => {
    setTheme(themeValue as "dark" | "light" | "system");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            data-tauri-drag-region="false"
            className="gap-2 rounded-sm !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-48 rounded-lg"
          side="bottom"
          align="end"
          sideOffset={4}
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => setSettingsDialogOpen(true)}
              className="cursor-pointer"
            >
              <Settings />
              <span>{t("settings.title", "Settings")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setManageModelsOpen(true)}
              className="cursor-pointer"
            >
              <Boxes />
              <span>{t("models.manage.title", "Manage Models")}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem asChild className="cursor-pointer">
              <a
                href="https://github.com/tmoroney/auto-subs"
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <GitMerge />
                <span>{t("settings.support.viewSource", "View Source")}</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setSupportDialogOpen(true)}
              className="cursor-pointer focus:bg-pink-100 focus:text-pink-700 data-[highlighted]:bg-pink-100 data-[highlighted]:text-pink-700 dark:focus:bg-pink-900/50 dark:focus:text-pink-500 dark:data-[highlighted]:bg-pink-900/50 dark:data-[highlighted]:text-pink-500"
            >
              <div className="group relative flex w-full items-center">
                <Heart className="h-4 w-4 mr-2 text-pink-500 group-data-[highlighted]:fill-pink-500 group-focus:fill-pink-500 transition-all" />
                <span>
                  {t("settings.support.supportAutoSubs", "Support AutoSubs")}
                </span>

                {/* Bursting hearts animation */}
                <div className="absolute inset-0 pointer-events-none">
                  {[
                    { tx: "-90px", ty: "-90px", s: 1.8, r: "-20deg", d: "0s" },
                    {
                      tx: "80px",
                      ty: "-100px",
                      s: 1.5,
                      r: "25deg",
                      d: "0.05s",
                    },
                    { tx: "-30px", ty: "-120px", s: 1.7, r: "5deg", d: "0.1s" },
                    {
                      tx: "100px",
                      ty: "-80px",
                      s: 1.4,
                      r: "-15deg",
                      d: "0.15s",
                    },
                    { tx: "0px", ty: "-115px", s: 1.9, r: "0deg", d: "0.2s" },
                    {
                      tx: "-100px",
                      ty: "-75px",
                      s: 1.5,
                      r: "15deg",
                      d: "0.25s",
                    },
                    { tx: "70px", ty: "-115px", s: 1.6, r: "-5deg", d: "0.3s" },
                  ].map((p, i) => (
                    <Heart
                      key={i}
                      className="heart-anim absolute top-1/2 left-1/2 h-5 w-5 text-pink-400 opacity-0"
                      style={
                        {
                          "--tx": p.tx,
                          "--ty": p.ty,
                          "--s": p.s,
                          "--r": p.r,
                          animationDelay: p.d,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          {/* Theme Tabs */}
          <div className="p-1">
            <Tabs value={theme} onValueChange={handleThemeChange}>
              <TabsList className="w-full">
                <TabsTrigger value="light">
                  <Sun className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="dark">
                  <Moon className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="system">
                  <Monitor className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <ManageModelsDialog
        open={manageModelsOpen}
        onOpenChange={setManageModelsOpen}
        models={managerModels}
        onDeleteModel={handleDeleteModel}
      />

      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
      />

      <SupportDialog
        open={supportDialogOpen}
        onOpenChange={setSupportDialogOpen}
      />
    </>
  );
}

function SubtitleHistoryButton({
  onSubtitleDocumentOpen,
}: {
  onSubtitleDocumentOpen?: () => void;
}) {
  const historyIconRef = useRef<HistoryIconHandle>(null);

  return (
    <SubtitleHistoryPopover
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          data-tauri-drag-region="false"
          className="gap-2 rounded-sm"
          onMouseEnter={() => historyIconRef.current?.startAnimation()}
          onMouseLeave={() => historyIconRef.current?.stopAnimation()}
        >
          <ArchiveIcon ref={historyIconRef} size={16} />
        </Button>
      }
      onSubtitleDocumentOpen={onSubtitleDocumentOpen}
      align="end"
    />
  );
}

function UpdateStatusIndicator({
  phase,
  percentage,
  version,
}: {
  phase: string;
  percentage: number | null;
  version: string | null;
}) {
  const { t } = useTranslation();

  const handleInstallUpdate = () => {
    localStorage.setItem(UPDATE_RESTART_NOTICE_KEY, "1");
    invoke("trigger_install_update");
  };

  if (phase === "downloading") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner className="h-3 w-3" />
        <span>
          {t("titlebar.update.downloading", "Downloading Update")}{" "}
          {percentage != null ? `${percentage}%` : ""}
        </span>
      </div>
    );
  }

  if (phase === "installing" || phase === "restarting") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner className="h-3 w-3" />
        <span>
          {phase === "installing"
            ? t("titlebar.update.installing", "Installing Update")
            : t("titlebar.update.restarting", "Restarting AutoSubs")}
        </span>
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <Button
        variant="ghost"
        className="flex items-center gap-2 h-7 text-xs text-green-600 dark:text-green-400 hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900 dark:hover:text-green-300"
        onClick={handleInstallUpdate}
      >
        <RotateCcw className="h-3 w-3" />
        {t("titlebar.update.installUpdateNow", "Install and Restart")}
      </Button>
    );
  }

  if (phase === "available-link") {
    return (
      <a
        href="https://github.com/tmoroney/auto-subs/releases/latest"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 h-7 px-2 rounded text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900 dark:hover:text-blue-300 transition-colors"
      >
        <RotateCcw className="h-3 w-3" />
        {t("titlebar.update.newVersionAvailable", "Update Available")}
        {version ? ` (v${version})` : ""}
      </a>
    );
  }

  return null;
}

export function Titlebar({
  onOpenCompactViewer,
}: {
  onOpenCompactViewer?: () => void;
}) {
  const { t } = useTranslation();
  const [isMacOS, setIsMacOS] = useState(false);
  const { phase, percentage, version } = useUpdateStatus();

  useEffect(() => {
    const checkPlatform = async () => {
      const currentPlatform = await platform();
      setIsMacOS(currentPlatform === "macos");
    };
    checkPlatform();
  }, []);

  const centerContent =
    phase === "downloading" ||
    phase === "ready" ||
    phase === "installing" ||
    phase === "restarting" ||
    phase === "available-link" ? (
      <UpdateStatusIndicator
        phase={phase}
        percentage={percentage}
        version={version}
      />
    ) : (
      <IntegrationStatus />
    );

  const handleMinimize = () => {
    getCurrentWindow().minimize();
  };

  const handleMaximize = () => {
    getCurrentWindow().toggleMaximize();
  };

  const handleClose = () => {
    getCurrentWindow().close();
  };

  return (
    <header
      className="flex items-center justify-between h-9 px-1 bg-card backdrop-blur select-none z-50"
      data-tauri-drag-region
    >
      {isMacOS ? (
        // macOS layout: System handles traffic lights, status in center, settings on right
        <>
          {/* Left side - Empty spacer for system traffic lights */}
          <div className="w-20" data-tauri-drag-region />

          {/* Center - Resolve status */}
          <div
            className="flex items-center justify-center flex-1"
            data-tauri-drag-region
            data-tour="connection-indicator"
          >
            {centerContent}
          </div>

          {/* Right side - Subtitle history and settings buttons */}
          <div className="flex items-center w-24 justify-end">
            <div data-tauri-drag-region="false" data-tour="history-button">
              <SubtitleHistoryButton
                onSubtitleDocumentOpen={onOpenCompactViewer}
              />
            </div>
            <div data-tauri-drag-region="false">
              <SettingsDropdown />
            </div>
          </div>
        </>
      ) : (
        // Windows/Linux layout: Settings on left, status in center, window buttons on right
        <>
          {/* Left side - Subtitle history and settings */}
          <div className="flex items-center">
            <div data-tauri-drag-region="false">
              <SettingsDropdown />
            </div>
            <div data-tauri-drag-region="false" data-tour="history-button">
              <SubtitleHistoryButton
                onSubtitleDocumentOpen={onOpenCompactViewer}
              />
            </div>
          </div>

          {/* Center - Resolve status */}
          <div
            className="flex items-center justify-center flex-1"
            data-tauri-drag-region
            data-tour="connection-indicator"
          >
            {centerContent}
          </div>

          {/* Right side - Window controls */}
          <div className="flex items-center gap-1 controls">
            <button
              className="hover:bg-accent rounded px-2 h-7 flex items-center justify-center transition-colors"
              onClick={handleMinimize}
              data-tauri-drag-region="false"
              aria-label={t("titlebar.windowControls.minimize")}
            >
              <Minus className="h-3 w-3" />
            </button>
            <button
              className="hover:bg-accent rounded px-2 h-7 flex items-center justify-center transition-colors"
              onClick={handleMaximize}
              data-tauri-drag-region="false"
              aria-label={t("titlebar.windowControls.maximize")}
            >
              <Square className="h-3 w-3" />
            </button>
            <button
              className="hover:bg-destructive hover:text-destructive-foreground rounded px-2 h-7 flex items-center justify-center transition-colors"
              onClick={handleClose}
              data-tauri-drag-region="false"
              aria-label={t("titlebar.windowControls.close")}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
    </header>
  );
}
