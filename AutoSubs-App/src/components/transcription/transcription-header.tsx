import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { PanelRight, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { platform } from "@tauri-apps/plugin-os";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IntegrationStatus } from "@/components/layout/integration-status";
import { useUpdateStatus } from "@/hooks/use-update-status";
import { SettingsDropdown } from "./settings-dropdown";

interface TranscriptionHeaderProps {
  onViewSubtitles?: () => void;
  isSubtitleViewerOpen?: boolean;
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

  function handleInstallUpdate() {
    void invoke("trigger_install_update");
  }

  if (phase === "downloading") {
    return (
      <div className="flex h-7 min-w-0 items-center gap-1.5 rounded-sm px-1.5 text-xs text-muted-foreground">
        <Spinner className="size-3 shrink-0" />
        <span className="truncate">
          {t("titlebar.update.downloading", "Downloading Update")}
          {percentage != null ? ` ${percentage}%` : ""}
        </span>
      </div>
    );
  }

  if (phase === "installing" || phase === "restarting") {
    return (
      <div className="flex h-7 min-w-0 items-center gap-1.5 rounded-sm px-1.5 text-xs text-muted-foreground">
        <Spinner className="size-3 shrink-0" />
        <span className="truncate">
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
        type="button"
        variant="ghost"
        className="h-7 min-w-0 gap-1.5 rounded-sm px-1.5 text-xs text-green-600 hover:bg-green-100 hover:text-green-700 dark:text-green-400 dark:hover:bg-green-900 dark:hover:text-green-300"
        onClick={handleInstallUpdate}
      >
        <RotateCcw className="size-3 shrink-0" />
        <span className="truncate">
          {t("titlebar.update.installUpdateNow", "Install and Restart")}
        </span>
      </Button>
    );
  }

  if (phase === "available-link") {
    return (
      <a
        href="https://github.com/tmoroney/auto-subs/releases/latest"
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-7 min-w-0 items-center gap-1.5 rounded-sm px-1.5 text-xs text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900 dark:hover:text-blue-300"
      >
        <RotateCcw className="size-3 shrink-0" />
        <span className="truncate">
          {t("titlebar.update.newVersionAvailable", "Update Available")}
          {version ? ` (v${version})` : ""}
        </span>
      </a>
    );
  }

  return null;
}

export function TranscriptionHeader({
  onViewSubtitles,
  isSubtitleViewerOpen = false,
}: TranscriptionHeaderProps) {
  const { t } = useTranslation();
  const [isMacOs, setIsMacOs] = React.useState(true);
  const { phase, percentage, version } = useUpdateStatus();

  React.useEffect(() => {
    try {
      setIsMacOs(platform() === "macos");
    } catch {
      setIsMacOs(true);
    }
  }, []);

  const shouldShowUpdateStatus =
    phase === "downloading" ||
    phase === "ready" ||
    phase === "installing" ||
    phase === "restarting" ||
    phase === "available-link";

  return (
    <>
      <div
        className={`flex h-12 shrink-0 items-center justify-between gap-3 border-b mb-2 pr-2 ${isMacOs ? "pl-20" : "pl-4"}`}
        data-tauri-drag-region={isMacOs ? true : undefined}
      >
        <div
          className="min-w-0"
          data-tauri-drag-region={isMacOs ? "false" : undefined}
        >
          {shouldShowUpdateStatus ? (
            <UpdateStatusIndicator
              phase={phase}
              percentage={percentage}
              version={version}
            />
          ) : (
            <IntegrationStatus />
          )}
        </div>
        <div
          className="flex shrink-0 items-center"
          data-tauri-drag-region={isMacOs ? "false" : undefined}
        >
          <SettingsDropdown />
          {onViewSubtitles && !isSubtitleViewerOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("completion.viewSubtitles", "View Subtitles")}
                  onClick={onViewSubtitles}
                >
                  <PanelRight />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("completion.viewSubtitles", "View Subtitles")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </>
  );
}
