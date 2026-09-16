import * as React from "react";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpeakerChips } from "@/components/subtitles/speaker-chips";
import { CaptionStyleSection } from "@/components/captions/caption-style-section";
import type { CaptionPresetActions } from "@/components/captions/use-caption-presets";
import type { ResolveTemplatesState } from "@/components/captions/use-resolve-templates";
import type { ConflictInfo } from "@/api/resolve-api";
import { useSettingsStore } from "@/stores/settings-store";
import type { OutputSection } from "@/stores/output-panel-store";
import { cn } from "@/lib/utils";
import type { CaptionPreset, CaptionStyle, Speaker, TimelineInfo } from "@/types";

interface OutputSheetProps {
  closing: boolean;
  isConnected: boolean;
  /** Caption styles are a DaVinci Resolve feature; Adobe hosts get tracks only. */
  showCaptionStyle: boolean;
  focusSection: OutputSection | null;
  onFocusHandled: () => void;
  onBack: () => void;
  outputTracks: TimelineInfo["outputTracks"];
  conflictInfo: ConflictInfo | null;
  speakers: Speaker[];
  onSpeakerChange: (index: number, speaker: Speaker) => void;
  captionStyle: CaptionStyle;
  presets: CaptionPresetActions;
  templates: ResolveTemplatesState;
  onEditPreset: (preset: CaptionPreset | null) => void;
}

/**
 * The output configuration surface: a distinct sheet over the transcript
 * rather than a silent replacement of it, so the header names where you are
 * and how to get back.
 */
export function OutputSheet({
  closing,
  isConnected,
  showCaptionStyle,
  focusSection,
  onFocusHandled,
  onBack,
  outputTracks,
  conflictInfo,
  speakers,
  onSpeakerChange,
  captionStyle,
  presets,
  templates,
  onEditPreset,
}: OutputSheetProps) {
  const { t } = useTranslation();
  const selectedOutputTrack = useSettingsStore((s) => s.selectedOutputTrack);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const trackRef = React.useRef<HTMLDivElement>(null);
  const styleRef = React.useRef<HTMLDivElement>(null);
  const speakersRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!focusSection) return;
    const target =
      focusSection === "track"
        ? trackRef.current
        : focusSection === "style"
          ? styleRef.current
          : focusSection === "speakers"
            ? speakersRef.current
            : null;
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
    onFocusHandled();
  }, [focusSection, onFocusHandled]);

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex flex-col bg-background duration-200",
        closing
          ? "animate-out fade-out slide-out-to-bottom-2"
          : "animate-in fade-in slide-in-from-bottom-2",
      )}
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 pb-4 pt-2">
          <Button
            type="button"
            variant="ghost"
            className="-ml-1.5 mb-2 h-7 gap-1 px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={onBack}
          >
            <ChevronLeft className="size-4" />
            {t("common.back")}
          </Button>

          <div className="space-y-4">
            {!isConnected && (
              <p className="px-1 text-xs text-muted-foreground">
                {t("captions.notConnected")}
              </p>
            )}

            {outputTracks.length > 0 && (
              <section ref={trackRef} className="space-y-1.5">
                <Label className="pl-1 text-xs text-muted-foreground">
                  {t("captions.track.label")}
                </Label>
                <Select
                  value={selectedOutputTrack}
                  onValueChange={(value) =>
                    updateSetting("selectedOutputTrack", value)
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t("captions.track.placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {outputTracks.map((track) => (
                      <SelectItem key={track.value} value={track.value}>
                        {track.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {conflictInfo?.hasConflicts && (
                  <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span className="pl-1">
                      {t("captions.conflict.hasConflicts")}
                    </span>
                  </div>
                )}
              </section>
            )}

            {speakers.length > 1 && (
              <section ref={speakersRef} className="space-y-1.5">
                <Label className="pl-1 text-xs text-muted-foreground">
                  {t("captions.speakers.label", { count: speakers.length })}
                </Label>
                <SpeakerChips
                  speakers={speakers}
                  onSpeakerChange={onSpeakerChange}
                  tracks={outputTracks}
                />
              </section>
            )}

            {/* Style last: it is the only section that grows, so it owns the
                page scroll instead of fighting a nested one. */}
            {showCaptionStyle && (
              <div ref={styleRef}>
                <CaptionStyleSection
                  captionStyle={captionStyle}
                  presets={presets}
                  templates={templates}
                  isConnected={isConnected}
                  onEditPreset={onEditPreset}
                />
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
