import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { useSettings } from "@/contexts/SettingsContext"
import { useTranslation } from "react-i18next"

export function SpeakerSelector() {
    const { t } = useTranslation()
    const { settings, updateSetting } = useSettings()

    return (
        <>
            <div className="px-4 py-5">
                {/* Speaker Count Slider */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">{t("actionBar.speakers.countTitle")}</Label>
                        <span className={`text-sm font-medium ${settings.enableDiarize ? "text-primary" : "text-red-500"}`}>
                            {settings.enableDiarize ? (settings.maxSpeakers === null ? t("actionBar.common.auto") : settings.maxSpeakers) : t("actionBar.speakers.disabled")}
                        </span>
                    </div>
                    <Slider
                        value={[settings.enableDiarize ? (settings.maxSpeakers === null ? 0 : settings.maxSpeakers) : 0]}
                        onValueChange={([value]: [number]) => settings.enableDiarize && updateSetting("maxSpeakers", value === 0 ? null : value)}
                        max={10}
                        min={0}
                        step={1}
                        className="w-full"
                        disabled={!settings.enableDiarize}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t("actionBar.common.auto")}</span>
                        <span>10</span>
                    </div>
                </div>
            </div>
            <div className="border-t bg-muted/30">
                <div className="p-4 pt-2 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-medium">{t("actionBar.speakers.title")}</Label>
                            <p className="text-xs text-muted-foreground">{t("actionBar.speakers.description")}</p>
                        </div>
                        <Switch
                            checked={settings.enableDiarize}
                            onCheckedChange={(checked: boolean) => updateSetting("enableDiarize", checked)}
                        />
                    </div>
                </div>
            </div>
        </>
    )
}
