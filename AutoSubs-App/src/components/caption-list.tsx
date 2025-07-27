import * as React from "react"
import { useState, useRef, useEffect } from "react";
import { Caption as BaseCaption, ColorModifier } from "@/data/captions"

export interface Caption extends BaseCaption {
    words?: WordData[];
}

interface WordData {
    word: string;
    start: number;
    end: number;
    probability?: number;
}
import { Button } from "@/components/ui/button"
import { Pencil, XCircle as XCircleIcon } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

// --- Word Component ---
const Word = ({ word, onUpdate, onDelete }: { word: string; onUpdate: (newWord: string) => void; onDelete: () => void }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(word);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    const handleSave = () => {
        onUpdate(editValue);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setEditValue(word);
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="bg-blue-100 dark:bg-blue-900 border border-blue-500 rounded-md px-1 py-0.5 text-black dark:text-white outline-none"
                style={{ width: `${Math.max(editValue.length, 5)}ch`, minWidth: '40px' }}
            />
        );
    }
    return (
        <div className="relative group rounded-md cursor-pointer">
            <span
                onClick={() => setIsEditing(true)}
                className="px-0.5 py-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors duration-150"
            >
                {word}
            </span>
            <button
                onClick={onDelete}
                className="absolute -top-2 -right-2 w-4 h-4 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-all duration-150 opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100"
                title="Delete word"
            >
                <XCircleIcon className="w-full h-full" />
            </button>
        </div>
    );
};

// --- Speaker Edit Dialog ---
interface SpeakerEditDialogProps {
    caption: Caption;
    allCaptions: Caption[];
    onUpdateCaption: (updatedCaption: Caption) => void;
    onUpdateAllSpeakers: (oldSpeakerName: string, newSpeakerName: string, outline: ColorModifier, fill: ColorModifier) => void;
}

const SpeakerEditDialog: React.FC<SpeakerEditDialogProps> = ({
    caption,
    onUpdateCaption,
    onUpdateAllSpeakers
}) => {
    const [open, setOpen] = useState(false);
    const [speakerName, setSpeakerName] = useState(caption.speaker || '');
    const [outline, setOutline] = useState<ColorModifier>(caption.outlineColor || { enabled: false, color: '#ffffff' });
    const [fill, setFill] = useState<ColorModifier>(caption.fillColor || { enabled: false, color: '#000000' });

    const handleApplyToThisCaption = () => {
        // Ensure we preserve all original data including words array
        const updatedCaption = {
            ...caption,
            speaker: speakerName,
            outlineColor: outline,
            fillColor: fill,
            // The words array should already be in the caption object
        };
        onUpdateCaption(updatedCaption);
        setOpen(false);
    };

    const handleApplyToAllSpeakers = () => {
        onUpdateAllSpeakers(caption.speaker || '', speakerName, outline, fill);
        setOpen(false);
    };

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
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Speaker</DialogTitle>
                    <DialogDescription>
                        Modify speaker details and colors
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-3 items-center gap-4">
                        <Label htmlFor="speaker-name" className="text-right">
                            Speaker Name
                        </Label>
                        <Input
                            id="speaker-name"
                            value={speakerName}
                            onChange={(e) => setSpeakerName(e.target.value)}
                            className="col-span-2"
                        />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                        <Label htmlFor="outline-color" className="text-right">
                            Outline Color
                        </Label>
                        <div className="col-span-2">
                            {outline.enabled && (
                            <div className="flex items-center gap-2 mb-2">
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
                            )}
                            <div className="flex items-center gap-3">
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
                                <Label htmlFor="enable-outline" className="font-normal text-sm">
                                    Enable Custom Outline
                                </Label>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                        <Label htmlFor="fill-color" className="text-right">
                            Fill Color
                        </Label>
                        <div className="col-span-2">
                            {fill.enabled && (
                                <div className="flex items-center gap-2 mb-2">
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
                            )}
                            <div className="flex items-center gap-3">
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
                                <Label htmlFor="enable-fill" className="font-normal text-sm">
                                    Enable Custom Fill
                                </Label>
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={handleApplyToThisCaption}
                    >
                        Apply to This Caption
                    </Button>
                    <Button
                        onClick={handleApplyToAllSpeakers}
                    >
                        Apply to All "{caption.speaker}" Speakers
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// --- Caption Editor Component ---
interface CaptionEditorProps {
    segment: Caption & { words?: WordData[] };
    onSave: (updatedSegment: Caption) => void;
    onCancel: () => void;
    hideButtons?: boolean;
    onStateChange?: (words: WordData[], text: string) => void;
}

const CaptionEditor = ({
    segment,
    onSave,
    onCancel,
    hideButtons = false,
    onStateChange
}: CaptionEditorProps) => {
    // Initialize words state with proper typing
    const [words, setWords] = useState<WordData[]>(() => {
        if (segment?.words && Array.isArray(segment.words)) {
            return segment.words.map(word => ({
                word: word.word || '',
                start: word.start || 0,
                end: word.end || 0,
                probability: word.probability || 1
            }));
        } else if (segment?.text) {
            return segment.text.split(/\s+/).filter(Boolean).map(word => ({
                word,
                start: 0,
                end: 0,
                probability: 1
            }));
        }
        return [];
    });

    const handleWordUpdate = (wordIndex: number, newWord: string) => {
        setWords(prevWords => {
            const newWords = prevWords.map((word, i) => {
                if (i === wordIndex) {
                    return { ...word, word: newWord };
                }
                return word;
            });

            // Notify parent of state change
            const newText = newWords.map(w => w.word).join(' ');
            onStateChange?.(newWords, newText);

            return newWords;
        });
    };

    const handleWordDelete = (wordIndex: number) => {
        setWords(prevWords => {
            const newWords = [...prevWords];
            const wordToRemove = newWords[wordIndex];
            newWords.splice(wordIndex, 1);

            // Update the timing of adjacent words if needed
            if (newWords.length > 0) {
                if (wordIndex > 0) {
                    // Update the end time of the previous word
                    newWords[wordIndex - 1] = {
                        ...newWords[wordIndex - 1],
                        end: wordToRemove.end
                    };
                } else if (newWords[wordIndex]) {
                    // Update the start time of the next word if it exists
                    newWords[wordIndex] = {
                        ...newWords[wordIndex],
                        start: wordToRemove.start
                    };
                }
            }

            // Notify parent of state change
            const newText = newWords.map(w => w.word).join(' ');
            onStateChange?.(newWords, newText);

            return newWords;
        });
    };

    const handleSave = () => {
        const updatedCaption = {
            ...segment,
            words: [...words],
            text: words.map(w => w.word).join(' ')
        };
        onSave(updatedCaption);
    };

    return (
        <>
            <div className="flex flex-wrap items-center gap-1 p-4 border rounded-lg bg-muted/50">
                {words.length > 0 ? (
                    words.map((wordData, index) => (
                        <Word
                            key={index}
                            word={wordData.word}
                            onUpdate={(newWord) => handleWordUpdate(index, newWord)}
                            onDelete={() => handleWordDelete(index)}
                        />
                    ))
                ) : (
                    <p className="text-muted-foreground">No words available in this segment</p>
                )}
            </div>
            {!hideButtons && (
                <div className="flex justify-end">
                    <Button variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave}>
                        Save Changes
                    </Button>
                </div>
            )}
        </>
    );
};

interface CaptionListProps {
    captions: Caption[]
    /**
     * Callback when a caption is edited.
     * Can accept either a caption ID (number) or the full Caption object.
     */
    onEditCaption?: ((id: number) => void) | ((caption: Caption) => void)
    className?: string
    itemClassName?: string
    isLoading?: boolean
    error?: string | null
}

import {
    DialogClose,
} from "@/components/ui/dialog"

function CaptionListComponent({
    captions = [],
    onEditCaption,
    className = "",
    itemClassName = "",
    isLoading = false,
    error = null
}: CaptionListProps) {
    // Ref to store the current editor state
    const editorStateRef = React.useRef<{ words: WordData[]; text: string } | null>(null);

    const handleOpenEdit = React.useCallback((id: number) => {
        const caption = captions.find(c => c.id === id);
        if (!caption) {
            console.warn('Could not find caption with id:', id);
            return;
        }
        // Dialog will be opened by the DialogTrigger
    }, [captions]);

    // Handle caption save
    const handleSave = React.useCallback((updatedSegment: Caption) => {
        console.log('handleSave called with:', updatedSegment);

        if (onEditCaption) {
            try {
                // Call the parent's edit handler with the updated caption
                (onEditCaption as (caption: Caption) => void)(updatedSegment);
                console.log('onEditCaption called successfully');
            } catch (e) {
                console.log('Fallback to id-based onEditCaption');
                (onEditCaption as (id: number) => void)(updatedSegment.id);
            }
        }
    }, [onEditCaption]);

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

    if (isLoading) {
        return <div className="p-4 text-center text-muted-foreground">Loading captions...</div>;
    }

    if (error) {
        return <div className="p-4 text-center text-destructive">{error}</div>;
    }

    if (!captions || captions.length === 0) {
        return <div className="p-4 text-center text-muted-foreground">No captions available</div>;
    }

    return (
        <div className={className}>
            {captions.map((caption) => (
                <div
                    key={caption.id}
                    className={`group relative flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight last:border-b-0 hover:bg-muted/50 dark:hover:bg-muted/20 ${itemClassName}`}
                >
                    <div className="flex w-full items-center gap-2">
                        <span className={`text-xs text-muted-foreground font-mono`}>
                            {caption.timestamp}
                        </span>
                        {caption.speaker ? (
                            <SpeakerEditDialog
                                caption={caption}
                                allCaptions={captions}
                                onUpdateCaption={handleSave}
                                onUpdateAllSpeakers={handleSaveAllSpeakers}
                            />
                        ) : null}

                    </div>
                    <div className="relative w-full pr-8">
                        <span className="text-foreground leading-relaxed">{caption.text}</span>
                        {onEditCaption && (
                            <div
                                className={`absolute -right-2 -bottom-2 transition-opacity opacity-0 group-hover:opacity-100`}
                            >
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenEdit(caption.id);
                                            }}
                                            size="icon"
                                            variant="outline"
                                            className="h-8 w-8 rounded-full shadow-md bg-background hover:bg-background/50"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-h-[90vh] overflow-y-auto">
                                        <DialogHeader>
                                            <DialogTitle>Edit Caption</DialogTitle>
                                            <DialogDescription>
                                                Edit the caption text by modifying the words below
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-4">
                                            <CaptionEditor
                                                segment={{
                                                    ...caption,
                                                    words: (() => {
                                                        const initialWords = ('words' in caption && Array.isArray((caption as any).words))
                                                            ? (caption as any).words
                                                            : caption.text.split(/\s+/).filter(Boolean).map(word => ({
                                                                word,
                                                                start: 0,
                                                                end: 0,
                                                                probability: 1
                                                            }));

                                                        // Initialize the ref with the initial state
                                                        editorStateRef.current = {
                                                            words: initialWords,
                                                            text: caption.text
                                                        };

                                                        return initialWords;
                                                    })()
                                                }}
                                                onSave={handleSave}
                                                onStateChange={(words, text) => {
                                                    // Update the ref whenever the editor state changes
                                                    editorStateRef.current = { words, text };
                                                }}
                                                onCancel={() => { }}
                                                hideButtons={true}
                                            />
                                            <DialogFooter>
                                                <DialogClose asChild>
                                                    <Button
                                                        variant="outline"
                                                        type="button"
                                                        size="sm"
                                                        className="text-sm mt-2 sm:mt-0"
                                                    >
                                                        Cancel
                                                    </Button>
                                                </DialogClose>
                                                <DialogClose asChild>
                                                    <Button
                                                        variant="default"
                                                        type="button"
                                                        size="sm"
                                                        className="text-sm"
                                                        onClick={() => {
                                                            // Get the current state from the editor ref or fallback to current caption
                                                            let words: any[] = [];
                                                            let text = '';

                                                            if (editorStateRef.current) {
                                                                words = editorStateRef.current.words;
                                                                text = editorStateRef.current.text;
                                                            } else {
                                                                // Fallback to current caption
                                                                words = ('words' in caption && Array.isArray((caption as any).words))
                                                                    ? (caption as any).words
                                                                    : caption.text.split(/\s+/).filter(Boolean).map(word => ({
                                                                        word,
                                                                        start: 0,
                                                                        end: 0,
                                                                        probability: 1
                                                                    }));
                                                                text = caption.text;
                                                            }

                                                            console.log('Saving caption with words:', words, 'text:', text);

                                                            handleSave({
                                                                ...caption,
                                                                words,
                                                                text
                                                            });

                                                            // Clear the ref after saving
                                                            editorStateRef.current = null;
                                                        }}
                                                    >
                                                        Save Changes
                                                    </Button>
                                                </DialogClose>
                                            </DialogFooter>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}

// Memoize the component to prevent unnecessary re-renders
export const CaptionList = React.memo(
    CaptionListComponent,
    (prevProps, nextProps) => (
        prevProps.captions === nextProps.captions &&
        prevProps.isLoading === nextProps.isLoading &&
        prevProps.error === nextProps.error
    )
);
