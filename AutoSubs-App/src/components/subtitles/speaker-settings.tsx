import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Check } from "lucide-react"
import { Speaker, ColorModifier, Track } from "@/types/interfaces"
import { useTranslation } from "react-i18next"

interface SpeakerSettingsProps {
    speaker: Speaker
    onSpeakerChange: (updated: Speaker) => void
    tracks?: Track[]
    selectedTrack?: string
    onTrackChange?: (value: string) => void
}

const DEFAULT_PRESETS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"]

function ColorButton({
    label,
    colorMod,
    onColorModChange,
}: {
    label: string
    colorMod: ColorModifier
    onColorModChange: (updated: ColorModifier) => void
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={`flex-1 justify-center gap-2 px-3 ${!colorMod.enabled ? "opacity-70" : ""}`}>
                    <span className="relative w-3.5 h-3.5 shrink-0">
                        <span
                            className="absolute inset-0 rounded-sm border"
                            style={{
                                backgroundColor: colorMod.color,
                                borderColor: colorMod.color,
                            }}
                        />
                        {!colorMod.enabled && (
                            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 14 14" preserveAspectRatio="none">
                                <line x1="0" y1="14" x2="14" y2="0" stroke="white" strokeWidth="2" strokeLinecap="round" />
                                <line x1="0" y1="14" x2="14" y2="0" stroke="black" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.4" />
                            </svg>
                        )}
                    </span>
                    <span className="text-xs">{label}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 space-y-4">
                <div className="flex items-center gap-2">
                    <Switch
                        id={`toggle-${label}`}
                        checked={colorMod.enabled}
                        onCheckedChange={(checked) => onColorModChange({ ...colorMod, enabled: checked })}
                    />
                    <Label htmlFor={`toggle-${label}`}>{label}</Label>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="color"
                        value={colorMod.color}
                        onChange={(e) => onColorModChange({ ...colorMod, color: e.target.value })}
                        disabled={!colorMod.enabled}
                        className="w-10 h-10 rounded-md border-2 border-input bg-background disabled:opacity-50"
                    />
                    <Input
                        value={colorMod.color}
                        onChange={(e) => onColorModChange({ ...colorMod, color: e.target.value })}
                        disabled={!colorMod.enabled}
                        className="font-mono flex-1"
                        placeholder="#000000"
                        maxLength={7}
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    {DEFAULT_PRESETS.map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            className={`w-7 h-7 rounded border-2 flex items-center justify-center transition-colors ${colorMod.color === preset && colorMod.enabled ? "border-black dark:border-white" : "border-transparent"} ${!colorMod.enabled ? "opacity-50" : ""}`}
                            style={{ backgroundColor: preset }}
                            onClick={() => colorMod.enabled && onColorModChange({ ...colorMod, color: preset })}
                            disabled={!colorMod.enabled}
                        >
                            {colorMod.color === preset && colorMod.enabled && (
                                <Check className="w-4 h-4 text-white drop-shadow dark:text-black" />
                            )}
                        </button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    )
}

export function SpeakerSettings({ speaker, onSpeakerChange, tracks, selectedTrack, onTrackChange }: SpeakerSettingsProps) {
    const { t } = useTranslation()

    return (
        <div className="space-y-2.5 p-3 min-w-82">
            <div className="flex items-center gap-10">
                <Input
                    value={speaker.name}
                    onChange={(e) => onSpeakerChange({ ...speaker, name: e.target.value })}
                    placeholder={t("speakerEditor.namePlaceholder")}
                    className="text-sm"
                />
                {tracks && onTrackChange && (
                    <div className="flex items-center gap-2 shrink-0">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">{t("speakerEditor.outputTrack")}</Label>
                        <Select value={selectedTrack} onValueChange={onTrackChange}>
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
            <ButtonGroup className="w-full">
                <ColorButton
                    label={t("speakerEditor.colors.fill")}
                    colorMod={speaker.fill}
                    onColorModChange={(updated) => onSpeakerChange({ ...speaker, fill: updated })}
                />
                <ColorButton
                    label={t("speakerEditor.colors.outline")}
                    colorMod={speaker.outline}
                    onColorModChange={(updated) => onSpeakerChange({ ...speaker, outline: updated })}
                />
                <ColorButton
                    label={t("speakerEditor.colors.border")}
                    colorMod={speaker.border}
                    onColorModChange={(updated) => onSpeakerChange({ ...speaker, border: updated })}
                />
            </ButtonGroup>
        </div>
    )
}
