import * as React from "react";
import { Type } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/animated-tabs";
import { TextFormattingPanel } from "@/components/settings/text-formatting-panel";
import { useSettingsStore } from "@/stores/settings-store";
import {
  ChevronsUpDownIcon,
  type ChevronsUpDownIconHandle,
} from "@/components/ui/icons/chevrons-up-down";
import { getDensityCharLimits } from "@/api/formatting-api";

type DensityLimits = { less: number; standard: number; more: number };
type TextDensity = "single" | "less" | "standard" | "more" | "custom";

// Latin-profile fallback shown until the backend command resolves real values.
const DEFAULT_LIMITS: DensityLimits = { less: 27, standard: 38, more: 49 };

const PRESETS = ["single", "less", "standard", "more"] as const;

export function FormatRow() {
  const { t, i18n } = useTranslation();
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

  const chevronsRef = React.useRef<ChevronsUpDownIconHandle>(null);
  const [openFormatting, setOpenFormatting] = React.useState(false);
  const [limits, setLimits] = React.useState<DensityLimits>(DEFAULT_LIMITS);
  const outputLanguage = translate ? targetLanguage : language;

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

  const isCustom = textDensity === "custom";
  const isWords = customDensityUnit === "words";
  const customLabel = isWords
    ? t("actionBar.format.customWordsDescription")
    : t("actionBar.format.customCharsDescription");
  const styleLabel = t("actionBar.rows.format", "Format");

  const optionContent = (value: TextDensity) => (
    <>
      {t(`actionBar.format.textDensity.${value}`)}
      {value !== "single" && value !== "custom" ? (
        <span className="ml-2 font-normal text-muted-foreground/60">
          {t("actionBar.density.charsShort", { count: limits[value] })}
        </span>
      ) : null}
    </>
  );

  const handleDensityChange = (value: string) => {
    // Seed the custom limit from the preset being left so the number starts
    // from what was on screen.
    if (
      value === "custom" &&
      (textDensity === "less" ||
        textDensity === "standard" ||
        textDensity === "more")
    ) {
      updateSetting("customMaxCharsPerLine", limits[textDensity]);
    }
    updateSetting("textDensity", value as TextDensity);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
      <Select value={textDensity} onValueChange={handleDensityChange}>
        <SelectTrigger
          aria-label={t("actionBar.format.textDensityTitle")}
          icon={<ChevronsUpDownIcon ref={chevronsRef} className="shrink-0 [&_svg]:size-4" />}
          onMouseEnter={() => chevronsRef.current?.startAnimation()}
          onMouseLeave={() => chevronsRef.current?.stopAnimation()}
          className="group h-10 min-w-0 select-none justify-start gap-2 rounded-lg border-0 bg-muted/30 pl-4 pr-3 text-sm font-medium shadow-none transition-colors hover:bg-accent hover:text-primary focus:ring-0 dark:bg-muted [&>span:first-child]:flex-1 [&>span:first-child]:text-left"
        >
          <SelectValue>{optionContent(textDensity)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((value) => (
            <SelectItem key={value} value={value}>
              {optionContent(value)}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value="custom">{optionContent("custom")}</SelectItem>
        </SelectContent>
      </Select>

      <Popover open={openFormatting} onOpenChange={setOpenFormatting}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            aria-haspopup="listbox"
            aria-expanded={openFormatting}
            aria-label={styleLabel}
            title={styleLabel}
            className="group h-10 w-11 min-w-0 justify-center rounded-lg bg-muted/35 px-2 dark:bg-muted"
          >
            <Type className="shrink-0 text-foreground transition-colors group-hover:text-primary" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 p-0"
          align="center"
          side="top"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <TextFormattingPanel hideDensity />
        </PopoverContent>
      </Popover>

      {isCustom ? (
        <div className="col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_72px] gap-2">
          <Tabs
            value={customDensityUnit}
            onValueChange={(value) =>
              updateSetting("customDensityUnit", value as "chars" | "words")
            }
            key={i18n.language}
            className="w-full"
          >
            <TabsList className="h-10 w-full rounded-lg bg-muted/30 p-1 dark:bg-muted">
              <TabsTrigger
                value="chars"
                className="h-8 min-w-0 truncate rounded-md px-1.5 text-sm"
              >
                {t("actionBar.density.characters")}
              </TabsTrigger>
              <TabsTrigger
                value="words"
                className="h-8 min-w-0 truncate rounded-md px-1.5 text-sm"
              >
                {t("actionBar.density.words")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            type="number"
            min="1"
            max={isWords ? "20" : "100"}
            step="1"
            value={isWords ? customMaxWordsPerLine : customMaxCharsPerLine}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const n = Math.max(1, Math.floor(Number(e.target.value) || 0));
              updateSetting(
                isWords ? "customMaxWordsPerLine" : "customMaxCharsPerLine",
                n,
              );
            }}
            aria-label={customLabel}
            title={customLabel}
            className="h-10 rounded-lg border-0 bg-muted/30 px-1 pr-3 text-center text-sm font-medium shadow-none dark:bg-muted"
          />
        </div>
      ) : null}
    </div>
  );
}
