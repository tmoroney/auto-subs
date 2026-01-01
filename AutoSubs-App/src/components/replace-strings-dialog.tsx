import { useState, useMemo, useEffect } from "react"
import { ArrowLeft, ArrowRight, Search, Replace } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Subtitle, Word } from "@/types/interfaces"

interface ReplaceStringsPanelProps {
    subtitles: Subtitle[]
    onReplace: (newSubtitles: Subtitle[]) => void
    onNavigateToOccurrence?: (subtitleIndex: number) => void
    onHighlightChange?: (text: string) => void
    onMatchCaseChange?: (matchCase: boolean) => void
}

interface Occurrence {
    subtitleIndex: number
    startIndex: number
    endIndex: number
}

export function ReplaceStringsPanel({
    subtitles,
    onReplace,
    onNavigateToOccurrence,
    onHighlightChange,
    onMatchCaseChange
}: ReplaceStringsPanelProps) {
    const [findText, setFindText] = useState("")
    const [replaceText, setReplaceText] = useState("")
    const [currentOccurrenceIndex, setCurrentOccurrenceIndex] = useState(0)
    const [matchCase, setMatchCase] = useState(false)

    const handleMatchCaseToggle = (newValue: boolean) => {
        setMatchCase(newValue)
        if (onMatchCaseChange) {
            onMatchCaseChange(newValue)
        }
    }

    const occurrences = useMemo(() => {
        if (!findText.trim()) return []

        const results: Occurrence[] = []
        const searchText = matchCase ? findText : findText.toLowerCase()

        subtitles.forEach((subtitle, subtitleIndex) => {
            const text = matchCase ? subtitle.text : subtitle.text.toLowerCase()
            let startIndex = 0

            while (true) {
                const index = text.indexOf(searchText, startIndex)
                if (index === -1) break
                results.push({
                    subtitleIndex,
                    startIndex: index,
                    endIndex: index + findText.length
                })
                startIndex = index + 1
            }
        })

        return results
    }, [subtitles, findText, matchCase])

    //Reset current occurrence when find text changes or occurrences change significantly
    useEffect(() => {
        if (occurrences.length > 0) {
            // If current index is out of bounds, reset to 0
            if (currentOccurrenceIndex >= occurrences.length || currentOccurrenceIndex < 0) {
                setCurrentOccurrenceIndex(0)
            }
        } else {
            setCurrentOccurrenceIndex(-1)
        }

        //Update highlight text when find text changes
        if (onHighlightChange) {
            onHighlightChange(findText)
        }
    }, [findText, occurrences.length, onHighlightChange])

    //After replacement, navigate to current occurrence when index changes
    useEffect(() => {
        if (currentOccurrenceIndex >= 0 && currentOccurrenceIndex < occurrences.length) {
            const occurrence = occurrences[currentOccurrenceIndex]
            if (onNavigateToOccurrence && occurrence) {
                onNavigateToOccurrence(occurrence.subtitleIndex)
            }
        }
    }, [currentOccurrenceIndex, occurrences, onNavigateToOccurrence])

    const currentOccurrence = useMemo(() => {
        if (occurrences.length === 0 || currentOccurrenceIndex < 0) return null
        return occurrences[currentOccurrenceIndex]
    }, [occurrences, currentOccurrenceIndex])

    //Navigate to previous
    const handlePrevious = () => {
        if (occurrences.length === 0) return
        const newIndex = currentOccurrenceIndex > 0
            ? currentOccurrenceIndex - 1
            : occurrences.length - 1
        setCurrentOccurrenceIndex(newIndex)

        const occurrence = occurrences[newIndex]
        if (onNavigateToOccurrence && occurrence) {
            onNavigateToOccurrence(occurrence.subtitleIndex)
        }
    }

    //Navigate to next
    const handleNext = () => {
        if (occurrences.length === 0) return
        const newIndex = currentOccurrenceIndex < occurrences.length - 1
            ? currentOccurrenceIndex + 1
            : 0
        setCurrentOccurrenceIndex(newIndex)

        const occurrence = occurrences[newIndex]
        if (onNavigateToOccurrence && occurrence) {
            onNavigateToOccurrence(occurrence.subtitleIndex)
        }
    }

    //Replace only the current occurrence
    const handleReplaceCurrent = () => {
        if (!findText.trim() || occurrences.length === 0) return

        const currentOccurrence = occurrences[currentOccurrenceIndex]
        if (!currentOccurrence) return

        const newSubtitles = subtitles.map((subtitle, subtitleIndex) => {
            if (subtitleIndex !== currentOccurrence.subtitleIndex) {
                return subtitle
            }

            const text = subtitle.text
            const beforeMatch = text.substring(0, currentOccurrence.startIndex)
            const afterMatch = text.substring(currentOccurrence.endIndex)
            const newText = beforeMatch + replaceText + afterMatch

            const newWords = reconstructWordsFromText(
                subtitle.words,
                newText
            )

            return {
                ...subtitle,
                text: newText,
                words: newWords
            }
        })

        onReplace(newSubtitles)

        //After replacement, the occurrences array will be automatically recalculated

        //If this was the last occurrence, the index will be out of bounds and
        //the useEffect will handle clearing the search
    }

    //Replace all occurrences
    const handleReplaceAll = () => {
        if (!findText.trim()) return

        const newSubtitles = subtitles.map(subtitle => {
            if (!subtitle.text.includes(findText)) {
                return subtitle
            }

            const newText = subtitle.text.replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replaceText)

            const newWords = reconstructWordsFromText(
                subtitle.words,
                newText
            )

            return {
                ...subtitle,
                text: newText,
                words: newWords
            }
        })

        onReplace(newSubtitles)
        setFindText("")
        setReplaceText("")
        if (onHighlightChange) {
            onHighlightChange("")
        }
    }

    //Reconstruct the words array recalculating word timings based on new text length.
    function reconstructWordsFromText(
        originalWords: Word[],
        newText: string
    ): Word[] {
        //If the replacement string doesn't change word boundaries significantly,
        //we can try to map the words. Otherwise, we split by spaces.

        //Simple approach: split new text by spaces and assign timing
        //from original words proportionally
        const newWordStrings = newText.split(/\s+/).filter(w => w.length > 0)

        if (newWordStrings.length === 0) {
            return []
        }

        //If the lengths are similar, we try to map words
        if (Math.abs(newWordStrings.length - originalWords.length) <= 2) {
            const result: Word[] = []

            //Try to map words one-to-one
            for (let i = 0; i < newWordStrings.length; i++) {
                const originalWord = originalWords[Math.min(i, originalWords.length - 1)]
                result.push({
                    ...originalWord,
                    word: newWordStrings[i],
                    line_number: originalWord?.line_number ?? 0
                })
            }

            return result
        }

        //Else, split proportionally
        const totalDuration = originalWords.length > 0
            ? originalWords[originalWords.length - 1].end - originalWords[0].start
            : 0

        const durationPerWord = totalDuration / newWordStrings.length

        return newWordStrings.map((word, index) => {
            const start = originalWords[0]?.start ?? 0
            return {
                word,
                start: start + (index * durationPerWord),
                end: start + ((index + 1) * durationPerWord),
                line_number: 0
            }
        })
    }

    return (
        <div className="border-t bg-sidebar p-3 space-y-3">
            <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Search/Replace Words</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                    <Label htmlFor="find-text" className="text-xs">Find</Label>
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            id="find-text"
                            placeholder="Text to find..."
                            value={findText}
                            onChange={(e) => setFindText(e.target.value)}
                            className="pl-7 pr-20 h-8 text-sm"
                        />
                        <Button
                            type="button"
                            variant={matchCase ? "default" : "ghost"}
                            size="icon"
                            onClick={() => handleMatchCaseToggle(!matchCase)}
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-xs"
                            title="Match Case"
                        >
                            <span className="text-[10px] font-semibold leading-none">Aa</span>
                        </Button>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="replace-text" className="text-xs">Replace with</Label>
                    <div className="relative">
                        <Replace className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            id="replace-text"
                            placeholder="Replacement text..."
                            value={replaceText}
                            onChange={(e) => setReplaceText(e.target.value)}
                            className="pl-7 h-8 text-sm"
                        />
                    </div>
                </div>
            </div>

            {findText && occurrences.length > 0 && (
                <div className="flex items-center justify-between p-2 bg-muted rounded-md">
                    <div className="text-xs text-muted-foreground">
                        {occurrences.length} occurrence{occurrences.length !== 1 ? 's' : ''} found
                        {currentOccurrence && (
                            <span className="ml-2 text-foreground font-medium">
                                ({currentOccurrenceIndex + 1} of {occurrences.length})
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handlePrevious}
                            disabled={occurrences.length === 0}
                            className="h-7 w-7"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleNext}
                            disabled={occurrences.length === 0}
                            className="h-7 w-7"
                        >
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            )}

            {findText && occurrences.length === 0 && (
                <div className="p-2 bg-muted rounded-md text-xs text-muted-foreground text-center">
                    No occurrences found
                </div>
            )}

            {findText && occurrences.length > 0 && (
                <div className="flex gap-2 animate-slide-up">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReplaceCurrent}
                        disabled={!findText.trim() || occurrences.length === 0}
                        className="flex-1 text-xs h-8"
                    >
                        Replace Current
                    </Button>
                    <Button
                        onClick={handleReplaceAll}
                        disabled={!findText.trim() || occurrences.length === 0}
                        size="sm"
                        className="flex-1 text-xs h-8"
                    >
                        Replace All ({occurrences.length})
                    </Button>
                </div>
            )}
        </div>
    )
}

