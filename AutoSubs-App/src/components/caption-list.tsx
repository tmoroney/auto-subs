import * as React from "react"
import { useState, useRef, useEffect } from "react";
import { useGlobal } from "@/contexts/GlobalContext"
import { Subtitle, type Word } from "@/types/interfaces"
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

import { SpeakerEditor } from "@/components/speaker-editor"

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
    segment: Subtitle & { words?: Word[] };
    onSave: (updatedSegment: Subtitle) => void;
    onCancel: () => void;
    hideButtons?: boolean;
    onStateChange?: (words: Word[], text: string) => void;
}

const CaptionEditor = ({
    segment,
    onSave,
    onCancel,
    hideButtons = false,
    onStateChange
}: CaptionEditorProps) => {
    // Initialize words state with proper typing
    const [words, setWords] = useState<Word[]>(() => {
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
    onEditCaption?: (caption: Subtitle) => void;
    className?: string;
    itemClassName?: string;
    isLoading?: boolean;
    error?: string | null;
}

import {
    DialogClose,
} from "@/components/ui/dialog"

const CaptionList = ({
    onEditCaption,
    className = "",
    itemClassName = "",
    isLoading = false,
    error = null
}: CaptionListProps) => {
    const { subtitles, updateCaption, speakers } = useGlobal();
    // Ref to store the current editor state
    const editorStateRef = React.useRef<{ words: Word[]; text: string } | null>(null);

    const handleOpenEdit = React.useCallback((index: number) => {
        const caption = subtitles[index];
        if (!caption) {
            console.warn('Could not find caption at index:', index);
            return;
        }
        // Dialog will be opened by the DialogTrigger
    }, [subtitles]);

    // Handle caption save
    const handleSave = React.useCallback((updatedSegment: Subtitle) => {
        console.log('handleSave called with:', updatedSegment);

        // Update the global subtitles state
        // Since Subtitle doesn't have an id field, we'll need to use the index
        // This is a simplified approach - in a real app, you'd want to have proper IDs
        const index = subtitles.indexOf(updatedSegment);
        if (index !== -1 && updateCaption) {
            // Convert the Subtitle to the format expected by updateCaption
            const captionToUpdate = {
                id: index, // Using index as ID for now
                start: parseFloat(updatedSegment.start),
                end: parseFloat(updatedSegment.end),
                text: updatedSegment.text,
                speaker: updatedSegment.speaker_id,
                words: updatedSegment.words
            };

            // Call the global updateCaption function
            updateCaption(index, captionToUpdate).catch(error => {
                console.error('Failed to update caption:', error);
            });
        }

        if (onEditCaption) {
            onEditCaption(updatedSegment);
        }
    }, [onEditCaption, subtitles, updateCaption]);


    if (isLoading) {
        return <div className="p-4 text-center text-muted-foreground">Loading captions...</div>;
    }

    if (error) {
        return <div className="p-4 text-center text-destructive">{error}</div>;
    }

    if (!subtitles || subtitles.length === 0) {
        return <div className="p-4 text-center text-muted-foreground">No captions available</div>;
    }

    return (
        <div className={className}>
            {subtitles.map((caption, index) => (
                <div
                    key={index}
                    className={`group relative flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight last:border-b-0 hover:bg-muted/50 dark:hover:bg-muted/20 ${itemClassName}`}
                >
                    <div className="flex w-full items-center gap-2">
                        <div className="text-xs text-muted-foreground">
                            {caption.start} - {caption.end}
                        </div>
                        {caption.speaker_id && speakers.length > 0 ? (
                            <SpeakerEditor afterTranscription={false} expandedSpeakerIndex={Number(caption.speaker_id)-1}>
                                <Button
                                    variant="outline"
                                    className="ml-auto text-xs p-2 h-6"
                                >
                                    {speakers[Number(caption.speaker_id)-1]?.name || 'Unknown Speaker'}
                                </Button>
                            </SpeakerEditor>
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
                                                handleOpenEdit(index);
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

export { CaptionList };
