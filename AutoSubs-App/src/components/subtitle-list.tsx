import * as React from "react"
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useGlobal } from "@/contexts/GlobalContext"
import { Subtitle, type Word } from "@/types/interfaces"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowRight, Pencil, XCircle as XCircleIcon } from "lucide-react"
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
import { joinWordsToText } from "@/utils/subtitle-formatter"

import { SpeakerEditor } from "@/components/speaker-editor"

// --- Word Component ---
const Word = ({
    word,
    onUpdate,
    onDelete,
    onStartEdit,
    onEndEdit,
}: {
    word: string;
    onUpdate: (newWord: string) => void;
    onDelete: () => void;
    onStartEdit?: () => void;
    onEndEdit?: () => void;
}) => {
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
        onEndEdit?.();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setEditValue(word);
            setIsEditing(false);
            onEndEdit?.();
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
                className="bg-blue-100 dark:bg-blue-900 border border-blue-500 rounded-md p-0 h-6 text-black dark:text-white outline-none"
                style={{ width: `${Math.max(editValue.length, 0)}ch`, minWidth: '20px' }}
            />
        );
    }
    return (
        <div className="relative group rounded-md cursor-pointer">
            <span
                onClick={() => {
                    setIsEditing(true);
                    onStartEdit?.();
                }}
                className="py-2 px-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors duration-150"
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
import { jumpToTime } from "@/api/resolve-api";

const SubtitleList = ({
    searchQuery = "",
    className = "",
    itemClassName = "",
    isLoading = false,
    error = null
}: SubtitleListProps) => {
    const { subtitles, updateSubtitles, speakers } = useGlobal();
    const [editingSubtitle, setEditingSubtitle] = useState<Subtitle | null>(null);
    const [editingWords, setEditingWords] = useState<Word[]>([]);
    const [editingWordIndex, setEditingWordIndex] = useState<number | null>(null);
    const [showSpeakerEditor, setShowSpeakerEditor] = React.useState(false);
    const [expandedSpeakerIndex, setExpandedSpeakerIndex] = React.useState<number | undefined>(undefined);
    // Staged merge changes (applied on Save)
    const [pendingPrevWords, setPendingPrevWords] = useState<Word[] | null>(null);
    const [pendingNextWords, setPendingNextWords] = useState<Word[] | null>(null);
    
    // Virtual scrolling state
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);
    
    // Constants for virtualization - using adaptive height estimation
    const ESTIMATED_ITEM_HEIGHT = 100; // Conservative estimate for variable heights
    const BUFFER_SIZE = 5; // Increased buffer for smoother scrolling

    // Add subtitle content hash to force re-render when content changes
    const subtitleContentHash = useMemo(() => {
        return subtitles.map(s => `${s.text}-${s.start}-${s.end}`).join('|');
    }, [subtitles]);

    const filteredSubtitles = React.useMemo(() => {
        if (!searchQuery.trim()) return subtitles;
        const query = searchQuery.toLowerCase();
        return subtitles.filter(subtitle =>
            subtitle.text.toLowerCase().includes(query) ||
            (subtitle.speaker_id && subtitle.speaker_id.toLowerCase().includes(query))
        );
    }, [subtitles, searchQuery, subtitleContentHash]); // Include content hash
    
    // Calculate visible range with estimated heights
    const { startIndex, endIndex, totalHeight } = useMemo(() => {
        const itemCount = filteredSubtitles.length;
        if (itemCount === 0) return { startIndex: 0, endIndex: 0, totalHeight: 0 };
        
        // Calculate visible range more accurately
        const visibleStart = Math.floor(scrollTop / ESTIMATED_ITEM_HEIGHT);
        const visibleEnd = Math.min(
            itemCount - 1,
            Math.ceil((scrollTop + containerHeight) / ESTIMATED_ITEM_HEIGHT)
        );
        
        // Add buffer to prevent empty space during scroll
        const start = Math.max(0, visibleStart - BUFFER_SIZE);
        const end = Math.min(itemCount - 1, visibleEnd + BUFFER_SIZE);
        
        // Use conservative height estimate to account for variable content
        const averageItemHeight = ESTIMATED_ITEM_HEIGHT - 20; // Match the minHeight we use for items
        
        return {
            startIndex: start,
            endIndex: end,
            totalHeight: itemCount * averageItemHeight
        };
    }, [scrollTop, containerHeight, filteredSubtitles.length, subtitleContentHash]);
    
    // Get visible items with content hash dependency
    const visibleItems = useMemo(() => {
        return filteredSubtitles.slice(startIndex, endIndex + 1);
    }, [filteredSubtitles, startIndex, endIndex, subtitleContentHash]);
    
    // Handle scroll
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    }, []);
    
    // Handle container resize
    useEffect(() => {
        const updateContainerHeight = () => {
            if (containerRef.current) {
                setContainerHeight(containerRef.current.clientHeight);
            }
        };
        
        updateContainerHeight();
        window.addEventListener('resize', updateContainerHeight);
        return () => window.removeEventListener('resize', updateContainerHeight);
    }, []);

    const handleOpenEdit = (subtitle: Subtitle) => {
        setEditingSubtitle(subtitle);
        // Populate editor with words array from the subtitle object
        setEditingWords(subtitle.words || []);
        setEditingWordIndex(null);
        setPendingPrevWords(null);
        setPendingNextWords(null);
    };

    const formatTimecode = (seconds: number | string): string => {
        const sec = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
        const hours = Math.floor(sec / 3600);
        const minutes = Math.floor((sec % 3600) / 60);
        const secs = Math.floor(sec % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Merge currently edited first word into previous subtitle
    const handleMergeLeft = (index: number) => {
        if (editingSubtitle == null) return;
        if (index <= 0) return; // no previous subtitle

        const prevIdx = index - 1;
        const movedWord = editingWords[0];
        if (!movedWord) return;

        // Stage prev words (append moved word to prev's end)
        const prevBaseWords = pendingPrevWords ?? (subtitles[prevIdx].words || []);
        const nextPrevWords = [...prevBaseWords, movedWord];
        setPendingPrevWords(nextPrevWords);

        // Update local editing state only
        const currWords = editingWords.slice(1);
        setEditingWords(currWords);
        setEditingWordIndex(0);
    };

    // Merge currently edited last word into next subtitle
    const handleMergeRight = (index: number) => {
        if (editingSubtitle == null) return;
        if (editingWords.length === 0) return;
        if (index >= subtitles.length - 1) return; // no next subtitle

        const nextIdx = index + 1;
        const movedWord = editingWords[editingWords.length - 1];
        if (!movedWord) return;

        // Stage next words (prepend moved word to next's start)
        const nextBaseWords = pendingNextWords ?? (subtitles[nextIdx].words || []);
        const nextNextWords = [movedWord, ...nextBaseWords];
        setPendingNextWords(nextNextWords);

        // Update local editing state only
        const currWords = editingWords.slice(0, -1);
        setEditingWords(currWords);
        setEditingWordIndex(currWords.length - 1);
    };

    const handleSaveChanges = (index: number) => {
        if (editingSubtitle) {
            // Concatenate all word text to sync the text field with word data
            const updatedText = joinWordsToText(editingWords);

            const newSubtitles = [...subtitles];
            const prevIdx = index - 1;
            const nextIdx = index + 1;

            // Apply staged prev changes first
            if (prevIdx >= 0 && pendingPrevWords) {
                const prev = newSubtitles[prevIdx];
                const updatedPrev = {
                    ...prev,
                    words: pendingPrevWords,
                    text: joinWordsToText(pendingPrevWords),
                    end: pendingPrevWords[pendingPrevWords.length - 1]?.end ?? prev.end,
                } as Subtitle;
                newSubtitles[prevIdx] = updatedPrev;
            }

            // Apply staged next changes (before possible removal of current to keep index stable)
            if (nextIdx < newSubtitles.length && pendingNextWords) {
                const next = newSubtitles[nextIdx];
                const updatedNext = {
                    ...next,
                    words: pendingNextWords,
                    text: joinWordsToText(pendingNextWords),
                    start: pendingNextWords[0]?.start ?? next.start,
                } as Subtitle;
                newSubtitles[nextIdx] = updatedNext;
            }

            // Apply current edits or remove if empty
            if (editingWords.length > 0) {
                newSubtitles[index] = {
                    ...editingSubtitle,
                    text: updatedText,
                    words: editingWords,
                    start: editingWords[0]?.start ?? editingSubtitle.start,
                    end: editingWords[editingWords.length - 1]?.end ?? editingSubtitle.end,
                };
            } else {
                // Remove empty subtitle
                newSubtitles.splice(index, 1);
            }

            updateSubtitles(newSubtitles);

            setEditingSubtitle(null);
            setEditingWords([]);
            setEditingWordIndex(null);
            setPendingPrevWords(null);
            setPendingNextWords(null);
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
            <div 
                ref={containerRef}
                className="h-full"
                onScroll={handleScroll}
                style={{ height: '100%', overflow: 'visible' }}
            >
                <div style={{ height: totalHeight, position: 'relative' }}>
                    <div 
                        style={{ 
                            transform: `translateY(${startIndex * ESTIMATED_ITEM_HEIGHT}px)`,
                            position: 'relative'
                        }}
                    >
                        {visibleItems.map((subtitle: Subtitle, virtualIndex: number) => {
                            const actualIndex = startIndex + virtualIndex;
                            
                            return (
                                <div
                                    key={`${actualIndex}-${subtitle.text.slice(0, 20)}`} // Include content in key for proper re-rendering
                                    className={`group relative flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight hover:bg-muted/50 dark:hover:bg-muted/20 ${itemClassName}`}
                                    style={{ 
                                        minHeight: `${ESTIMATED_ITEM_HEIGHT - 20}px` // Allow natural height with minimum
                                    }}
                                >
                                    <div className="flex w-full items-center gap-2">
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <div className="text-xs text-muted-foreground font-mono cursor-pointer hover:text-primary" onClick={async () => await jumpToTime(subtitle.start)}>
                                                    {formatTimecode(subtitle.start)}
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent side="right">
                                                <p className="text-xs">Jump to point on timeline</p>
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
                                        <span className="text-foreground leading-relaxed whitespace-pre-line">{subtitle.text}</span>
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
                                                            <div className="flex flex-wrap gap-0 m-0 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                                                {editingWordIndex === 0 && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="text-xs h-6 mr-2"
                                                                        onMouseDown={(e) => e.preventDefault()} // keep focus, avoid blur before click
                                                                        onClick={() => handleMergeLeft(actualIndex)}
                                                                    >
                                                                        <ArrowLeft className="h-4 w-4 mr-2" /> Merge Left
                                                                    </Button>
                                                                )}
                                                                {editingWords.map((word, wordIndex) => (
                                                                    <Word
                                                                        key={`${word.start}-${word.end}-${word.word}`}
                                                                        word={word.word}
                                                                        onStartEdit={() => setEditingWordIndex(wordIndex)}
                                                                        onEndEdit={() => setEditingWordIndex(null)}
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
                                                                {editingWordIndex === editingWords.length - 1 && editingWords.length > 0 && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="text-xs h-6 ml-2"
                                                                        onMouseDown={(e) => e.preventDefault()} // keep focus, avoid blur before click
                                                                        onClick={() => handleMergeRight(actualIndex)}
                                                                    >
                                                                        Merge Right<ArrowRight className="h-4 w-4 ml-2" /> 
                                                                    </Button>
                                                                )}
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
                                                                    onClick={() => handleSaveChanges(actualIndex)}
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
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}

export { SubtitleList };
