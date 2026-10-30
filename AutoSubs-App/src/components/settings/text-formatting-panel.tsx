import * as React from "react"
import { Check, ChevronDown, Settings2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Menu, MenuPopup, MenuRadioItem } from "@/components/kit/menu"
import { Switch as KitSwitch } from "@/components/kit/switch"
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { useShallow } from "zustand/react/shallow"
import { useSettingsStore } from "@/stores/settings-store"
import { useTranslation } from "react-i18next"
import { BUILT_IN_CENSOR_LISTS } from "@/censor/built-in-lists"
import { getActiveCensorWords } from "@/censor/merge"
import { CensorStyle, type Settings } from "@/types"

type SettingUpdateHandler = <K extends keyof Settings>(
    key: K,
    value: Settings[K],
) => void;

interface TextFormattingPanelProps {
    /** Show Cancel / Apply buttons at the bottom */
    showActions?: boolean
    /** Hide the Text Density select row and its custom-chars row (shown elsewhere in the UI) */
    hideDensity?: boolean
    showCustomDensityLimit?: boolean
    /** Hide the line-count input when another surface supplies a stepper. */
    hideLineCount?: boolean
    compactTranscriptMenu?: boolean
    onSettingChange?: SettingUpdateHandler
    onCancel?: () => void
    onApply?: () => void
    applyDisabled?: boolean
}

export function TextFormattingPanel({
    showActions = false,
    hideDensity = false,
    showCustomDensityLimit = false,
    hideLineCount = false,
    compactTranscriptMenu = false,
    onSettingChange,
    onCancel,
    onApply,
    applyDisabled = false,
}: TextFormattingPanelProps) {
    const { t } = useTranslation()
    const {
        textDensity,
        customMaxCharsPerLine,
        customMaxWordsPerLine,
        customDensityUnit,
        maxLinesPerSubtitle,
        textCase,
        removePunctuation,
        enableCensor,
        activeCensorLists,
        censoredWords,
        censorStyle,
    } = useSettingsStore(
        useShallow((s) => ({
            textDensity: s.textDensity,
            customMaxCharsPerLine: s.customMaxCharsPerLine,
            customMaxWordsPerLine: s.customMaxWordsPerLine,
            customDensityUnit: s.customDensityUnit,
            maxLinesPerSubtitle: s.maxLinesPerSubtitle,
            textCase: s.textCase,
            removePunctuation: s.removePunctuation,
            enableCensor: s.enableCensor,
            activeCensorLists: s.activeCensorLists,
            censoredWords: s.censoredWords,
            censorStyle: s.censorStyle,
        })),
    )
    const updateSetting = useSettingsStore((s) => s.updateSetting)
    const changeSetting = <K extends keyof Settings,>(key: K, value: Settings[K]) => {
        if (onSettingChange) {
            onSettingChange(key, value)
        } else {
            updateSetting(key, value)
        }
    }
    const [openCensorDialog, setOpenCensorDialog] = React.useState(false)
    const [newCensoredWord, setNewCensoredWord] = React.useState("")
    const SwitchControl = compactTranscriptMenu ? KitSwitch : Switch
    const settingRowClass = compactTranscriptMenu
        ? "as-format-setting-row"
        : "flex items-center justify-between"
    const settingLabelClass = compactTranscriptMenu
        ? "as-format-setting-label"
        : "text-sm font-medium"
    const settingDescriptionClass = compactTranscriptMenu
        ? "as-format-setting-description"
        : "text-xs text-muted-foreground"
    const textCaseOptions = [
        { value: "none", label: t("actionBar.format.textCase.normal") },
        { value: "lowercase", label: t("actionBar.format.textCase.lowercase") },
        { value: "uppercase", label: t("actionBar.format.textCase.uppercase") },
        { value: "titlecase", label: t("actionBar.format.textCase.titleCase") },
    ] as const;
    const textCaseLabel = textCaseOptions.find((option) => option.value === textCase)?.label;

    // Derive the active censor word count from the subscribed fields so it
    // stays reactive without a non-reactive getState() call during render.
    const censorWordCount = React.useMemo(
        () => getActiveCensorWords({ enableCensor, censoredWords, activeCensorLists }).length,
        [enableCensor, censoredWords, activeCensorLists],
    )

    return (
        <div className={compactTranscriptMenu ? "as-format-panel" : undefined}>
            <div className={compactTranscriptMenu ? "as-format-settings" : "p-4 space-y-3"}>
                {/* Text Density */}
                {!hideDensity && (
                    <div className={settingRowClass}>
                        <div>
                            <Label className={settingLabelClass}>{t("actionBar.format.textDensityTitle")}</Label>
                            <p className={settingDescriptionClass}>{t("actionBar.format.textDensityDescription")}</p>
                        </div>
                        <Select
                            value={textDensity}
                            onValueChange={(value) => changeSetting("textDensity", value as Settings["textDensity"])}
                        >
                            <SelectTrigger className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="single">{t("actionBar.format.textDensity.single")}</SelectItem>
                                <SelectItem value="less">{t("actionBar.format.textDensity.less")}</SelectItem>
                                <SelectItem value="standard">{t("actionBar.format.textDensity.standard")}</SelectItem>
                                <SelectItem value="more">{t("actionBar.format.textDensity.more")}</SelectItem>
                                <SelectItem value="custom">{t("actionBar.format.textDensity.custom")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Custom line limit (only shown when custom density is selected) */}
                {(!hideDensity || showCustomDensityLimit) && textDensity === "custom" && (
                    <div className={settingRowClass}>
                        <div>
                            <Label className={settingLabelClass}>
                                {customDensityUnit === "words"
                                    ? t("actionBar.format.customWordsTitle")
                                    : t("actionBar.format.customCharsTitle")}
                            </Label>
                            <p className={settingDescriptionClass}>
                                {customDensityUnit === "words"
                                    ? t("actionBar.format.customWordsDescription")
                                    : t("actionBar.format.customCharsDescription")}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Select
                                value={customDensityUnit}
                                onValueChange={(value) => changeSetting("customDensityUnit", value as Settings["customDensityUnit"])}
                            >
                                <SelectTrigger className="w-28">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="chars">{t("actionBar.density.characters")}</SelectItem>
                                    <SelectItem value="words">{t("actionBar.density.words")}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input
                                type="number"
                                min="1"
                                max={customDensityUnit === "words" ? "20" : "100"}
                                step="1"
                                value={customDensityUnit === "words" ? customMaxWordsPerLine : customMaxCharsPerLine}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                    const n = Math.max(1, Math.floor(Number(e.target.value) || 0));
                                    changeSetting(
                                        customDensityUnit === "words" ? "customMaxWordsPerLine" : "customMaxCharsPerLine",
                                        n,
                                    );
                                }}
                                className="w-20"
                            />
                        </div>
                    </div>
                )}

                {/* Line Count */}
                {!hideLineCount && <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-sm font-medium">{t("actionBar.format.lineCountTitle")}</Label>
                        <p className="text-xs text-muted-foreground">{t("actionBar.format.lineCountDescription")}</p>
                    </div>
                    <Input
                        type="number"
                        min="1"
                        step="1"
                        value={maxLinesPerSubtitle}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const n = Math.max(1, Math.floor(Number(e.target.value) || 0));
                            changeSetting("maxLinesPerSubtitle", n);
                        }}
                        className="w-20"
                    />
                </div>}

                {/* Text Case */}
                <div className={settingRowClass}>
                    <div>
                        <Label className={settingLabelClass}>{t("actionBar.format.textCaseTitle")}</Label>
                        <p className={settingDescriptionClass}>{t("actionBar.format.textCaseDescription")}</p>
                    </div>
                    {compactTranscriptMenu ? (
                        <Menu.Root>
                            <Menu.Trigger className="as-settings-select as-format-case-trigger">
                                {textCaseLabel}
                                <ChevronDown size={14} aria-hidden="true" />
                            </Menu.Trigger>
                            <MenuPopup className="as-format-case-menu">
                                <Menu.RadioGroup
                                    value={textCase}
                                    onValueChange={(value: string) =>
                                        changeSetting("textCase", value as Settings["textCase"])
                                    }
                                >
                                    {textCaseOptions.map((option) => (
                                        <MenuRadioItem
                                            key={option.value}
                                            value={option.value}
                                            className="as-format-case-option"
                                        >
                                            <Check className="as-format-case-check" />
                                            <span>{option.label}</span>
                                        </MenuRadioItem>
                                    ))}
                                </Menu.RadioGroup>
                            </MenuPopup>
                        </Menu.Root>
                    ) : (
                        <Select
                            value={textCase}
                            onValueChange={(value) => changeSetting("textCase", value as Settings["textCase"])}
                        >
                            <SelectTrigger className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent align="end">
                                {textCaseOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>

                {/* Remove Punctuation */}
                <div className={settingRowClass}>
                    <div>
                        <Label className={settingLabelClass}>{t("actionBar.format.removePunctuationTitle")}</Label>
                        <p className={settingDescriptionClass}>{t("actionBar.format.removePunctuationDescription")}</p>
                    </div>
                    <SwitchControl
                        checked={removePunctuation}
                        onCheckedChange={(checked: boolean) => changeSetting("removePunctuation", checked)}
                    />
                </div>

                {/* Censor */}
                <div className={settingRowClass}>
                    <div className={compactTranscriptMenu ? "as-format-setting-copy" : "space-y-0.5"}>
                        <Label className={settingLabelClass}>{t("actionBar.censor.title")}</Label>
                        <p className={settingDescriptionClass}>
                            {t("actionBar.censor.wordCount", { count: censorWordCount })}
                            {!enableCensor ? ` · ${t("actionBar.common.off")}` : ""}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Dialog open={openCensorDialog} onOpenChange={setOpenCensorDialog}>
                            <DialogTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                >
                                    <Settings2 className="size-4" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[520px]">
                                <DialogHeader>
                                    <DialogTitle>{t("actionBar.censor.dialogTitle")}</DialogTitle>
                                    <DialogDescription>
                                        {t("actionBar.censor.dialogDescription")}
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="grid gap-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <Label htmlFor="censor-style" className={settingLabelClass}>
                                            {t("actionBar.censor.styleTitle")}
                                        </Label>
                                        <Select
                                            value={censorStyle}
                                            onValueChange={(value: CensorStyle) => changeSetting("censorStyle", value)}
                                        >
                                            <SelectTrigger id="censor-style" className="w-full sm:w-[240px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="middle">
                                                    {t("actionBar.censor.styleMiddle")}
                                                </SelectItem>
                                                <SelectItem value="whole">
                                                    {t("actionBar.censor.styleWhole")}
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Word Lists Toggles */}
                                    <div className="space-y-2">
                                        <span className={settingLabelClass}>{t("actionBar.censor.lists")}</span>
                                        <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                                            {BUILT_IN_CENSOR_LISTS.map((list) => {
                                                const isActive = (activeCensorLists ?? []).includes(list.id);
                                                return (
                                                    <div key={list.id} className="flex items-center justify-between">
                                                        <div className="flex-1 min-w-0 pr-2">
                                                            <span className={compactTranscriptMenu ? "as-format-setting-label" : "text-sm"}>{list.name}</span>
                                                            {list.description && (
                                                                <p className={compactTranscriptMenu ? "as-format-setting-description truncate" : "text-xs text-muted-foreground truncate"}>{list.description}</p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("actionBar.censor.listWordCount", { count: list.words.length })}</span>
                                                            <SwitchControl
                                                                checked={isActive}
                                                                onCheckedChange={(checked: boolean) => {
                                                                    const current = activeCensorLists ?? [];
                                                                    if (checked) {
                                                                        changeSetting("activeCensorLists", [...current, list.id]);
                                                                    } else {
                                                                        changeSetting("activeCensorLists", current.filter((id: string) => id !== list.id));
                                                                    }
                                                                    if (checked && !enableCensor) {
                                                                        changeSetting("enableCensor", true);
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Divider */}
                                    <div className="border-t" />

                                    {/* Custom Words */}
                                    <div className="space-y-2">
                                        <span className={settingLabelClass}>{t("actionBar.censor.customSection")}</span>
                                        <p className={settingDescriptionClass}>{t("actionBar.censor.customSectionDescription")}</p>
                                        <form
                                            className="flex items-center gap-2 rounded-lg border bg-muted/30 pr-1"
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                if (!newCensoredWord.trim() || (censoredWords || []).includes(newCensoredWord.trim())) return;
                                                changeSetting("censoredWords", [...(censoredWords || []), newCensoredWord.trim()]);
                                                if (!enableCensor) changeSetting("enableCensor", true);
                                                setNewCensoredWord("");
                                            }}
                                        >
                                            <Input
                                                value={newCensoredWord}
                                                onChange={(e) => setNewCensoredWord(e.target.value)}
                                                placeholder={t("actionBar.censor.inputPlaceholder")}
                                                className="flex-1 h-10 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 pl-4"
                                            />
                                            <Button
                                                type="submit"
                                                size="sm"
                                                disabled={!newCensoredWord.trim() || (censoredWords || []).includes(newCensoredWord.trim())}
                                            >
                                                {t("common.add")}
                                            </Button>
                                        </form>

                                        <div className="max-h-[150px] overflow-y-auto rounded-lg border bg-muted/20 p-3">
                                            {(censoredWords || []).length === 0 ? (
                                                <div className="text-sm text-muted-foreground text-center py-4">
                                                    {t("actionBar.censor.empty")}
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {(censoredWords || []).map((word: string, index: number) => (
                                                        <Badge
                                                            key={word}
                                                            variant="secondary"
                                                            className="cursor-pointer select-none px-3 py-1.5 text-sm hover:bg-destructive hover:text-destructive-foreground"
                                                            onClick={() => {
                                                                const updatedWords = (censoredWords || []).filter((_: string, i: number) => i !== index);
                                                                changeSetting("censoredWords", updatedWords);
                                                            }}
                                                        >
                                                            <span className="flex items-center gap-1.5">
                                                                {word}
                                                                <X className="opacity-50 size-4" />
                                                            </span>
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button variant="outline" onClick={() => setNewCensoredWord("")}>{t("common.done")}</Button>
                                    </DialogClose>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                        <SwitchControl
                            checked={enableCensor}
                            onCheckedChange={(checked: boolean) => changeSetting("enableCensor", checked)}
                        />
                    </div>
                </div>
            </div>

            {/* Cancel / Apply actions */}
            {showActions && (
                <div className="flex items-center justify-end gap-2 border-t p-2.5 bg-muted/30">
                    <Button variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
                    <Button onClick={onApply} disabled={applyDisabled}>{t("common.apply")}</Button>
                </div>
            )}
        </div>
    )
}
