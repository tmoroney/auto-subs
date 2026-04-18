import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Check } from "lucide-react"
import { Speaker, Track } from "@/types"
import { useTranslation } from "react-i18next"

interface SpeakerSettingsProps {
    speaker: Speaker
    onSpeakerChange: (updated: Speaker) => void
    tracks?: Track[]
}

const DEFAULT_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"]

export function SpeakerSettings({ speaker, onSpeakerChange, tracks }: SpeakerSettingsProps) {
    const { t } = useTranslation()

    // Ensure style defaults to "None" if not set
    const speakerStyle = speaker.style || "None"
    // Ensure color defaults to black if not set
    const speakerColor = speaker.color || "#000000"

    return (
        <div className="space-y-2 min-w-82">
            <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("speakerEditor.name")}</Label>
                <div className="flex items-center gap-10">
                    <Input
                        value={speaker.name}
                        onChange={(e) => onSpeakerChange({ ...speaker, name: e.target.value })}
                        placeholder={t("speakerEditor.namePlaceholder")}
                        className="text-sm"
                    />
                    {tracks && tracks.length > 0 && (
                        <div className="flex items-center gap-2 shrink-0">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">{t("speakerEditor.outputTrack")}</Label>
                            <Select value={speaker.track || ""} onValueChange={(value) => onSpeakerChange({ ...speaker, track: value })}>
                                <SelectTrigger className="w-28">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent align="end">
                                    {tracks.map((track) => (
                                        <SelectItem key={track.value} value={track.value}>
                                            {track.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            </div>
            <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("speakerEditor.style")}</Label>
                <div className="flex items-center gap-3">
                    <Select value={speakerStyle} onValueChange={(value: "Fill" | "Outline" | "None") => onSpeakerChange({ ...speaker, style: value })}>
                        <SelectTrigger className={speakerStyle === "None" ? "flex-1" : "w-32"}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                            <SelectItem value="None">{t("speakerEditor.colors.none")}</SelectItem>
                            <SelectItem value="Fill">{t("speakerEditor.colors.fill")}</SelectItem>
                            <SelectItem value="Outline">{t("speakerEditor.colors.outline")}</SelectItem>
                        </SelectContent>
                    </Select>
                    {speakerStyle !== "None" && (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="flex-1 justify-start gap-2 px-3">
                                    <span className="w-4 h-4 rounded-sm border" style={{ backgroundColor: speakerColor, borderColor: speakerColor }} />
                                    <span className="text-xs">{speakerColor}</span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-52 space-y-4" align="end">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={speakerColor}
                                        onChange={(e) => onSpeakerChange({ ...speaker, color: e.target.value })}
                                        className="w-10 h-10 border-input bg-background"
                                    />
                                    <Input
                                        value={speakerColor}
                                        onChange={(e) => onSpeakerChange({ ...speaker, color: e.target.value })}
                                        className="font-mono flex-1"
                                        placeholder="#000000"
                                        maxLength={7}
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {DEFAULT_COLORS.map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            className={`w-7 h-7 rounded border-2 flex items-center justify-center transition-colors ${speakerColor === preset ? "border-black dark:border-white" : "border-transparent"}`}
                                            style={{ backgroundColor: preset }}
                                            onClick={() => onSpeakerChange({ ...speaker, color: preset })}
                                        >
                                            {speakerColor === preset && (
                                                <Check className="w-4 h-4 text-white drop-shadow dark:text-black" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    )}
                </div>
            </div>
        </div>
    )
}
