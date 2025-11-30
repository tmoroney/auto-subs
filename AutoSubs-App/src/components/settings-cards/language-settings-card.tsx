import * as React from "react"
import { Globe, Languages, Check, ChevronsUpDown, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { languages, translateLanguages } from "@/lib/languages"

interface LanguageSettingsCardProps {
  sourceLanguage: string
  translate: boolean
  targetLanguage: string
  onSourceLanguageChange: (language: string) => void
  onTranslateChange: (translate: boolean) => void
  onTargetLanguageChange: (language: string) => void
}

export const LanguageSettingsCard = ({
  sourceLanguage,
  translate,
  targetLanguage,
  onSourceLanguageChange,
  onTranslateChange,
  onTargetLanguageChange
}: LanguageSettingsCardProps) => {
  const [openSourceLanguages, setOpenSourceLanguages] = React.useState(false)
  const [openTargetLanguages, setOpenTargetLanguages] = React.useState(false)

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Globe className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Input Language</p>
              <p className="text-xs text-muted-foreground">Select language spoken in audio</p>
            </div>
          </div>
        </div>

        <Popover open={openSourceLanguages} onOpenChange={setOpenSourceLanguages}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openSourceLanguages}
              className="w-full justify-between font-normal mt-3"
            >
              {sourceLanguage
                ? languages.find((language) => language.value === sourceLanguage)?.label
                : "Select language..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-full">
            <Command className="max-h-[250px]">
              <CommandInput placeholder="Search languages..." />
              <CommandList>
                <CommandEmpty>No language found.</CommandEmpty>
                <CommandGroup>
                  {languages
                    .slice()
                    .sort((a, b) => {
                      if (a.value === 'auto') return -1;
                      if (b.value === 'auto') return 1;
                      return a.label.localeCompare(b.label);
                    })
                    .map((language) => (
                      <CommandItem
                        value={language.label}
                        key={language.value}
                        onSelect={() => {
                          onSourceLanguageChange(language.value);
                          setOpenSourceLanguages(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            language.value === sourceLanguage
                              ? "opacity-100"
                              : "opacity-0"
                          )}
                        />
                        {language.label}
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {/* Translation */}
        <div className="mt-3 pt-3 border-t flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="ml-0 p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Languages className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex items-center gap-1">
              <p className="text-sm font-medium">Translate Output</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    tabIndex={0}
                    className="rounded-full hover:bg-muted focus:outline-none focus:ring-2 focus:ring-blue-400 inline-flex items-center justify-center h-4 w-4 text-slate-700 dark:text-slate-300"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center" className="w-64 p-3">
                  <p className="text-xs text-left">
                    {targetLanguage === 'en' 
                      ? "Translates during transcription with Whisper. Fast, high quality, offline."
                      : "Uses Google Translate to translate after transcription. Internet required and may slightly increase processing time."
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <Switch
            checked={translate}
            onCheckedChange={onTranslateChange}
          />
        </div>

        {translate && (
          <div className="mt-3">
            <Popover open={openTargetLanguages} onOpenChange={setOpenTargetLanguages}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openTargetLanguages}
                  className="w-full justify-between font-normal"
                >
                  {targetLanguage
                    ? translateLanguages.find((language) => language.value === targetLanguage)?.label
                    : "Select target language..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-full">
                <Command className="max-h-[250px]">
                  <CommandInput placeholder="Search languages..." />
                  <CommandList>
                    <CommandEmpty>No language found.</CommandEmpty>
                    <CommandGroup>
                      {translateLanguages
                        .slice()
                        .sort((a, b) => {
                          if (a.value === 'en') return -1;
                          if (b.value === 'en') return 1;
                          return a.label.localeCompare(b.label);
                        })
                        .map((language) => (
                          <CommandItem
                            value={language.label}
                            key={language.value}
                            onSelect={() => {
                              onTargetLanguageChange(language.value);
                              setOpenTargetLanguages(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                language.value === targetLanguage
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            {language.label}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
    </div>
  )
}
