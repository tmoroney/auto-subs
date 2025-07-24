import * as React from "react"
import { Captions, Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { Template } from "@/types/interfaces"

interface CaptionSettingsCardProps {
  selectedTemplate: Template
  onTemplateChange: (template: Template) => void
  outputTracks?: { label: string; value: string }[]
  templates?: { label: string; value: string }[]
  selectedOutputTrack?: string
  onOutputTrackChange?: (track: string) => void
}

const defaultTemplates = [
  { value: "minimal", label: "Minimal" },
  { value: "modern", label: "Modern" },
  { value: "classic", label: "Classic" },
  { value: "bold", label: "Bold" },
  { value: "elegant", label: "Elegant" },
]

export const CaptionSettingsCard = ({
  selectedTemplate,
  onTemplateChange,
  outputTracks = [],
  templates = defaultTemplates,
  selectedOutputTrack = "1",
  onOutputTrackChange = () => {}
}: CaptionSettingsCardProps) => {
  const [openTemplates, setOpenTemplates] = React.useState(false)

  return (
    <Card className="p-4 shadow-none">
      <div className="space-y-3.5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/50">
            <Captions className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Caption Settings</p>
            <p className="text-xs text-muted-foreground">Configure track, template, and styling</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Output Track</Label>
            <Select 
              value={selectedOutputTrack} 
              onValueChange={onOutputTrackChange}
            >
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {outputTracks.length > 0 ? (
                  outputTracks.map((track) => (
                    <SelectItem key={track.value} value={track.value}>
                      {track.label}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="1">Video Track 1</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Base Template</Label>
            <Popover open={openTemplates} onOpenChange={setOpenTemplates}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[180px] h-9 justify-between font-normal"
                >
                  {selectedTemplate?.label || "Select template..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[180px]" align="end">
                <Command>
                  <CommandInput placeholder="Search templates..." />
                  <CommandList>
                    <CommandEmpty>No templates found.</CommandEmpty>
                    <CommandGroup>
                      {templates.map((template) => (
                        <CommandItem
                          key={template.value}
                          value={template.value}
                          onSelect={() => {
                            onTemplateChange(template)
                            setOpenTemplates(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedTemplate?.value === template.value ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {template.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </Card>
  )
}
