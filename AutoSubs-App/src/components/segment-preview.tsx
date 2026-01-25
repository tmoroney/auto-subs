import { Subtitle } from "@/types/interfaces"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

interface SegmentPreviewProps {
    segments: Subtitle[]
    isActive: boolean
}

export function SegmentPreview({ segments, isActive }: SegmentPreviewProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [streamedText, setStreamedText] = useState("")
    const [isStreaming, setIsStreaming] = useState(false)
    const streamingRef = useRef(false)
    
    // Track if user has manually scrolled away from bottom
    const userScrolledRef = useRef(false)
    const scrollCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    
    // Check if scrolled to bottom (within threshold)
    const isAtBottom = useCallback(() => {
        if (!scrollRef.current) return true
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
        return scrollHeight - scrollTop - clientHeight < 40 // 40px threshold
    }, [])
    
    // Memoize full text calculation
    const fullText = useMemo(() => 
        segments.map(segment => segment.text).join(' ').trim(),
        [segments]
    )
    
    // Memoize words array
    const words = useMemo(() => 
        fullText.split(' '),
        [fullText]
    )
    
    // Optimized scroll to bottom
    const scrollToBottom = useCallback(() => {
        if (scrollRef.current && !userScrolledRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [])
    
    // Handle user scroll - detect manual scrolling via wheel/touch
    useEffect(() => {
        const element = scrollRef.current
        if (!element) return
        
        const handleUserScroll = () => {
            // User is manually scrolling - disable auto-scroll
            userScrolledRef.current = true
            
            // Clear any pending check
            if (scrollCheckTimeoutRef.current) {
                clearTimeout(scrollCheckTimeoutRef.current)
            }
            
            // After user stops scrolling, check if they're at bottom
            scrollCheckTimeoutRef.current = setTimeout(() => {
                if (isAtBottom()) {
                    // User scrolled back to bottom - re-enable auto-scroll
                    userScrolledRef.current = false
                }
            }, 150) // 150ms debounce - enough time to not fight the user
        }
        
        element.addEventListener('wheel', handleUserScroll, { passive: true })
        element.addEventListener('touchmove', handleUserScroll, { passive: true })
        
        return () => {
            element.removeEventListener('wheel', handleUserScroll)
            element.removeEventListener('touchmove', handleUserScroll)
            if (scrollCheckTimeoutRef.current) {
                clearTimeout(scrollCheckTimeoutRef.current)
            }
        }
    }, [isAtBottom])
    
    // Reset userScrolled when segments are cleared (new transcription)
    useEffect(() => {
        if (segments.length === 0) {
            userScrolledRef.current = false
        }
    }, [segments.length])
    
    useEffect(() => {
        scrollToBottom()
    }, [streamedText, scrollToBottom]);
    
    // Optimized streaming with better diff algorithm
    useEffect(() => {
        if (fullText && fullText !== streamedText && !streamingRef.current) {
            setIsStreaming(true)
            streamingRef.current = true
            
            const currentWords = streamedText.split(' ')
            
            // Find first differing word using more efficient approach
            let startIndex = 0
            const minLength = Math.min(currentWords.length, words.length)
            
            while (startIndex < minLength && currentWords[startIndex] === words[startIndex]) {
                startIndex++
            }
            
            // Stream remaining words with requestAnimationFrame for better performance
            let currentIndex = startIndex
            let lastTime = 0
            
            const streamFrame = (timestamp: number) => {
                if (timestamp - lastTime >= 30) { // 30ms interval
                    if (currentIndex < words.length) {
                        setStreamedText(words.slice(0, currentIndex + 1).join(' '))
                        currentIndex++
                        lastTime = timestamp
                        requestAnimationFrame(streamFrame)
                    } else {
                        setIsStreaming(false)
                        streamingRef.current = false
                    }
                } else {
                    requestAnimationFrame(streamFrame)
                }
            }
            
            requestAnimationFrame(streamFrame)
            
        } else if (!fullText) {
            setStreamedText("")
            setIsStreaming(false)
            streamingRef.current = false
        }
        
        return () => {
            streamingRef.current = false
        }
    }, [fullText, words]);
    
    return (
        <div 
            ref={scrollRef}
            className="max-h-32 overflow-y-auto p-3"
        >
            <div className="text-xs text-muted-foreground">
                {streamedText || (isActive && !isStreaming && (
                    <span className="italic">Waiting for subtitles...</span>
                ))}
            </div>
        </div>
    )
}

// Add the fade-in animation to your global CSS or tailwind config
// @keyframes fade-in {
//   from { opacity: 0; transform: translateY(4px); }
//   to { opacity: 1; transform: translateY(0); }
// }
