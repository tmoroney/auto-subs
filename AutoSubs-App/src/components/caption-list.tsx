import * as React from "react"
import { useState, useRef, useEffect } from "react";
import { Caption as BaseCaption } from "@/data/captions"

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
import { Edit2, XCircle as XCircleIcon } from "lucide-react"

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

// --- Caption Editor Component ---
interface CaptionEditorProps {
    segment: Caption & { words?: WordData[] };
    onSave: (updatedSegment: Caption) => void;
    onCancel: () => void;
    hideButtons?: boolean;
}

const CaptionEditor = ({ 
    segment, 
    onSave, 
    onCancel,
    hideButtons = false
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
            return prevWords.map((word, i) => {
                if (i === wordIndex) {
                    return { ...word, word: newWord };
                }
                return word;
            });
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
    showEditOnHover?: boolean
    isLoading?: boolean
    error?: string | null
}

import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog"

function CaptionListComponent({
    captions = [],
    onEditCaption,
    className = "",
    itemClassName = "",
    showEditOnHover = true,
    isLoading = false,
    error = null
}: CaptionListProps) {
    // State for editor
    const [editCaptions, setEditCaptions] = React.useState<Caption[]>([]);


    // Update edit captions when captions prop changes
    React.useEffect(() => {
        setEditCaptions([...captions]);
    }, [captions]);

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
        const idx = editCaptions.findIndex(c => c.id === updatedSegment.id);
        if (idx !== -1) {
            const updated = [...editCaptions];
            updated[idx] = { 
                ...updated[idx], 
                ...updatedSegment,
                text: updatedSegment.text || updated[idx].text,
                words: updatedSegment.words || updated[idx].words
            };
            setEditCaptions(updated);
            
            if (onEditCaption) {
                try {
                    (onEditCaption as (caption: Caption) => void)(updated[idx]);
                } catch (e) {
                    (onEditCaption as (id: number) => void)(updated[idx].id);
                }
            }
        }
    }, [editCaptions, onEditCaption]);

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
                    className={`relative flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight last:border-b-0 hover:bg-muted/50 ${itemClassName}`}
                    onMouseEnter={(e) => {
                        if (!showEditOnHover) return;
                        const target = e.currentTarget;
                        const button = target.querySelector('.edit-button') as HTMLElement;
                        if (button) button.style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                        if (!showEditOnHover) return;
                        const target = e.currentTarget;
                        const button = target.querySelector('.edit-button') as HTMLElement;
                        if (button) button.style.opacity = '0';
                    }}
                >
                    <div className="flex w-full items-center gap-2">
                        {caption.speaker && caption.color ? (
                            <span className={`font-medium text-xs text-${caption.color}`}>
                                {caption.speaker}
                            </span>
                        ) : null}
                        <span className={`text-xs text-muted-foreground font-mono ${caption.speaker && caption.color ? 'ml-auto' : ''}`}>
                            {caption.timestamp}
                        </span>
                    </div>
                    <div className="relative w-full pr-8">
                        <span className="text-foreground leading-relaxed">{caption.text}</span>
                        {onEditCaption && (
                            <div 
                                className={`absolute -right-2 -bottom-2 transition-opacity edit-button ${!showEditOnHover ? 'opacity-100' : 'opacity-0'}`}
                                style={!showEditOnHover ? { pointerEvents: 'auto' } : { pointerEvents: 'auto' }}
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
                                            <Edit2 className="h-4 w-4" />
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
                                                words: ('words' in caption && Array.isArray((caption as any).words)) 
                                                    ? (caption as any).words 
                                                    : caption.text.split(/\s+/).filter(Boolean).map(word => ({
                                                        word,
                                                        start: 0,
                                                        end: 0,
                                                        probability: 1
                                                    }))
                                            }}
                                            onSave={handleSave}
                                            onCancel={() => {}}
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
                                            <Button
                                                variant="default"
                                                type="button"
                                                size="sm"
                                                className="text-sm"
                                                onClick={() => {
                                                    // Get all word input elements
                                                    const wordInputs = Array.from(document.querySelectorAll<HTMLInputElement>('.word-edit-input'));
                                                    const words = wordInputs.map(input => ({
                                                        word: input.value,
                                                        start: 0,
                                                        end: 0,
                                                        probability: 1
                                                    }));
                                                    
                                                    handleSave({
                                                        ...caption,
                                                        words,
                                                        text: words.map(w => w.word).join(' ')
                                                    });
                                                }}
                                            >
                                                Save Changes
                                            </Button>
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
