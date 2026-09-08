import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SpeakerSettings } from "@/components/common/speaker-settings";
import type { Speaker, Track } from "@/types";

/**
 * Speakers as a wrapping row of chips rather than a stack of forms. Each chip
 * opens the same settings popover the speaker pills in the transcript list
 * use, so there is one way to edit a speaker regardless of where you click.
 */
export function SpeakerChips({
  speakers,
  onSpeakerChange,
  tracks,
}: {
  speakers: Speaker[];
  onSpeakerChange: (index: number, speaker: Speaker) => void;
  tracks?: Track[];
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-1.5">
      {speakers.map((speaker, index) => (
        <Popover key={index}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs transition-colors hover:bg-muted/60"
            >
              <span
                className="size-2.5 shrink-0 rounded-full border"
                style={{
                  backgroundColor:
                    speaker.style === "None" ? "transparent" : speaker.color,
                  borderColor: speaker.color || "currentColor",
                }}
              />
              <span className="min-w-0 truncate">
                {speaker.name || t("subtitles.unknownSpeaker")}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[300px] p-3 pt-1.5"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <SpeakerSettings
              speaker={speaker}
              onSpeakerChange={(updated) => onSpeakerChange(index, updated)}
              tracks={tracks}
            />
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}
