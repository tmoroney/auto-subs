import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { listTranscriptFiles, readTranscript, type TranscriptListItem } from "@/utils/file-utils"
import { useTranscript } from "@/contexts/TranscriptContext"

interface TranscriptSearchPopoverProps {
  trigger: React.ReactNode
  onTranscriptOpen?: () => void
  align?: "start" | "center" | "end"
}

export function TranscriptSearchPopover({ trigger, onTranscriptOpen, align = "center" }: TranscriptSearchPopoverProps) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [transcripts, setTranscripts] = useState<TranscriptListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const { setSubtitles, setSpeakers, setCurrentTranscriptFilename } = useTranscript()

  useEffect(() => {
    loadTranscripts()
  }, [])

  useEffect(() => {
    if (open) {
      loadTranscripts()
    }
  }, [open])

  const loadTranscripts = async () => {
    setLoading(true)
    try {
      setTranscripts(await listTranscriptFiles())
      setHasLoaded(true)
    } catch (error) {
      console.error('Failed to load transcripts:', error)
    } finally {
      setLoading(false)
    }
  }

  const transcriptDateLocale = i18n.resolvedLanguage || i18n.language || undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align={align}>
        <Command>
          <CommandInput placeholder={t("titlebar.transcripts.searchPlaceholder")} />
          <CommandList>
            {loading && transcripts.length === 0 && !hasLoaded ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                {t("titlebar.transcripts.loading")}
              </div>
            ) : transcripts.length === 0 ? (
              <CommandEmpty>{t("titlebar.transcripts.empty")}</CommandEmpty>
            ) : (
              <CommandGroup>
                {transcripts.map((transcript) => (
                  <CommandItem
                    key={transcript.filename}
                    value={`${transcript.displayName} ${transcript.filename}`}
                    className="cursor-pointer"
                    onSelect={async () => {
                      try {
                        const transcriptData = await readTranscript(transcript.filename)
                        if (transcriptData) {
                          setSubtitles(transcriptData.segments || [])
                          setSpeakers(transcriptData.speakers || [])
                          setCurrentTranscriptFilename(transcript.filename)
                          onTranscriptOpen?.()
                        }
                      } catch (error) {
                        console.error('Failed to load transcript:', error)
                      }
                      setOpen(false)
                    }}
                  >
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-sm font-medium">
                        {transcript.displayName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {transcript.createdAt.toLocaleDateString(transcriptDateLocale, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
