import * as React from "react"
import { Caption } from "@/data/captions"
import { Button } from "@/components/ui/button"
import { Edit2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface CaptionListProps {
    captions: Caption[]
    onEditCaption?: (id: number) => void
    className?: string
    itemClassName?: string
    showEditOnHover?: boolean
}

import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose
} from "@/components/ui/dialog"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Input } from "./ui/input"

export function CaptionList({
    captions,
    onEditCaption,
    className = "",
    itemClassName = "",
    showEditOnHover = true,
}: CaptionListProps) {
    const [hoveredCaption, setHoveredCaption] = React.useState<number | null>(null)
    const [editingId, setEditingId] = React.useState<number | null>(null)
    const [editCaptions, setEditCaptions] = React.useState<Caption[]>([])
    const [editWords, setEditWords] = React.useState<string[]>([])

    // Open dialog and initialize edit state
    const handleOpenEdit = (id: number) => {
        setEditingId(id)
        setEditCaptions([...captions])
        const current = captions.find(c => c.id === id)
        setEditWords(current ? current.text.split(" ") : [])
    }

    // Save edits
    const handleSave = () => {
        if (editingId == null) return
        const idx = editCaptions.findIndex(c => c.id === editingId)
        if (idx === -1) return
        const updated = [...editCaptions]
        updated[idx] = { ...updated[idx], text: editWords.join(" ") }
        setEditCaptions(updated)
        setEditingId(null)
        setEditWords([])
        if (onEditCaption) onEditCaption(editingId)
    }

    // Move word to previous caption
    const moveWordToPrev = () => {
        if (editingId == null) return
        const idx = editCaptions.findIndex(c => c.id === editingId)
        if (idx <= 0) return
        const prev = editCaptions[idx - 1]
        const updated = [...editCaptions]
        // Move first word
        updated[idx - 1] = { ...prev, text: prev.text + " " + editWords[0] }
        setEditWords(words => words.slice(1))
        updated[idx] = { ...updated[idx], text: editWords.slice(1).join(" ") }
        setEditCaptions(updated)
    }

    // Move word to next caption
    const moveWordToNext = () => {
        if (editingId == null) return
        const idx = editCaptions.findIndex(c => c.id === editingId)
        if (idx === -1 || idx === editCaptions.length - 1) return
        const next = editCaptions[idx + 1]
        const updated = [...editCaptions]
        // Move last word
        updated[idx + 1] = { ...next, text: editWords[editWords.length - 1] + " " + next.text }
        setEditWords(words => words.slice(0, -1))
        updated[idx] = { ...updated[idx], text: editWords.slice(0, -1).join(" ") }
        setEditCaptions(updated)
    }

    // Edit a word
    const handleWordChange = (i: number, value: string) => {
        setEditWords(words => words.map((w, idx) => idx === i ? value : w))
    }

    if (captions.length === 0) {
        return (
            <div className="p-4 text-center text-sm text-muted-foreground">
                No captions found
            </div>
        )
    }

    return (
        <div className={className}>
            {captions.map((caption) => (
                <div
                    key={caption.id}
                    className={`relative flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight last:border-b-0 hover:bg-muted/50 group ${itemClassName}`}
                    onMouseEnter={() => setHoveredCaption(caption.id)}
                    onMouseLeave={() => setHoveredCaption(null)}
                    onTouchStart={() => setHoveredCaption(caption.id)}
                    onTouchEnd={() => setHoveredCaption(null)}
                >
                    <div className="flex w-full items-center gap-2">
                        <span className={`font-medium text-xs text-${caption.color}`}>{caption.speaker}</span>
                        <span className="ml-auto text-xs text-muted-foreground font-mono">{caption.timestamp}</span>
                    </div>
                    <div className="relative w-full pr-8">
                        <span className="text-foreground leading-relaxed">{caption.text}</span>
                        {onEditCaption && (hoveredCaption === caption.id || !showEditOnHover) && (
                            <Dialog open={editingId === caption.id} onOpenChange={open => { if (!open) setEditingId(null) }}>
                                <DialogTrigger asChild>
                                    <Button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenEdit(caption.id);
                                        }}
                                        size="icon"
                                        variant="outline"
                                        className="absolute -right-2 -bottom-2 h-8 w-8 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity bg-background hover:bg-background/50"
                                    >
                                        <Edit2 className="h-4 w-4" />
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Edit Caption</DialogTitle>
                                    </DialogHeader>
                                    <div className="flex flex-wrap gap-2">
                                        {editWords.map((word, i) => (
                                            <div key={i} className="flex items-center gap-1">
                                                {i === 0 && captions.findIndex(c => c.id === caption.id) > 0 && (
                                                    <Button variant="outline" onClick={moveWordToPrev} className="p-1 text-xs"><ArrowLeft size={16} /></Button>
                                                )}
                                                <Input
                                                    className="border px-1 rounded min-w-[2rem] text-center"
                                                    value={word}
                                                    onChange={(e) => handleWordChange(i, e.target.value)}
                                                    readOnly={editWords.length === 1} // Prevent deleting last word
                                                />
                                                {i === editWords.length - 1 && captions.findIndex(c => c.id === caption.id) < captions.length - 1 && (
                                                    <Button variant="outline" onClick={moveWordToNext} className="p-1 text-xs"><ArrowRight size={16} /></Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <DialogFooter className="mt-4">
                                        <DialogClose asChild>
                                            <Button variant="ghost">Cancel</Button>
                                        </DialogClose>
                                        <Button onClick={handleSave} variant="default">Save</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}
