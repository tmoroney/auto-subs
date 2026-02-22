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
import { useSettings } from "@/contexts/SettingsContext"
import { useTranslation } from "react-i18next"

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
    const { settings, updateSetting } = useSettings()
    const [openCensorDialog, setOpenCensorDialog] = React.useState(false)
    const [newCensoredWord, setNewCensoredWord] = React.useState("")

    return (
        <div>
            <div className="p-4 space-y-3">
                {/* Text Density */}
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-sm font-medium">Text Density</Label>
                        <p className="text-xs text-muted-foreground">Amount of text on screen</p>
                    </div>
                    <Select
                        value={settings.textDensity}
                        onValueChange={(value) => updateSetting("textDensity", value as "less" | "standard" | "more")}
                    >
                        <SelectTrigger className="w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="less">Less</SelectItem>
                            <SelectItem value="standard">Standard</SelectItem>
                            <SelectItem value="more">More</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Line Count */}
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-sm font-medium">{t("actionBar.format.lineCountTitle")}</Label>
                        <p className="text-xs text-muted-foreground">{t("actionBar.format.lineCountDescription")}</p>
                    </div>
                    <Input
                        type="number"
                        min="1"
                        value={settings.maxLinesPerSubtitle}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSetting("maxLinesPerSubtitle", Number(e.target.value))}
                        className="w-20"
                    />
                </div>

                {/* Remove Punctuation */}
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-sm font-medium">{t("actionBar.format.removePunctuationTitle")}</Label>
                        <p className="text-xs text-muted-foreground">{t("actionBar.format.removePunctuationDescription")}</p>
                    </div>
                    <Switch
                        checked={settings.removePunctuation}
                        onCheckedChange={(checked: boolean) => updateSetting("removePunctuation", checked)}
                    />
                </div>

                {/* Censor */}
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-sm font-medium">{t("actionBar.censor.title")}</Label>
                        <p className="text-xs text-muted-foreground">
                            {t("actionBar.censor.wordCount", { count: (settings.censoredWords || []).length })}
                            {!settings.enableCensor ? ` · ${t("actionBar.common.off")}` : ""}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Dialog open={openCensorDialog} onOpenChange={setOpenCensorDialog}>
                            <DialogTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                >
                                    <Settings2 className="h-4 w-4" />
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
                                    <form
                                        className="flex items-center gap-2 rounded-lg border bg-muted/30 pr-1"
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            if (!newCensoredWord.trim() || (settings.censoredWords || []).includes(newCensoredWord.trim())) return;
                                            updateSetting("censoredWords", [...(settings.censoredWords || []), newCensoredWord.trim()]);
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
                                            disabled={!newCensoredWord.trim() || (settings.censoredWords || []).includes(newCensoredWord.trim())}
                                        >
                                            {t("common.add")}
                                        </Button>
                                    </form>

                                    <div className="space-y-2">
                                        <ScrollArea className="max-h-[220px] rounded-lg border bg-muted/20 p-3">
                                            {(settings.censoredWords || []).length === 0 ? (
                                                <div className="text-sm text-muted-foreground text-center py-6">
                                                    {t("actionBar.censor.empty")}
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {(settings.censoredWords || []).map((word: string, index: number) => (
                                                        <Badge
                                                            key={index}
                                                            variant="secondary"
                                                            className="cursor-pointer select-none px-3 py-1.5 text-sm hover:bg-destructive hover:text-destructive-foreground"
                                                            onClick={() => {
                                                                const updatedWords = (settings.censoredWords || []).filter((_: string, i: number) => i !== index);
                                                                updateSetting("censoredWords", updatedWords);
                                                            }}
                                                        >
                                                            <span className="flex items-center gap-1.5">
                                                                {word}
                                                                <X className="opacity-50 w-4 h-4" />
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
                            checked={settings.enableCensor}
                            onCheckedChange={(checked: boolean) => updateSetting("enableCensor", checked)}
                        />
                    </div>
                </div>

                {/* Text Case */}
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-sm font-medium">{t("actionBar.format.textCaseTitle")}</Label>
                        <p className="text-xs text-muted-foreground">{t("actionBar.format.textCaseDescription")}</p>
                    </div>
                    <Select
                        value={settings.textCase}
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

            </div>

            {/* Cancel / Apply actions */}
            {showActions && (
                <div className="flex items-center justify-end gap-2 border-t p-3">
                    <Button variant="outline" onClick={onCancel}>Cancel</Button>
                    <Button onClick={onApply} disabled={applyDisabled}>Apply</Button>
                </div>
            )}
        </div>
    )
}
