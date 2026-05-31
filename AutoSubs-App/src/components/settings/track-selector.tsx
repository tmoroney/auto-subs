import { AudioLines } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Track } from "@/types"
import { useSettings } from "@/contexts/SettingsContext"
import { useTranslation } from "react-i18next"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIntegration } from "@/contexts/IntegrationContext"

interface TrackSelectorProps {
    inputTracks: Track[]
    isPremiereActive?: boolean
}

export function TrackSelector({ inputTracks, isPremiereActive }: TrackSelectorProps) {
    const { t } = useTranslation()
    const { settings, updateSetting } = useSettings()
    const { selectedIntegration } = useIntegration()

    // Get selected tracks for the active application
    const selectedTracks = settings.selectedInputTracksByApp[selectedIntegration] || []

    const updateTracks = (newTracks: string[]) => {
        updateSetting("selectedInputTracksByApp", {
            ...settings.selectedInputTracksByApp,
            [selectedIntegration]: newTracks
        });
    };

    return (
        <>
            {inputTracks.length > 0 ? (
                <div className="px-4 py-2 bg-muted/30 border-b">
                    <div className="flex items-center justify-between min-h-[28px]">
                        <span className="text-sm text-muted-foreground">
                            {selectedTracks.length > 0
                                ? (selectedTracks.length === 1
                                    ? t("actionBar.tracks.selectedLabel", {
                                        label: inputTracks.find(track => track.value === selectedTracks[0])?.label || t("actionBar.tracks.trackN", { n: selectedTracks[0] })
                                    })
                                    : t("actionBar.tracks.countSelected", { count: selectedTracks.length }))
                                : t("actionBar.tracks.noneSelected")}
                        </span>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 px-2 hover:bg-white/80 dark:hover:bg-zinc-800/80"
                            onClick={() => {
                                if (selectedTracks.length === inputTracks.length) {
                                    updateTracks([]);
                                } else {
                                    updateTracks(inputTracks.map(track => track.value));
                                }
                            }}
                        >
                            {selectedTracks.length === inputTracks.length ? t("actionBar.tracks.clearAll") : t("actionBar.tracks.selectAll")}
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

            {isPremiereActive && (
                <div className="px-4 py-2 border-b bg-muted/10">
                    <Tabs 
                        value={settings.exportRange || "entire"} 
                        onValueChange={(val) => updateSetting("exportRange", val as "entire" | "inout")}
                        className="w-full"
                    >
                        <TabsList className="grid grid-cols-2 w-full h-8 p-1">
                            <TabsTrigger value="entire" className="text-xs">
                                {t("actionBar.tracks.exportRange.entire")}
                            </TabsTrigger>
                            <TabsTrigger value="inout" className="text-xs">
                                {t("actionBar.tracks.exportRange.inout")}
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            )}

            {inputTracks.length > 0 ? (
                <ScrollArea className="max-h-[200px] w-full h-64">
                    <div className="flex flex-col gap-1 p-2">
                        {inputTracks.map((track) => {
                            const trackId = track.value;
                            const isChecked = selectedTracks.includes(trackId);
                            return (
                                <div
                                    key={trackId}
                                    className={`group relative flex items-center gap-3 py-2 px-3 rounded-lg border transition-all duration-200 w-full cursor-pointer select-none
                                    ${isChecked
                                            ? 'bg-primary/10 border-primary'
                                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-zinc-100 dark:border-zinc-800'}`}
                                    onClick={() => {
                                        if (isChecked) {
                                            updateTracks(selectedTracks.filter(id => id !== trackId));
                                        } else {
                                            updateTracks([...selectedTracks, trackId]);
                                        }
                                    }}
                                >
                                    <div className={`size-8 rounded-full flex items-center justify-center transition-colors
                                    ${isChecked
                                            ? 'bg-primary/10'
                                            : 'bg-zinc-100 dark:bg-zinc-800'}`}
                                    >
                                        <AudioLines className={`size-4 ${isChecked ? 'text-primary' : 'text-zinc-500 dark:text-zinc-400'}`} />
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
                                                updateTracks([...selectedTracks, trackId]);
                                            } else {
                                                updateTracks(selectedTracks.filter((id: string) => id !== trackId));
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
