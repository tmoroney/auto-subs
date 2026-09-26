import * as React from "react";
import { Pencil, PencilOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSettingsStore } from "@/stores/settings-store";
import { getDensityCharLimits } from "@/api/formatting-api";
import { cn } from "@/lib/utils";

type DensityLimits = { less: number; standard: number; more: number };

// Latin-profile fallback shown until the backend command resolves real values.
const DEFAULT_LIMITS: DensityLimits = { less: 27, standard: 38, more: 49 };

type TextDensity = "single" | "less" | "standard" | "more" | "custom";

const PRESETS = ["single", "less", "standard", "more"] as const;

export function DensityRow() {
  const { t } = useTranslation();
  const textDensity = useSettingsStore((s) => s.textDensity);
  const customMaxCharsPerLine = useSettingsStore(
    (s) => s.customMaxCharsPerLine,
  );
  const customMaxWordsPerLine = useSettingsStore(
    (s) => s.customMaxWordsPerLine,
  );
  const customDensityUnit = useSettingsStore((s) => s.customDensityUnit);
  const language = useSettingsStore((s) => s.language);
  const targetLanguage = useSettingsStore((s) => s.targetLanguage);
  const translate = useSettingsStore((s) => s.translate);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const outputLanguage = translate ? targetLanguage : language;
  const [limits, setLimits] = React.useState<DensityLimits>(DEFAULT_LIMITS);

  React.useEffect(() => {
    let cancelled = false;
    getDensityCharLimits(outputLanguage)
      .then((l) => {
        if (!cancelled) setLimits(l);
      })
      .catch(() => {
        // Keep the previous values on error.
      });
    return () => {
      cancelled = true;
    };
  }, [outputLanguage]);

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
          <Select
            value={customDensityUnit}
            onValueChange={(value) =>
              updateSetting("customDensityUnit", value as "chars" | "words")
            }
          >
            <SelectTrigger
              className="h-8 w-auto min-w-0 gap-1 border-0 bg-transparent px-0 shadow-none text-sm text-muted-foreground focus:ring-0 hover:text-foreground"
              title={
                customDensityUnit === "words"
                  ? t("actionBar.format.customWordsDescription")
                  : t("actionBar.format.customCharsDescription")
              }
            >
              <SelectValue className="truncate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chars">
                {t("actionBar.density.characters")}
              </SelectItem>
              <SelectItem value="words">
                {t("actionBar.density.words")}
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="1"
            max={customDensityUnit === "words" ? "20" : "100"}
            step="1"
            value={
              customDensityUnit === "words"
                ? customMaxWordsPerLine
                : customMaxCharsPerLine
            }
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const n = Math.max(1, Math.floor(Number(e.target.value) || 0));
              updateSetting(
                customDensityUnit === "words"
                  ? "customMaxWordsPerLine"
                  : "customMaxCharsPerLine",
                n,
              );
            }}
            aria-label={
              customDensityUnit === "words"
                ? t("actionBar.format.customWordsDescription")
                : t("actionBar.format.customCharsDescription")
            }
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
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="grid shrink-0 max-w-[50%] select-none grid-cols-[minmax(0,1fr)] justify-items-end text-sm font-semibold">
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
            </TooltipTrigger>
            <TooltipContent>
              {textDensity === "single"
                ? t("actionBar.format.textDensity.single")
                : t("actionBar.density.charsTooltip", {
                    name: t(`actionBar.format.textDensity.${textDensity}`),
                    count:
                      limits[textDensity as keyof DensityLimits] ??
                      limits.standard,
                  })}
            </TooltipContent>
          </Tooltip>
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
        onClick={() => {
          if (isCustom) {
            updateSetting("textDensity", lastPresetRef.current);
            return;
          }
          // Seed the custom char limit from the preset being left, so the
          // "Characters per line" value starts from what was on screen.
          const preset = lastPresetRef.current;
          if (preset === "less" || preset === "standard" || preset === "more") {
            updateSetting("customMaxCharsPerLine", limits[preset]);
          }
          updateSetting("textDensity", "custom");
        }}
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
