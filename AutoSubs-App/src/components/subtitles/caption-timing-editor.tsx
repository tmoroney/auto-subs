import { useState } from "react"
import { Clock } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatEditableTime, parseEditableTime, type RetimeError } from "@/utils/caption-timing"

interface CaptionTimingEditorProps {
    start: number;
    end: number;
    /** Apply the new times, or return why they were rejected. */
    onSave: (start: number, end: number) => RetimeError | null;
    className?: string;
}

export function CaptionTimingEditor({ start, end, onSave, className = "" }: CaptionTimingEditorProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [startText, setStartText] = useState("");
    const [endText, setEndText] = useState("");
    const [error, setError] = useState<RetimeError | null>(null);

    const handleOpenChange = (next: boolean) => {
        if (next) {
            setStartText(formatEditableTime(start));
            setEndText(formatEditableTime(end));
            setError(null);
        }
        setOpen(next);
    };

    const save = () => {
        const nextStart = parseEditableTime(startText);
        const nextEnd = parseEditableTime(endText);
        const result = nextStart === null || nextEnd === null ? "invalid" : onSave(nextStart, nextEnd);
        if (result) {
            setError(result);
            return;
        }
        setOpen(false);
    };

    const field = (id: string, label: string, value: string, onChange: (value: string) => void) => (
        <div className="grid gap-1.5">
            <Label htmlFor={id} className="text-xs">{label}</Label>
            <Input
                id={id}
                value={value}
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                className="h-8 font-mono text-xs"
                aria-invalid={error !== null}
                onChange={(e) => {
                    onChange(e.target.value);
                    setError(null);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        save();
                    }
                }}
            />
        </div>
    );

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    title={t("subtitles.timing.edit")}
                    aria-label={t("subtitles.timing.edit")}
                    className={`size-6 text-muted-foreground hover:text-primary ${className}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Clock className="size-3.5" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 bg-card" onClick={(e) => e.stopPropagation()}>
                <div className="grid gap-3">
                    <div className="grid grid-cols-2 gap-2">
                        {field("caption-timing-start", t("subtitles.timing.start"), startText, setStartText)}
                        {field("caption-timing-end", t("subtitles.timing.end"), endText, setEndText)}
                    </div>
                    {error ? (
                        <p role="alert" className="text-xs text-destructive">{t(`subtitles.timing.errors.${error}`)}</p>
                    ) : null}
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
                            {t("common.cancel")}
                        </Button>
                        <Button size="sm" className="h-7 text-xs" onClick={save}>
                            {t("common.apply")}
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
