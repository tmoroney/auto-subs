import { AudioLines } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Track } from "@/types/interfaces"
import { useSettings } from "@/contexts/SettingsContext"
import { useTranslation } from "react-i18next"

interface TrackSelectorProps {
    inputTracks: Track[]
}

export function TrackSelector({ inputTracks }: TrackSelectorProps) {
    const { t } = useTranslation()
    const { settings, updateSetting } = useSettings()

    return (
        <>
            {inputTracks.length > 0 ? (
                <div className="px-4 py-2 bg-muted/30 border-b">
                    <div className="flex items-center justify-between min-h-[28px]">
                        <span className="text-sm text-muted-foreground">
                            {settings.selectedInputTracks.length > 0
                                ? (settings.selectedInputTracks.length === 1
                                    ? t("actionBar.tracks.selectedLabel", {
                                        label: inputTracks.find(track => track.value === settings.selectedInputTracks[0])?.label || t("actionBar.tracks.trackN", { n: settings.selectedInputTracks[0] })
                                    })
                                    : t("actionBar.tracks.countSelected", { count: settings.selectedInputTracks.length }))
                                : t("actionBar.tracks.noneSelected")}
                        </span>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 px-2 hover:bg-white/80 dark:hover:bg-zinc-800/80"
                            onClick={() => {
                                if (settings.selectedInputTracks.length === inputTracks.length) {
                                    updateSetting("selectedInputTracks", []);
                                } else {
                                    updateSetting("selectedInputTracks", inputTracks.map(track => track.value));
                                }
                            }}
                        >
                            {settings.selectedInputTracks.length === inputTracks.length ? t("actionBar.tracks.clearAll") : t("actionBar.tracks.selectAll")}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="px-4 py-3 bg-muted/30 border-b">
                    <p className="text-sm text-center text-muted-foreground">
                        {t("actionBar.tracks.noneFound")}
                    </p>
                </div>
            )}
            {inputTracks.length > 0 ? (
                <ScrollArea style={{ maxHeight: '200px', width: '100%' }}>
                    <div className="flex flex-col gap-1 p-2">
                        {inputTracks.map((track) => {
                            const trackId = track.value;
                            const isChecked = settings.selectedInputTracks.includes(trackId);
                            return (
                                <div
                                    key={trackId}
                                    className={`group relative flex items-center gap-3 py-2 px-3 rounded-lg border transition-all duration-200 w-full cursor-pointer select-none
                                    ${isChecked
                                            ? 'bg-primary/10 border-primary'
                                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-zinc-100 dark:border-zinc-800'}`}
                                    onClick={() => {
                                        if (isChecked) {
                                            updateSetting("selectedInputTracks", settings.selectedInputTracks.filter(id => id !== trackId));
                                        } else {
                                            updateSetting("selectedInputTracks", [...settings.selectedInputTracks, trackId]);
                                        }
                                    }}
                                >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors
                                    ${isChecked
                                            ? 'bg-primary/10'
                                            : 'bg-zinc-100 dark:bg-zinc-800'}`}
                                    >
                                        <AudioLines className={`h-4 w-4 ${isChecked ? 'text-primary' : 'text-zinc-500 dark:text-zinc-400'}`} />
                                    </div>
                                    <span className={`text-sm font-medium flex-1 text-left ${isChecked ? 'text-primary' : ''}`}>
                                        {track.label}
                                    </span>
                                    <Checkbox
                                        id={`track-${trackId}`}
                                        checked={isChecked}
                                        tabIndex={-1}
                                        className="transition-transform duration-150"
                                        onCheckedChange={(checked: boolean) => {
                                            if (checked) {
                                                updateSetting("selectedInputTracks", [...settings.selectedInputTracks, trackId]);
                                            } else {
                                                updateSetting("selectedInputTracks", settings.selectedInputTracks.filter((id: string) => id !== trackId));
                                            }
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            ) : (
                <div className="p-6 flex items-center justify-center">
                    <p className="text-sm text-center text-muted-foreground">
                        {t("actionBar.tracks.createTrack")}
                    </p>
                </div>
            )}
        </>
    )
}
