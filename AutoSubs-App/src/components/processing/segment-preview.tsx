import { Subtitle } from "@/types"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

interface SegmentPreviewProps {
    segments: Subtitle[]
    isActive: boolean
    placeholder?: string
}

interface DisplayEntry {
    id: number
    speaker_id?: string
    targetText: string
    displayText: string
    isDecrypting: boolean
}

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*"

function getSpeakerColor(id?: string) {
    if (!id || id === "?") return "hsl(0, 0%, 60%)"
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
    const hue = Math.abs(hash % 360)
    return `hsl(${hue}, 70%, 55%)`
}

function formatSpeakerLabel(id?: string) {
    if (!id || id === "?") return "Speaker ?"
    return `Speaker ${id}`
}

export function SegmentPreview({ segments, isActive, placeholder }: SegmentPreviewProps) {
    const { t } = useTranslation()
    const scrollRef = useRef<HTMLDivElement>(null)
    const [displayEntries, setDisplayEntries] = useState<DisplayEntry[]>([])
    const decryptRef = useRef<number | null>(null)

    const userScrolledRef = useRef(false)
    const scrollCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const isAtBottom = useCallback(() => {
        if (!scrollRef.current) return true
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
        return scrollHeight - scrollTop - clientHeight < 40
    }, [])

    const scrollToBottom = useCallback(() => {
        if (scrollRef.current && !userScrolledRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [])

    useEffect(() => {
        const element = scrollRef.current
        if (!element) return

        const handleUserScroll = () => {
            userScrolledRef.current = true
            if (scrollCheckTimeoutRef.current) clearTimeout(scrollCheckTimeoutRef.current)
            scrollCheckTimeoutRef.current = setTimeout(() => {
                if (isAtBottom()) userScrolledRef.current = false
            }, 150)
        }

        element.addEventListener('wheel', handleUserScroll, { passive: true })
        element.addEventListener('touchmove', handleUserScroll, { passive: true })

        return () => {
            element.removeEventListener('wheel', handleUserScroll)
            element.removeEventListener('touchmove', handleUserScroll)
            if (scrollCheckTimeoutRef.current) clearTimeout(scrollCheckTimeoutRef.current)
        }
    }, [isAtBottom])

    useEffect(() => {
        if (segments.length === 0) {
            userScrolledRef.current = false
        }
    }, [segments.length])

    useEffect(() => {
        scrollToBottom()
    }, [displayEntries, scrollToBottom])

    // Sync display entries with incoming segments and trigger decrypt on text changes.
    useEffect(() => {
        setDisplayEntries((prev) => {
            const next: DisplayEntry[] = [...prev]
            let changed = false

            for (let i = 0; i < segments.length; i++) {
                const segment = segments[i]
                if (!segment) continue

                const existing = next[i]
                if (!existing) {
                    next[i] = {
                        id: segment.id ?? i + 1,
                        speaker_id: segment.speaker_id,
                        targetText: segment.text,
                        displayText: segment.text,
                        isDecrypting: false,
                    }
                    changed = true
                } else if (existing.targetText !== segment.text) {
                    next[i] = { ...existing, targetText: segment.text, isDecrypting: true }
                    changed = true
                }

                if (next[i] && next[i].speaker_id !== segment.speaker_id) {
                    next[i] = { ...next[i], speaker_id: segment.speaker_id }
                    changed = true
                }
            }

            // Trim entries if segments shrink (e.g. reset)
            if (next.length > segments.length) {
                next.length = segments.length
                changed = true
            }

            return changed ? next : prev
        })
    }, [segments])

    // Decrypt animation: scramble characters toward target text.
    useEffect(() => {
        const step = () => {
            setDisplayEntries((prev) => {
                const next = [...prev]
                let hasDecrypting = false

                for (let i = 0; i < next.length; i++) {
                    const entry = next[i]
                    if (!entry || !entry.isDecrypting) continue

                    hasDecrypting = true
                    const current = entry.displayText
                    const target = entry.targetText

                    if (current === target) {
                        next[i] = { ...entry, isDecrypting: false }
                        continue
                    }

                    let newText = ""
                    for (let j = 0; j < target.length; j++) {
                        if (j < current.length && current[j] === target[j] && Math.random() > 0.25) {
                            newText += target[j]
                        } else if (j < current.length && Math.random() > 0.6) {
                            newText += target[j]
                        } else if (j < current.length) {
                            newText += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
                        } else {
                            newText += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
                        }
                    }
                    next[i] = { ...entry, displayText: newText }
                }

                if (!hasDecrypting && decryptRef.current) {
                    cancelAnimationFrame(decryptRef.current)
                    decryptRef.current = null
                }

                return next
            })

            decryptRef.current = requestAnimationFrame(step)
        }

        const needsAnimation = displayEntries.some((e) => e?.isDecrypting)
        if (needsAnimation && !decryptRef.current) {
            decryptRef.current = requestAnimationFrame(step)
        }

        return () => {
            if (decryptRef.current) {
                cancelAnimationFrame(decryptRef.current)
                decryptRef.current = null
            }
        }
    }, [displayEntries])

    const groups = useMemo(() => {
        const result: { speaker_id?: string; entries: DisplayEntry[] }[] = []
        for (const entry of displayEntries) {
            if (!entry) continue
            const last = result[result.length - 1]
            if (last && last.speaker_id === entry.speaker_id) {
                last.entries.push(entry)
            } else {
                result.push({ speaker_id: entry.speaker_id, entries: [entry] })
            }
        }
        return result
    }, [displayEntries])

    const hasContent = groups.length > 0 && groups.some((g) => g.entries.some((e) => e.displayText.trim()))

    return (
        <div
            ref={scrollRef}
            className="max-h-48 overflow-y-auto rounded-xl bg-muted/40 p-3 text-sm leading-relaxed"
        >
            {hasContent ? (
                <div className="flex flex-col gap-3">
                    {groups.map((group, groupIdx) => {
                        const color = getSpeakerColor(group.speaker_id)
                        return (
                            <div key={groupIdx} className="flex gap-2">
                                <div
                                    className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: color }}
                                />
                                <div className="flex-1">
                                    <span
                                        className="mr-1 inline-block rounded px-1 py-0.5 text-xs font-medium"
                                        style={{ color, backgroundColor: `${color}20` }}
                                    >
                                        {formatSpeakerLabel(group.speaker_id)}
                                    </span>
                                    {group.entries.map((entry, idx) => (
                                        <span key={entry.id} className={cn(idx > 0 && "ml-1")}>
                                            {entry.displayText || entry.targetText}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : isActive ? (
                <span className="italic text-muted-foreground">
                    {placeholder || t("subtitles.waitingForSubtitles")}
                </span>
            ) : null}
        </div>
    )
}
