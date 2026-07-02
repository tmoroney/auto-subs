import * as React from "react"
import { Settings2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
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

interface TextFormattingPanelProps {
    /** Show Cancel / Apply buttons at the bottom */
    showActions?: boolean
    onCancel?: () => void
    onApply?: () => void
    applyDisabled?: boolean
}

export function TextFormattingPanel({
    showActions = false,
    onCancel,
    onApply,
    applyDisabled = false,
}: TextFormattingPanelProps) {
    const { t } = useTranslation()
    const {
        textDensity,
        customMaxCharsPerLine,
        maxLinesPerSubtitle,
        textCase,
        removePunctuation,
        enableCensor,
        activeCensorLists,
        censoredWords,
    } = useSettingsStore(
        useShallow((s) => ({
            textDensity: s.textDensity,
            customMaxCharsPerLine: s.customMaxCharsPerLine,
            maxLinesPerSubtitle: s.maxLinesPerSubtitle,
            textCase: s.textCase,
            removePunctuation: s.removePunctuation,
            enableCensor: s.enableCensor,
            activeCensorLists: s.activeCensorLists,
            censoredWords: s.censoredWords,
        })),
    )
    const updateSetting = useSettingsStore((s) => s.updateSetting)
    const [openCensorDialog, setOpenCensorDialog] = React.useState(false)
    const [newCensoredWord, setNewCensoredWord] = React.useState("")

    return (
        <div>
            <div className="p-4 space-y-3">
                {/* Text Density */}
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-sm font-medium">{t("actionBar.format.textDensityTitle")}</Label>
                        <p className="text-xs text-muted-foreground">{t("actionBar.format.textDensityDescription")}</p>
                    </div>
                    <Select
                        value={textDensity}
                        onValueChange={(value) => updateSetting("textDensity", value as "less" | "standard" | "more" | "single" | "custom")}
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

                {/* Custom Max Chars Per Line (only shown when custom density is selected) */}
                {textDensity === "custom" && (
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-sm font-medium">{t("actionBar.format.customCharsTitle")}</Label>
                            <p className="text-xs text-muted-foreground">{t("actionBar.format.customCharsDescription")}</p>
                        </div>
                        <Input
                            type="number"
                            min="1"
                            max="100"
                            value={customMaxCharsPerLine}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSetting("customMaxCharsPerLine", Number(e.target.value))}
                            className="w-20"
                        />
                    </div>
                )}

                {/* Line Count */}
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-sm font-medium">{t("actionBar.format.lineCountTitle")}</Label>
                        <p className="text-xs text-muted-foreground">{t("actionBar.format.lineCountDescription")}</p>
                    </div>
                    <Input
                        type="number"
                        min="1"
                        value={maxLinesPerSubtitle}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSetting("maxLinesPerSubtitle", Number(e.target.value))}
                        className="w-20"
                    />
                </div>

                {/* Text Case */}
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-sm font-medium">{t("actionBar.format.textCaseTitle")}</Label>
                        <p className="text-xs text-muted-foreground">{t("actionBar.format.textCaseDescription")}</p>
                    </div>
                    <Select
                        value={textCase}
                        onValueChange={(val) => updateSetting("textCase", val as "none" | "uppercase" | "lowercase" | "titlecase")}
                    >
                        <SelectTrigger className="w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                            <SelectItem value="none">{t("actionBar.format.textCase.normal")}</SelectItem>
                            <SelectItem value="lowercase">{t("actionBar.format.textCase.lowercase")}</SelectItem>
                            <SelectItem value="uppercase">{t("actionBar.format.textCase.uppercase")}</SelectItem>
                            <SelectItem value="titlecase">{t("actionBar.format.textCase.titleCase")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Remove Punctuation */}
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-sm font-medium">{t("actionBar.format.removePunctuationTitle")}</Label>
                        <p className="text-xs text-muted-foreground">{t("actionBar.format.removePunctuationDescription")}</p>
                    </div>
                    <Switch
                        checked={removePunctuation}
                        onCheckedChange={(checked: boolean) => updateSetting("removePunctuation", checked)}
                    />
                </div>

                {/* Censor */}
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-sm font-medium">{t("actionBar.censor.title")}</Label>
                        <p className="text-xs text-muted-foreground">
                            {t("actionBar.censor.wordCount", { count: getActiveCensorWords(useSettingsStore.getState()).length })}
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
                                    {/* Word Lists Toggles */}
                                    <div className="space-y-2">
                                        <span className="text-sm font-medium">{t("actionBar.censor.lists")}</span>
                                        <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                                            {BUILT_IN_CENSOR_LISTS.map((list) => {
                                                const isActive = (activeCensorLists ?? []).includes(list.id);
                                                return (
                                                    <div key={list.id} className="flex items-center justify-between">
                                                        <div className="flex-1 min-w-0 pr-2">
                                                            <span className="text-sm">{list.name}</span>
                                                            {list.description && (
                                                                <p className="text-xs text-muted-foreground truncate">{list.description}</p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("actionBar.censor.listWordCount", { count: list.words.length })}</span>
                                                            <Switch
                                                                checked={isActive}
                                                                onCheckedChange={(checked: boolean) => {
                                                                    const current = activeCensorLists ?? [];
                                                                    if (checked) {
                                                                        updateSetting("activeCensorLists", [...current, list.id]);
                                                                    } else {
                                                                        updateSetting("activeCensorLists", current.filter((id: string) => id !== list.id));
                                                                    }
                                                                    if (checked && !enableCensor) {
                                                                        updateSetting("enableCensor", true);
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
                                        <span className="text-sm font-medium">{t("actionBar.censor.customSection")}</span>
                                        <p className="text-xs text-muted-foreground">{t("actionBar.censor.customSectionDescription")}</p>
                                        <form
                                            className="flex items-center gap-2 rounded-lg border bg-muted/30 pr-1"
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                if (!newCensoredWord.trim() || (censoredWords || []).includes(newCensoredWord.trim())) return;
                                                updateSetting("censoredWords", [...(censoredWords || []), newCensoredWord.trim()]);
                                                if (!enableCensor) updateSetting("enableCensor", true);
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

                                        <ScrollArea className="max-h-[150px] rounded-lg border bg-muted/20 p-3">
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
                                                                updateSetting("censoredWords", updatedWords);
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
                                        </ScrollArea>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button variant="outline" onClick={() => setNewCensoredWord("")}>{t("common.done")}</Button>
                                    </DialogClose>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                        <Switch
                            checked={enableCensor}
                            onCheckedChange={(checked: boolean) => updateSetting("enableCensor", checked)}
                        />
                    </div>
                </div>
            </div>

            {/* Cancel / Apply actions */}
            {showActions && (
                <div className="flex items-center justify-end gap-2 border-t p-3 bg-muted/30">
                    <Button variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
                    <Button onClick={onApply} disabled={applyDisabled}>{t("common.apply")}</Button>
                </div>
            )}
        </div>
    )
}
