import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CSSProperties } from "react";
import { Segmented } from "@/components/kit";
import type { Speaker } from "@/types";
import { DEFAULT_COLORS } from "@/utils/speaker-colors";
import { speakerDisplayColor } from "@/utils/speaker-index";

interface SpeakerMenuProps {
  speakers: Speaker[];
  onSpeakerChange: (index: number, speaker: Speaker) => void;
}

const STYLE_OPTIONS: Speaker["style"][] = ["None", "Fill", "Outline"];

export function SpeakerMenu({ speakers, onSpeakerChange }: SpeakerMenuProps) {
  const { t } = useTranslation();

  return (
    <div className="as-speaker-menu">
      <div className="as-speaker-menu-heading">{t("subtitles.speakers")}</div>
      {speakers.map((speaker, index) => {
        const style = speaker.style || "None";
        const speakerColor = speaker.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
        const hasCustomColor = !DEFAULT_COLORS.includes(speakerColor);

        return (
          <section className="as-speaker-menu-person" key={index}>
            <div className="as-speaker-name-row">
              <span
                className="as-speaker-row-dot"
                style={{ backgroundColor: speakerDisplayColor(speaker, index) }}
              />
              <input
                className="as-speaker-name-input"
                value={speaker.name}
                placeholder={t("speakerEditor.namePlaceholder")}
                aria-label={t("speakerEditor.name")}
                onChange={(event) =>
                  onSpeakerChange(index, { ...speaker, name: event.target.value })
                }
              />
            </div>
            <Segmented
              ariaLabel={t("speakerEditor.style")}
              value={style}
              onValueChange={(value) =>
                onSpeakerChange(index, {
                  ...speaker,
                  style: value as Speaker["style"],
                })
              }
              options={STYLE_OPTIONS.map((value) => ({
                value,
                label: t(`speakerEditor.colors.${value.toLowerCase()}`),
              }))}
              className="as-speaker-style-segmented"
            />
            {style !== "None" && (
              <div className="as-speaker-swatches">
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="as-speaker-swatch"
                    style={{ backgroundColor: color }}
                    title={color}
                    aria-label={color}
                    aria-pressed={speaker.color === color}
                    onClick={() => onSpeakerChange(index, { ...speaker, color })}
                  >
                    {speaker.color === color && <Check aria-hidden="true" />}
                  </button>
                ))}
                <label
                  className="as-speaker-custom-color"
                  style={{
                    "--as-speaker-custom-color-center": hasCustomColor
                      ? speakerColor
                      : "var(--as-pop)",
                  } as CSSProperties}
                >
                  <input
                    type="color"
                    value={speakerColor}
                    aria-label={t("speakerEditor.customColor")}
                    onChange={(event) =>
                      onSpeakerChange(index, { ...speaker, color: event.target.value })
                    }
                  />
                </label>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
