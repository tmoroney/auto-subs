import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Pencil, XCircle as XCircleIcon, User, Check } from "lucide-react"

import { Speaker } from "@/types/interfaces"

// Handle updating all speakers with the same name
const handleSaveAllSpeakers = React.useCallback(async (oldSpeakerName: string, newSpeakerName: string, outline: ColorModifier, fill: ColorModifier) => {
    console.log('handleSaveAllSpeakers called:', { oldSpeakerName, newSpeakerName, outline, fill });

    if (onEditCaption) {
        // Create updated captions for all speakers with the same name
        const updatedCaptions = captions.map(caption => {
            if (caption.speaker === oldSpeakerName) {
                return {
                    ...caption,
                    speaker: newSpeakerName,
                    outlineColor: outline,
                    fillColor: fill
                    // Preserve existing words array - it should already be there
                };
            }
            return caption;
        });

        // For each updated caption, trigger the edit handler
        // The GlobalContext will handle the actual file saving
        const changedCaptions = updatedCaptions.filter(caption => 
            caption.speaker === newSpeakerName && 
            caption.speaker !== oldSpeakerName
        );

        // Process each caption sequentially
        for (const caption of changedCaptions) {
            try {
                (onEditCaption as (caption: Caption) => void)(caption as Caption);
                // Small delay to prevent race conditions
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (e) {
                console.error('Failed to update caption:', e);
            }
        }
    }
}, [onEditCaption, captions]);

export function SpeakerEditor({ speakers, updateSpeaker }: { speakers: Speaker[], updateSpeaker: (index: number, label: string, fill: ColorModifier, outline: ColorModifier) => void }) {
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className="ml-auto text-xs p-2 h-6"
                >
                    {caption.speaker}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Edit Speaker</DialogTitle>
                    <DialogDescription>
                        Modify speaker details and colors
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                            <User className="w-5 h-5" />
                        </div>
                        {editingSpeakerName ? (
                            <>
                                <Input
                                    id="speaker-name"
                                    value={speakerName}
                                    onChange={(e) => setSpeakerName(e.target.value)}
                                    className="w-32"
                                    autoFocus
                                    onBlur={() => setEditingSpeakerName(false)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") setEditingSpeakerName(false);
                                        if (e.key === "Escape") setEditingSpeakerName(false);
                                    }}
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="ml-1"
                                    onClick={() => setEditingSpeakerName(false)}
                                    aria-label="Save speaker name"
                                >
                                    <Check className="w-4 h-4" />
                                </Button>
                            </>
                        ) : (
                            <>
                                <h3 className="font-medium">{speakerName}</h3>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="ml-1"
                                    onClick={() => setEditingSpeakerName(true)}
                                    aria-label="Edit speaker name"
                                >
                                    <Pencil className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="enable-outline"
                                    checked={outline.enabled}
                                    onCheckedChange={(checked) => {
                                        if (checked) {
                                            setOutline({ ...outline, enabled: true });
                                        } else {
                                            setOutline({ ...outline, enabled: false });
                                        }
                                    }}
                                />
                                <Label htmlFor="enable-outline" className="text-sm font-medium">
                                    Outline Color
                                </Label>
                            </div>

                            {outline.enabled && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Input
                                            id="outline-color"
                                            type="color"
                                            value={outline.color}
                                            onChange={(e) => setOutline({ ...outline, color: e.target.value })}
                                            className="w-12 h-10 p-1"
                                        />
                                        <Input
                                            value={outline.color}
                                            onChange={(e) => setOutline({ ...outline, color: e.target.value })}
                                            placeholder="#ffffff"
                                        />
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {defaultColors.map((color) => (
                                            <button
                                                key={color}
                                                className="w-8 h-8 rounded-full border-2 border-muted-foreground/20"
                                                style={{ backgroundColor: color }}
                                                onClick={() => setOutline({ ...outline, color })}
                                                aria-label={`Select ${color}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="enable-fill"
                                    checked={fill.enabled}
                                    onCheckedChange={(checked) => {
                                        if (checked) {
                                            setFill({ ...fill, enabled: true });
                                        } else {
                                            setFill({ ...fill, enabled: false });
                                        }
                                    }}
                                />
                                <Label htmlFor="enable-fill" className="text-sm font-medium">
                                    Fill Color
                                </Label>
                            </div>

                            {fill.enabled && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Input
                                            id="fill-color"
                                            type="color"
                                            value={fill.color}
                                            onChange={(e) => setFill({ ...fill, color: e.target.value })}
                                            className="w-12 h-10 p-1"
                                        />
                                        <Input
                                            value={fill.color}
                                            onChange={(e) => setFill({ ...fill, color: e.target.value })}
                                            placeholder="#000000"
                                        />
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {defaultColors.map((color) => (
                                            <button
                                                key={color}
                                                className="w-8 h-8 rounded-full border-2 border-muted-foreground/20"
                                                style={{ backgroundColor: color }}
                                                onClick={() => setFill({ ...fill, color })}
                                                aria-label={`Select ${color}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {(outline.enabled || fill.enabled) && (
                        <div className="p-3 bg-muted rounded-lg">
                            <div className="text-sm font-medium mb-2">Preview</div>
                            <div
                                className="inline-block px-3 py-1 rounded text-sm font-medium"
                                style={{
                                    backgroundColor: fill.enabled ? fill.color : "transparent",
                                    color: fill.enabled ? (fill.color === "#000000" || fill.color === "#000" ? "#ffffff" : "#000000") : "#000000",
                                    border: outline.enabled ? `2px solid ${outline.color}` : "none",
                                }}
                            >
                                Sample caption text
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={handleApplyToThisCaption}
                    >
                        Apply to Only This Caption
                    </Button>
                    <Button
                        onClick={handleApplyToAllSpeakers}
                    >
                        Apply to All Captions with "{caption.speaker}"
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}