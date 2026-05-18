import * as React from "react";
import { AudioLines, MonitorIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { downloadDir } from "@tauri-apps/api/path";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/animated-tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  UploadIcon,
  type UploadIconHandle,
} from "@/components/ui/icons/upload";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";
import type { Track } from "@/types";
import { SUPPORTED_MEDIA_EXTENSIONS } from "./utils";

interface SourceModeTabsProps {
  audioInputMode: "file" | "timeline";
  onAudioInputModeChange: (mode: "file" | "timeline") => void;
  onSwitchToTimeline: () => void;
}

export function SourceModeTabs({
  audioInputMode,
  onAudioInputModeChange,
  onSwitchToTimeline,
}: SourceModeTabsProps) {
  const { t, i18n } = useTranslation();
  const uploadIconRef = React.useRef<UploadIconHandle>(null);

  return (
    <Tabs
      value={audioInputMode}
      onValueChange={(value) => {
        const mode = value as "file" | "timeline";
        onAudioInputModeChange(mode);
        if (mode === "timeline") {
          onSwitchToTimeline();
        }
      }}
      data-tour="mode-switcher"
      key={i18n.language}
      className="w-full"
    >
      <TabsList className="h-9 w-full p-1">
        <TabsTrigger value="timeline" className="h-7 gap-1.5 px-3 text-sm">
          <MonitorIcon className="size-4" />
          {t("actionBar.mode.timeline")}
        </TabsTrigger>
        <TabsTrigger
          value="file"
          className="h-7 gap-1.5 px-3 text-sm"
          onMouseEnter={() => uploadIconRef.current?.startAnimation()}
          onMouseLeave={() => uploadIconRef.current?.stopAnimation()}
        >
          <UploadIcon ref={uploadIconRef} className="size-4" size={16} />
          {t("actionBar.mode.fileInput")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

interface FileDropAreaProps {
  selectedFile: string | null;
  onSelectedFileChange: (file: string | null) => void;
  className?: string;
}

export function FileDropArea({
  selectedFile,
  onSelectedFileChange,
  className = "min-h-0 flex-1",
}: FileDropAreaProps) {
  const { t } = useTranslation();
  const iconRef = React.useRef<UploadIconHandle>(null);

  const handleFileSelect = React.useCallback(async () => {
    const file = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: t("actionBar.fileDialog.mediaFiles"),
          extensions: SUPPORTED_MEDIA_EXTENSIONS,
        },
      ],
      defaultPath: await downloadDir(),
    });
    onSelectedFileChange(file);
  }, [t, onSelectedFileChange]);

  return (
    <div
      key="file-drop-area"
      className={`group flex w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-muted-foreground/25 bg-muted/10 px-4 py-4 transition-colors hover:bg-muted/30 hover:border-muted-foreground/40 outline-none ${className}`}
      data-tour="audio-input"
      tabIndex={0}
      role="button"
      aria-label={t("actionBar.fileDrop.aria")}
      onClick={handleFileSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleFileSelect();
      }}
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
    >
      {selectedFile ? (
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full bg-green-500/10 p-3 text-green-500">
            <UploadIcon ref={iconRef} size={24} />
          </div>
          <span className="text-sm font-medium text-foreground truncate px-2 text-center max-w-[280px]">
            {selectedFile.split("/").pop()}
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full bg-black/5 dark:bg-white/5 p-3 text-muted-foreground group-hover:text-foreground transition-colors">
            <UploadIcon ref={iconRef} size={24} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">
              {t("actionBar.fileDrop.prompt")}
            </span>
            <span className="text-xs text-muted-foreground/80">
              {t("actionBar.fileDrop.supports")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface TimelineTrackSelectorProps {
  inputTracks: Track[];
  selectedIntegration: "davinci" | "premiere" | "aftereffects";
}

export function TimelineTrackSelector({
  inputTracks,
  selectedIntegration,
}: TimelineTrackSelectorProps) {
  const { t } = useTranslation();
  const { settings: currentSettings, updateSetting } = useSettings();

  const selectedTracks =
    currentSettings.selectedInputTracksByApp[selectedIntegration] || [];
  const selectedTrackCount = selectedTracks.length;

  const toggleInputTrack = React.useCallback(
    (trackId: string) => {
      const currentTracks =
        currentSettings.selectedInputTracksByApp[selectedIntegration] || [];
      const isSelected = currentTracks.includes(trackId);
      const nextTracks = isSelected
        ? currentTracks.filter((id: string) => id !== trackId)
        : [...currentTracks, trackId];

      const nextMap = {
        ...currentSettings.selectedInputTracksByApp,
        [selectedIntegration]: nextTracks,
      };

      updateSetting("selectedInputTracksByApp", nextMap);
    },
    [
      currentSettings.selectedInputTracksByApp,
      selectedIntegration,
      updateSetting,
    ],
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-tour="audio-input"
    >
      {inputTracks.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-background">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
              {selectedTrackCount > 0
                ? t("actionBar.tracks.countSelected", {
                    count: selectedTrackCount,
                  })
                : t("actionBar.tracks.noneSelected")}
            </span>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>{t("actionBar.tracks.exportRange.inout")}</span>
              <Switch
                checked={currentSettings.exportRange === "inout"}
                onCheckedChange={(checked) =>
                  updateSetting("exportRange", checked ? "inout" : "entire")
                }
                aria-label={t("actionBar.tracks.exportRange.inout")}
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2 pt-0 pr-2.5">
            {inputTracks.map((track, index) => {
              const isChecked = selectedTracks.includes(track.value);

              return (
                <div
                  key={track.value}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-all",
                    isChecked
                      ? "bg-card shadow-sm"
                      : "border-transparent bg-transparent hover:bg-muted/50",
                  )}
                  onClick={() => toggleInputTrack(track.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleInputTrack(track.value);
                    }
                  }}
                >
                  <Checkbox
                    checked={isChecked}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="pointer-events-none border-muted-foreground/35 data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
                  />
                  <AudioLines
                    className={cn(
                      "h-4 w-4 transition-colors",
                      isChecked ? "text-foreground" : "text-muted-foreground",
                    )}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm font-medium transition-colors",
                      isChecked ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {track.label}
                  </span>
                  <span
                    className={cn(
                      "flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-xs font-semibold transition-colors",
                      isChecked
                        ? "border-primary/15 bg-muted/45 text-foreground"
                        : "border-transparent bg-muted/20 text-muted-foreground/70",
                    )}
                  >
                    {index + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center rounded-lg border border-dashed bg-muted/10 px-4 text-center">
          <p className="text-sm text-muted-foreground">
            {t("actionBar.tracks.createTrack")}
          </p>
        </div>
      )}
    </div>
  );
}
