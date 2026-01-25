import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { platform } from "@tauri-apps/plugin-os";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useTheme } from "@/components/theme-provider";

interface TimelineInfo {
  timelineId?: string;
  name?: string;
}

interface ResolveStatusProps {
  timelineInfo: TimelineInfo | null;
}

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  
  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      data-tauri-drag-region="false"
      className="gap-2"
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

function ResolveStatus({ timelineInfo }: ResolveStatusProps) {
  const { t } = useTranslation();
  const isConnected = timelineInfo && timelineInfo.timelineId;
  
  return (
    <HoverCard openDelay={400}>
      <HoverCardTrigger asChild>
        <Button 
          variant="ghost" 
          className={`flex items-center gap-2 h-7 text-xs ${
            isConnected 
              ? "hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900 dark:hover:text-green-300" 
              : "hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950 dark:hover:text-red-300"
          }`}
        >
          <div 
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
          />
          {isConnected
            ? (timelineInfo?.name || t("titlebar.resolve.status.connected"))
            : t("titlebar.resolve.status.disconnected")}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 z-50">
        <div className="flex items-start gap-3">
          <img
            src="/davinci-resolve-logo.png"
            alt={t("titlebar.resolve.productName")}
            className="h-8 w-8"
          />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">{t("titlebar.resolve.productName")}</h4>
            {isConnected ? (
              <div className="space-y-1">
                <p className="text-sm text-green-600 dark:text-green-400">
                  ✓ {t("titlebar.resolve.tooltip.connected")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {timelineInfo?.name
                    ? t("titlebar.resolve.tooltip.currentlyViewing", { name: timelineInfo.name })
                    : t("titlebar.resolve.tooltip.ready")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("titlebar.resolve.tooltip.canGetAudio")}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-red-600 dark:text-red-400">
                  {t("titlebar.resolve.tooltip.cantConnect")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("titlebar.resolve.tooltip.openResolve")}
                </p>
              </div>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function Titlebar({ timelineInfo }: { timelineInfo: TimelineInfo | null }) {
  const { t } = useTranslation();
  const [isMacOS, setIsMacOS] = useState(false);

  useEffect(() => {
    const checkPlatform = async () => {
      const currentPlatform = await platform();
      setIsMacOS(currentPlatform === "macos");
    };
    checkPlatform();
  }, []);

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
      className="titlebar flex items-center justify-between h-9 px-1 border-b bg-background/95 backdrop-blur select-none relative z-40"
      data-tauri-drag-region
      onMouseDown={() => getCurrentWindow().startDragging()}
    >
      {isMacOS ? (
        // macOS layout: System handles traffic lights, status in center, settings on right
        <>
          {/* Left side - Empty spacer for system traffic lights */}
          <div className="w-20" data-tauri-drag-region />

          {/* Center - Resolve status */}
          <div className="flex items-center justify-center flex-1" data-tauri-drag-region>
            <ResolveStatus timelineInfo={timelineInfo} />
          </div>

          {/* Right side - Theme switcher */}
          <div className="flex items-center gap-2 w-20 justify-end" data-tauri-drag-region>
            <ThemeSwitcher />
          </div>
        </>
      ) : (
        // Windows/Linux layout: Settings on left, status in center, window buttons on right
        <>
          {/* Left side - Theme switcher */}
          <div className="flex items-center gap-2" data-tauri-drag-region>
            <ThemeSwitcher />
          </div>

          {/* Center - Resolve status */}
          <div className="flex items-center justify-center flex-1" data-tauri-drag-region>
            <ResolveStatus timelineInfo={timelineInfo} />
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
