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
                className="py-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors duration-150"
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


interface CaptionListProps {
    searchQuery?: string;
    className?: string;
    itemClassName?: string;
    isLoading?: boolean;
    error?: string | null;
}

import {
    DialogClose,
} from "@/components/ui/dialog"

const CaptionList = ({
    searchQuery = "",
    className = "",
    itemClassName = "",
    isLoading = false,
    error = null
}: CaptionListProps) => {
    const { subtitles, updateCaption, speakers } = useGlobal();
    const [editingCaption, setEditingCaption] = useState<Subtitle | null>(null);
    const [editingWords, setEditingWords] = useState<Word[]>([]);
    const [showSpeakerEditor, setShowSpeakerEditor] = React.useState(false);
    const [expandedSpeakerIndex, setExpandedSpeakerIndex] = React.useState<number | undefined>(undefined);

    const filteredSubtitles = React.useMemo(() => {
        if (!searchQuery.trim()) return subtitles;
        const query = searchQuery.toLowerCase();
        return subtitles.filter(caption =>
            caption.text.toLowerCase().includes(query) ||
            (caption.speaker_id && caption.speaker_id.toLowerCase().includes(query))
        );
    }, [subtitles, searchQuery]);

    const handleOpenEdit = (caption: Subtitle) => {
        setEditingCaption(caption);
        // Populate editor with words array from the caption object
        setEditingWords(caption.words || []);
    };

    const handleSaveChanges = () => {
        if (editingCaption) {
            // Concatenate all word text to sync the text field with word data
            const updatedText = editingWords.map(word => word.word).join(' ');

            const updatedCaption: Subtitle = {
                ...editingCaption,
                text: updatedText,
                words: editingWords
            };

            const captionIndex = subtitles.findIndex(sub => sub.id === editingCaption.id);
            if (captionIndex !== -1) {
                // Convert string timestamps to numbers for updateCaption
                const captionToUpdate = {
                    ...updatedCaption,
                    start: typeof updatedCaption.start === 'string' ? parseFloat(updatedCaption.start) : updatedCaption.start,
                    end: typeof updatedCaption.end === 'string' ? parseFloat(updatedCaption.end) : updatedCaption.end,
                    speaker: updatedCaption.speaker_id
                };
                updateCaption(captionIndex, captionToUpdate);
            }

            setEditingCaption(null);
            setEditingWords([]);
        }
    };




    if (isLoading) {
        return <div className="p-4 text-center text-muted-foreground">Loading captions...</div>;
    }

    if (error) {
        return <div className="p-4 text-center text-destructive">{error}</div>;
    }

    if (!filteredSubtitles || filteredSubtitles.length === 0) {
        return <div className="p-4 text-center text-muted-foreground">No captions available</div>;
    }

    return (
        <div className={className}>
            <SpeakerEditor afterTranscription={false} expandedSpeakerIndex={expandedSpeakerIndex} open={showSpeakerEditor} onOpenChange={setShowSpeakerEditor} />
            {filteredSubtitles.map((caption: Subtitle, index: number) => (
                <div
                    key={index}
                    className={`group relative flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight last:border-b-0 hover:bg-muted/50 dark:hover:bg-muted/20 ${itemClassName}`}
                >
                    <div className="flex w-full items-center gap-2">
                        <div className="text-xs text-muted-foreground">
                            {caption.start} - {caption.end}
                        </div>
                        {caption.speaker_id && speakers.length > 0 ? (
                            <>
                                <Button
                                    variant="outline"
                                    className="ml-auto text-xs p-2 h-6"
                                    onClick={() => {
                                        setExpandedSpeakerIndex(Number(caption.speaker_id) - 1);
                                        setShowSpeakerEditor(true);
                                    }}
                                >
                                    {speakers[Number(caption.speaker_id) - 1]?.name || 'Unknown Speaker'}
                                </Button>
                            </>
                        ) : null}

                    </div>
                    <div className="relative w-full pr-8">
                        <span className="text-foreground leading-relaxed">{caption.text}</span>
                        <div
                            className={`absolute -right-2 -bottom-2 transition-opacity opacity-0 group-hover:opacity-100`}
                        >
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenEdit(caption);
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
                                        {editingCaption && (
                                            <div className="flex flex-wrap gap-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                                {editingWords.map((word, wordIndex) => (
                                                    <Word
                                                        key={wordIndex}
                                                        word={word.word}
                                                        onUpdate={(newWord) => {
                                                            setEditingWords(prev =>
                                                                prev.map((w, i) =>
                                                                    i === wordIndex ? { ...w, word: newWord } : w
                                                                )
                                                            );
                                                        }}
                                                        onDelete={() => {
                                                            setEditingWords(prev => {
                                                                const newWords = prev.filter((_, i) => i !== wordIndex);

                                                                // If this isn't the first word, update the previous word's end time
                                                                if (wordIndex > 0 && newWords.length > 0) {
                                                                    const deletedWord = prev[wordIndex];
                                                                    newWords[wordIndex - 1] = {
                                                                        ...newWords[wordIndex - 1],
                                                                        end: deletedWord.end
                                                                    };
                                                                }

                                                                return newWords;
                                                            });
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
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
                                                    onClick={handleSaveChanges}
                                                >
                                                    Save Changes
                                                </Button>
                                            </DialogClose>
                                        </DialogFooter>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

export { CaptionList };
