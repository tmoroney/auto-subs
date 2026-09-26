import * as React from "react";
import { Pencil, PencilOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";

type TextDensity = "single" | "less" | "standard" | "more" | "custom";

const PRESETS = ["single", "less", "standard", "more"] as const;

export function DensityRow() {
  const { t } = useTranslation();
  const textDensity = useSettingsStore((s) => s.textDensity);
  const customMaxCharsPerLine = useSettingsStore(
    (s) => s.customMaxCharsPerLine,
  );
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const isPreset = (PRESETS as readonly string[]).includes(textDensity);
  const isCustom = textDensity === "custom";

  // While in custom mode the slider still shows the last chosen preset's
  // position; dragging it picks a preset and leaves custom.
  const lastPresetRef = React.useRef<TextDensity>(
    isPreset ? textDensity : "standard",
  );
  if (isPreset) lastPresetRef.current = textDensity;

  const sliderIndex = PRESETS.indexOf(
    (isPreset ? textDensity : lastPresetRef.current) as (typeof PRESETS)[number],
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
      {isCustom ? (
        <div className="flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg bg-muted/35 pl-3 pr-1 dark:bg-muted">
          <p
            className="min-w-0 truncate text-sm text-muted-foreground"
            title={t("actionBar.format.customCharsDescription")}
          >
            {t("actionBar.density.characters")}
          </p>
          <Input
            type="number"
            min="1"
            max="100"
            step="1"
            value={customMaxCharsPerLine}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const n = Math.max(1, Math.floor(Number(e.target.value) || 0));
              updateSetting("customMaxCharsPerLine", n);
            }}
            aria-label={t("actionBar.format.customCharsDescription")}
            className="h-8 w-12 shrink-0 rounded-md border-0 bg-background text-center shadow-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:bg-background/60"
          />
        </div>
      ) : (
        <div className="flex h-10 min-w-0 items-center gap-3 rounded-lg bg-muted/35 px-3 dark:bg-muted">
          <Slider
            value={[Math.max(0, sliderIndex)]}
            min={0}
            max={PRESETS.length - 1}
            step={1}
            onValueChange={(v) =>
              updateSetting("textDensity", PRESETS[v[0]] as TextDensity)
            }
            aria-label={t("actionBar.format.textDensityTitle")}
            className="flex-1 min-w-[64px]"
          />
          <span
            className="grid shrink-0 max-w-[50%] grid-cols-[minmax(0,1fr)] justify-items-end text-sm font-semibold"
            title={t(`actionBar.format.textDensity.${textDensity}`)}
          >
            {PRESETS.map(
              (value) => (
                <span
                  key={value}
                  aria-hidden={value !== textDensity || undefined}
                  className={cn(
                    "col-start-1 row-start-1 max-w-full truncate",
                    value !== textDensity && "invisible",
                  )}
                >
                  {value === "single"
                    ? t("actionBar.density.word")
                    : t(`actionBar.format.textDensity.${value}`)}
                </span>
              ),
            )}
          </span>
        </div>
      )}

      <Button
        variant="ghost"
        size="default"
        aria-pressed={isCustom}
        aria-label={
          isCustom
            ? t("actionBar.density.usePresets")
            : t("actionBar.format.textDensity.custom")
        }
        title={
          isCustom
            ? t("actionBar.density.usePresets")
            : t("actionBar.format.textDensity.custom")
        }
        onClick={() =>
          updateSetting(
            "textDensity",
            isCustom ? lastPresetRef.current : "custom",
          )
        }
        className="group h-10 w-11 min-w-0 justify-center rounded-lg bg-muted/35 px-2 dark:bg-muted"
      >
        {isCustom ? (
          <PencilOff className="size-4 shrink-0 group-hover:text-primary transition-colors" />
        ) : (
          <Pencil className="size-4 shrink-0 group-hover:text-primary transition-colors" />
        )}
      </Button>
    </div>
  );
}
