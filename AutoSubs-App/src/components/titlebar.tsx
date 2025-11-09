import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { platform } from "@tauri-apps/plugin-os";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { SettingsDialog } from "@/components/settings-dialog";

interface TimelineInfo {
  timelineId?: string;
  name?: string;
}

interface ResolveStatusProps {
  timelineInfo: TimelineInfo | null;
}

function ResolveStatus({ timelineInfo }: ResolveStatusProps) {
  const isConnected = timelineInfo && timelineInfo.timelineId;
  
  return (
    <HoverCard>
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
          {isConnected ? "Connected" : "Disconnected"}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 z-50">
        <div className="flex items-start gap-3">
          <img
            src="/davinci-resolve-logo.png"
            alt="DaVinci Resolve"
            className="h-8 w-8"
          />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">DaVinci Resolve</h4>
            {isConnected ? (
              <div className="space-y-1">
                <p className="text-sm text-green-600 dark:text-green-400">
                  ✓ Connected
                </p>
                <p className="text-xs text-muted-foreground">
                  {timelineInfo?.name ? `Currently viewing: ${timelineInfo.name}` : "Ready to access timeline"}
                </p>
                <p className="text-xs text-muted-foreground">
                  You can get audio from the timeline and add subtitles back to it.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-red-600 dark:text-red-400">
                  Can't connect to timeline
                </p>
                <p className="text-xs text-muted-foreground">
                  Open DaVinci Resolve and go to Workspace → Scripts → AutoSubs
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
      className="titlebar flex items-center justify-between h-10 px-1 border-b bg-background/95 backdrop-blur select-none relative z-40"
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

          {/* Right side - Settings dialog */}
          <div className="flex items-center gap-2" data-tauri-drag-region>
            <SettingsDialog />
          </div>
        </>
      ) : (
        // Windows/Linux layout: Settings on left, status in center, window buttons on right
        <>
          {/* Left side - Settings dialog */}
          <div className="flex items-center gap-2" data-tauri-drag-region>
            <SettingsDialog />
          </div>

          {/* Center - Resolve status */}
          <div className="flex justify-center" data-tauri-drag-region>
            <ResolveStatus timelineInfo={timelineInfo} />
          </div>

          {/* Right side - Window controls */}
          <div className="flex items-center gap-1 controls">
            <button
              className="hover:bg-accent rounded px-2 h-7 flex items-center justify-center transition-colors"
              onClick={handleMinimize}
              data-tauri-drag-region="false"
              aria-label="Minimize"
            >
              <Minus className="h-3 w-3" />
            </button>
            <button
              className="hover:bg-accent rounded px-2 h-7 flex items-center justify-center transition-colors"
              onClick={handleMaximize}
              data-tauri-drag-region="false"
              aria-label="Maximize"
            >
              <Square className="h-3 w-3" />
            </button>
            <button
              className="hover:bg-destructive hover:text-destructive-foreground rounded px-2 h-7 flex items-center justify-center transition-colors"
              onClick={handleClose}
              data-tauri-drag-region="false"
              aria-label="Close"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
    </header>
  );
}
