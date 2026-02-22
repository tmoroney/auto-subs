import * as React from "react"
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useTranscript } from "@/contexts/TranscriptContext"
import { Subtitle } from "@/types/interfaces"
import { Button } from "@/components/ui/button"
import { ArrowDown, ArrowUp } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SpeakerSettings } from "@/components/subtitles/speaker-settings"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"


interface SubtitleListProps {
    searchQuery?: string;
    searchCaseSensitive?: boolean;
    searchWholeWord?: boolean;
    className?: string;
    itemClassName?: string;
    isLoading?: boolean;
    error?: string | null;
    selectedIndex?: number | null;
    onSelectedIndexChange?: (index: number | null) => void;
}

import { jumpToTime } from "@/api/resolve-api";

const SubtitleList = ({
    searchQuery = "",
    searchCaseSensitive = false,
    searchWholeWord = false,
    className = "",
    itemClassName = "",
    isLoading = false,
    error = null,
    selectedIndex: controlledSelectedIndex,
    onSelectedIndexChange,
}: SubtitleListProps) => {
    const { t } = useTranslation();
    const { subtitles, updateSubtitles, speakers, updateSpeakers } = useTranscript();
    const [uncontrolledSelectedIndex, setUncontrolledSelectedIndex] = useState<number | null>(null);
    const selectedIndex = controlledSelectedIndex ?? uncontrolledSelectedIndex;

    const [draftText, setDraftText] = useState<string>("");
    const [originalText, setOriginalText] = useState<string>("");
    const inlineEditorRef = useRef<HTMLDivElement>(null);
    const [editingSubtitleId, setEditingSubtitleId] = React.useState<number | null>(null);
    
    // Virtual scrolling state
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);
    
    // Constants for virtualization - using adaptive height estimation
    const ESTIMATED_ITEM_HEIGHT = 100; // Conservative estimate for variable heights
    const BUFFER_SIZE = 5; // Increased buffer for smoother scrolling

    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const matchesQuery = useCallback((text: string, query: string) => {
        if (!query.trim()) return true;
        if (!text) return false;

        if (searchWholeWord) {
            const escaped = escapeRegExp(query.trim());
            const flags = searchCaseSensitive ? "g" : "gi";
            const re = new RegExp(`\\b${escaped}\\b`, flags);
            return re.test(text);
        }

        if (searchCaseSensitive) {
            return text.includes(query);
        }
        return text.toLowerCase().includes(query.toLowerCase());
    }, [searchCaseSensitive, searchWholeWord]);

    // speaker_id can be either 0-based ("0", "1", ...) or 1-based ("1", "2", ...).
    // Detect base once per transcript so Speaker 1 doesn't get mislabeled as Speaker 2.
    const speakerIdBase = useMemo(() => {
        const hasZero = subtitles.some(s => {
            const sid = s.speaker_id;
            if (sid === undefined || sid === null) return false;
            return String(sid) === "0";
        });
        return hasZero ? 0 : 1;
    }, [subtitles]);

    const getSpeakerIndex = useCallback((speakerId: string | undefined) => {
        if (!speakerId) return 0;
        const n = Number(speakerId);
        if (!Number.isFinite(n)) return 0;

        const idx = n - speakerIdBase;
        if (idx >= 0 && idx < speakers.length) return idx;

        // Fallbacks for safety if the transcript is mixed/legacy.
        if (n >= 0 && n < speakers.length) return n;
        if (n - 1 >= 0 && n - 1 < speakers.length) return n - 1;
        return 0;
    }, [speakerIdBase, speakers.length]);

    const filteredSubtitleItems = useMemo(() => {
        const query = searchQuery ?? "";
        return subtitles
            .map((subtitle, index) => ({ subtitle, index }))
            .filter(({ subtitle }) => {
                if (!query.trim()) return true;
                
                // Check speaker name match
                let speakerMatch = false;
                if (subtitle.speaker_id) {
                    const speakerIndex = getSpeakerIndex(subtitle.speaker_id);
                    const speakerName = speakers[speakerIndex]?.name;
                    if (speakerName) {
                        speakerMatch = searchCaseSensitive
                            ? speakerName.includes(query)
                            : speakerName.toLowerCase().includes(query.toLowerCase());
                    }
                }
                
                return matchesQuery(subtitle.text ?? "", query) || speakerMatch;
            });
    }, [subtitles, searchQuery, matchesQuery, searchCaseSensitive, speakers, getSpeakerIndex]);
    
    // Calculate visible range with estimated heights
    const { startIndex, endIndex, totalHeight } = useMemo(() => {
        const itemCount = filteredSubtitleItems.length;
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
    }, [scrollTop, containerHeight, filteredSubtitleItems.length]);
    
    // Get visible items with content hash dependency
    const visibleItems = useMemo(() => {
        return filteredSubtitleItems.slice(startIndex, endIndex + 1);
    }, [filteredSubtitleItems, startIndex, endIndex]);
    
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

    // Handle click outside to deselect subtitle
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Check if the click is outside the subtitle list container
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setSelectedIndex(null);
            }
        };

        // Add global click listener when a subtitle is selected
        if (selectedIndex !== null) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [selectedIndex]);

    const setSelectedIndex = (index: number | null) => {
        if (controlledSelectedIndex !== undefined) {
            onSelectedIndexChange?.(index);
            return;
        }
        setUncontrolledSelectedIndex(index);
        onSelectedIndexChange?.(index);
    };

    const selectSubtitle = useCallback((index: number) => {
        if (selectedIndex === index) return;
        const initial = subtitles[index]?.text ?? "";
        setSelectedIndex(index);
        setDraftText(initial);
        setOriginalText(initial);
    }, [selectedIndex, subtitles]);

    useEffect(() => {
        if (selectedIndex === null) return;
        if (draftText !== originalText) return;
        const latest = subtitles[selectedIndex]?.text ?? "";
        if (latest !== draftText) {
            setDraftText(latest);
            setOriginalText(latest);
        }
    }, [draftText, originalText, selectedIndex, subtitles]);

    useEffect(() => {
        if (selectedIndex === null) return;
        inlineEditorRef.current?.focus();
        if (inlineEditorRef.current && inlineEditorRef.current.innerText !== draftText) {
            inlineEditorRef.current.innerText = draftText;
        }

        if (inlineEditorRef.current) {
            const el = inlineEditorRef.current;
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
        }
    }, [selectedIndex]);

    const formatTimecode = (seconds: number | string): string => {
        const sec = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
        const hours = Math.floor(sec / 3600);
        const minutes = Math.floor((sec % 3600) / 60);
        const secs = Math.floor(sec % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const splitIntoWords = (text: string) => {
        const trimmed = (text ?? "").trim();
        if (!trimmed) return [] as string[];
        return trimmed.split(/\s+/g);
    };

    const joinWords = (words: string[]) => words.join(" ");

    const handleMoveFirstWordToPrev = (index: number) => {
        if (index <= 0) return;
        const words = splitIntoWords(draftText);
        if (words.length === 0) return;

        const first = words.shift();
        if (!first) return;

        const newSubtitles = [...subtitles];
        const prev = newSubtitles[index - 1];
        const curr = newSubtitles[index];
        if (!prev || !curr) return;

        const prevWords = splitIntoWords(prev.text ?? "");
        prevWords.push(first);

        const nextCurrText = joinWords(words);
        newSubtitles[index - 1] = { ...prev, text: joinWords(prevWords) };
        newSubtitles[index] = { ...curr, text: nextCurrText };
        updateSubtitles(newSubtitles);
        setDraftText(nextCurrText);
        setOriginalText(nextCurrText);

        // keep contentEditable in sync immediately
        if (inlineEditorRef.current) {
            inlineEditorRef.current.innerText = nextCurrText;
        }
    };

    const handleMoveLastWordToNext = (index: number) => {
        if (index >= subtitles.length - 1) return;
        const words = splitIntoWords(draftText);
        if (words.length === 0) return;

        const last = words.pop();
        if (!last) return;

        const newSubtitles = [...subtitles];
        const next = newSubtitles[index + 1];
        const curr = newSubtitles[index];
        if (!next || !curr) return;

        const nextWords = splitIntoWords(next.text ?? "");
        nextWords.unshift(last);

        const nextCurrText = joinWords(words);
        newSubtitles[index] = { ...curr, text: nextCurrText };
        newSubtitles[index + 1] = { ...next, text: joinWords(nextWords) };
        updateSubtitles(newSubtitles);
        setDraftText(nextCurrText);
        setOriginalText(nextCurrText);

        // keep contentEditable in sync immediately
        if (inlineEditorRef.current) {
            inlineEditorRef.current.innerText = nextCurrText;
        }
    };

    const renderHighlightedText = (text: string, query: string) => {
        if (!query.trim() || !text) return text;

        const escaped = escapeRegExp(query.trim());
        const flags = searchCaseSensitive ? "g" : "gi";
        const re = searchWholeWord 
            ? new RegExp(`\\b(${escaped})\\b`, flags)
            : new RegExp(`(${escaped})`, flags);

        const parts = text.split(re);
        
        return parts.map((part, i) => {
            if (i % 2 === 1) {
                return (
                    <mark key={i} className="bg-yellow-200 dark:bg-yellow-900 text-inherit">
                        {part}
                    </mark>
                );
            }
            return part;
        });
    };

    if (isLoading) {
        return <div className="p-4 text-center text-muted-foreground">{t("subtitles.loading")}</div>;
    }

    if (error) {
        return <div className="p-4 text-center text-destructive">{error}</div>;
    }

    if (!filteredSubtitleItems || filteredSubtitleItems.length === 0) {
        return <div className="p-4 text-center text-muted-foreground">{t("subtitles.empty.noSubtitlesAvailableShort")}</div>;
    }

    return (
        <div className={className}>
            <div 
                ref={containerRef}
                className="h-full"
                onScroll={handleScroll}
                style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}
            >
                <div style={{ height: totalHeight, position: 'relative' }}>
                    <div 
                        style={{ 
                            transform: `translateY(${startIndex * ESTIMATED_ITEM_HEIGHT}px)`,
                            position: 'relative'
                        }}
                    >
                        {visibleItems.map(({ subtitle, index }: { subtitle: Subtitle; index: number }) => {
                            const isSelected = selectedIndex === index;
                            
                            return (
                                <div
                                    key={subtitle.id}
                                    className={`group relative flex flex-col items-start gap-2 border-b border-l-2 border-l-transparent p-4 text-sm leading-tight transition-all duration-200 ease-out hover:bg-muted/50 dark:hover:bg-muted/20 ${isSelected ? "bg-muted/50 dark:bg-muted/20 border-l-primary" : ""} ${itemClassName}`}
                                    onClick={() => selectSubtitle(index)}
                                    style={{ 
                                        minHeight: `${ESTIMATED_ITEM_HEIGHT - 20}px` // Allow natural height with minimum
                                    }}
                                >
                                    <div className="flex w-full items-center gap-2">
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <div
                                                    className="text-xs text-muted-foreground font-mono cursor-pointer hover:text-primary"
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        await jumpToTime(subtitle.start);
                                                    }}
                                                >
                                                    {formatTimecode(subtitle.start)}
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent side="right">
                                                <p className="text-xs">{t("subtitles.jumpToTimeline")}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                        {subtitle.speaker_id && speakers.length > 0 ? (
                                            <Popover
                                                open={editingSubtitleId === subtitle.id}
                                                onOpenChange={(open) => {
                                                    if (open) {
                                                        setEditingSubtitleId(subtitle.id);
                                                    } else {
                                                        setEditingSubtitleId(null);
                                                    }
                                                }}
                                            >
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        className="ml-auto text-xs p-2 h-6"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {(() => {
                                                            const idx = getSpeakerIndex(subtitle.speaker_id);
                                                            return speakers[idx]?.name || t("subtitles.unknownSpeaker");
                                                        })()}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent align="end" className="p-0" onClick={(e) => e.stopPropagation()}>
                                                    {(() => {
                                                        const idx = getSpeakerIndex(subtitle.speaker_id);
                                                        const speaker = speakers[idx];
                                                        if (!speaker) return null;
                                                        return (
                                                            <SpeakerSettings
                                                                speaker={speaker}
                                                                onSpeakerChange={(updated) => {
                                                                    const next = [...speakers];
                                                                    next[idx] = updated;
                                                                    updateSpeakers(next);
                                                                }}
                                                            />
                                                        );
                                                    })()}
                                                </PopoverContent>
                                            </Popover>
                                        ) : null}

                                    </div>
                                    <div className="relative w-full">
                                        {isSelected ? (
                                            <div
                                                ref={inlineEditorRef}
                                                contentEditable
                                                suppressContentEditableWarning
                                                onInput={(e) => {
                                                    const nextText = (e.currentTarget.innerText ?? "").replace(/\r\n/g, "\n");
                                                    setDraftText(nextText);
                                                    const existing = subtitles[index];
                                                    if (!existing) return;
                                                    const next = [...subtitles];
                                                    next[index] = { ...existing, text: nextText };
                                                    updateSubtitles(next);
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Escape") {
                                                        e.preventDefault();
                                                        if (inlineEditorRef.current) {
                                                            inlineEditorRef.current.innerText = originalText;
                                                        }
                                                        setDraftText(originalText);
                                                        const existing = subtitles[index];
                                                        if (existing) {
                                                            const next = [...subtitles];
                                                            next[index] = { ...existing, text: originalText };
                                                            updateSubtitles(next);
                                                        }
                                                    }

                                                    if (e.key === "Enter" && !e.shiftKey) {
                                                        e.preventDefault();
                                                        inlineEditorRef.current?.blur();
                                                    }
                                                }}
                                                className="rounded-md text-foreground leading-relaxed whitespace-pre-line outline-none"
                                            />
                                        ) : (
                                            <div className="rounded-md pr-1 text-foreground leading-relaxed whitespace-pre-line">
                                                {renderHighlightedText(subtitle.text ?? "", searchQuery)}
                                            </div>
                                        )}

                                        <div
                                            className={`grid grid-cols-2 gap-2 overflow-hidden transition-all duration-200 ease-out ${isSelected ? "mt-4 max-h-24 opacity-100" : "mt-0 max-h-0 opacity-0"}`}
                                        >
                                            <Button
                                                variant="outline"
                                                className="text-xs h-8"
                                                disabled={!isSelected || index <= 0 || splitIntoWords(draftText).length === 0}
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleMoveFirstWordToPrev(index);
                                                }}
                                            >
                                                <ArrowUp className="h-4 w-4" />
                                                Move to prev
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="text-xs h-8"
                                                disabled={!isSelected || index >= subtitles.length - 1 || splitIntoWords(draftText).length === 0}
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleMoveLastWordToNext(index);
                                                }}
                                            >
                                                <ArrowDown className="h-4 w-4" />
                                                Move to next
                                            </Button>
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
