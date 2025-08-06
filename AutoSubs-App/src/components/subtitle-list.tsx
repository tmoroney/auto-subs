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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

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


interface SubtitleListProps {
    searchQuery?: string;
    className?: string;
    itemClassName?: string;
    isLoading?: boolean;
    error?: string | null;
}

import {
    DialogClose,
} from "@/components/ui/dialog"
import { jumpToTime } from "@/api/resolveAPI";

const SubtitleList = ({
    searchQuery = "",
    className = "",
    itemClassName = "",
    isLoading = false,
    error = null
}: SubtitleListProps) => {
    const { subtitles, updateSubtitle, speakers } = useGlobal();
    const [editingSubtitle, setEditingSubtitle] = useState<Subtitle | null>(null);
    const [editingWords, setEditingWords] = useState<Word[]>([]);
    const [showSpeakerEditor, setShowSpeakerEditor] = React.useState(false);
    const [expandedSpeakerIndex, setExpandedSpeakerIndex] = React.useState<number | undefined>(undefined);

    const filteredSubtitles = React.useMemo(() => {
        if (!searchQuery.trim()) return subtitles;
        const query = searchQuery.toLowerCase();
        return subtitles.filter(subtitle =>
            subtitle.text.toLowerCase().includes(query) ||
            (subtitle.speaker_id && subtitle.speaker_id.toLowerCase().includes(query))
        );
    }, [subtitles, searchQuery]);

    const handleOpenEdit = (subtitle: Subtitle) => {
        setEditingSubtitle(subtitle);
        // Populate editor with words array from the subtitle object
        setEditingWords(subtitle.words || []);
    };

    const formatTimecode = (seconds: number | string): string => {
        const sec = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
        const hours = Math.floor(sec / 3600);
        const minutes = Math.floor((sec % 3600) / 60);
        const secs = Math.floor(sec % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleSaveChanges = (index: number) => {
        if (editingSubtitle) {
            // Concatenate all word text to sync the text field with word data
            const updatedText = editingWords.map(word => word.word).join(' ');

            const newSubtitle: Subtitle = {
                ...editingSubtitle,
                text: updatedText,
                words: editingWords
            };

            updateSubtitle(index, newSubtitle);

            setEditingSubtitle(null);
            setEditingWords([]);
        }
    };




    if (isLoading) {
        return <div className="p-4 text-center text-muted-foreground">Loading subtitles...</div>;
    }

    if (error) {
        return <div className="p-4 text-center text-destructive">{error}</div>;
    }

    if (!filteredSubtitles || filteredSubtitles.length === 0) {
        return <div className="p-4 text-center text-muted-foreground">No subtitles available</div>;
    }

    return (
        <div className={className}>
            <SpeakerEditor afterTranscription={false} expandedSpeakerIndex={expandedSpeakerIndex} open={showSpeakerEditor} onOpenChange={setShowSpeakerEditor} />
            {filteredSubtitles.map((subtitle: Subtitle, index: number) => (
                <div
                    key={index}
                    className={`group relative flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight last:border-b-0 hover:bg-muted/50 dark:hover:bg-muted/20 ${itemClassName}`}
                >
                    <div className="flex w-full items-center gap-2">
                        <Tooltip>
                            <TooltipTrigger>
                                <div className="text-xs text-muted-foreground font-mono cursor-pointer hover:text-primary" onClick={async () => await jumpToTime(subtitle.start)}>
                                    {formatTimecode(subtitle.start)}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Click to jump to subtitle on timeline</p>
                            </TooltipContent>
                        </Tooltip>
                        {subtitle.speaker_id && speakers.length > 0 ? (
                            <>
                                <Button
                                    variant="outline"
                                    className="ml-auto text-xs p-2 h-6"
                                    onClick={() => {
                                        setExpandedSpeakerIndex(Number(subtitle.speaker_id));
                                        setShowSpeakerEditor(true);
                                    }}
                                >
                                    {speakers[Number(subtitle.speaker_id)]?.name || 'Unknown Speaker'}
                                </Button>
                            </>
                        ) : null}

                    </div>
                    <div className="relative w-full pr-8">
                        <span className="text-foreground leading-relaxed">{subtitle.text}</span>
                        <div
                            className={`absolute -right-2 -bottom-2 transition-opacity opacity-0 group-hover:opacity-100`}
                        >
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenEdit(subtitle);
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
                                        <DialogTitle>Edit Subtitle</DialogTitle>
                                        <DialogDescription>
                                            Edit the subtitle text by modifying the words below
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                        {editingSubtitle && (
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
                                                    onClick={() => handleSaveChanges(index)}
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

export { SubtitleList };
