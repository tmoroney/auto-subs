import * as React from "react"
import { Globe, Languages, Check, ChevronsUpDown, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

const languages = [
  { label: "Auto (default)", value: "auto" },
  { label: "English", value: "en" },
  { label: "Chinese", value: "zh" },
  { label: "German", value: "de" },
  { label: "Spanish", value: "es" },
  { label: "Russian", value: "ru" },
  { label: "Korean", value: "ko" },
  { label: "French", value: "fr" },
  { label: "Japanese", value: "ja" },
  { label: "Portuguese", value: "pt" },
  { label: "Turkish", value: "tr" },
  { label: "Polish", value: "pl" },
  { label: "Catalan", value: "ca" },
  { label: "Dutch", value: "nl" },
  { label: "Arabic", value: "ar" },
  { label: "Swedish", value: "sv" },
  { label: "Italian", value: "it" },
  { label: "Indonesian", value: "id" },
  { label: "Hindi", value: "hi" },
  { label: "Finnish", value: "fi" },
  { label: "Vietnamese", value: "vi" },
  { label: "Hebrew", value: "he" },
  { label: "Ukrainian", value: "uk" },
  { label: "Greek", value: "el" },
  { label: "Malay", value: "ms" },
  { label: "Czech", value: "cs" },
  { label: "Romanian", value: "ro" },
  { label: "Danish", value: "da" },
  { label: "Hungarian", value: "hu" },
  { label: "Tamil", value: "ta" },
  { label: "Norwegian", value: "no" },
  { label: "Thai", value: "th" },
  { label: "Urdu", value: "ur" },
  { label: "Croatian", value: "hr" },
  { label: "Bulgarian", value: "bg" },
  { label: "Lithuanian", value: "lt" },
  { label: "Latin", value: "la" },
  { label: "Maori", value: "mi" },
  { label: "Malayalam", value: "ml" },
  { label: "Welsh", value: "cy" },
  { label: "Slovak", value: "sk" },
  { label: "Telugu", value: "te" },
  { label: "Persian", value: "fa" },
  { label: "Latvian", value: "lv" },
  { label: "Bengali", value: "bn" },
  { label: "Serbian", value: "sr" },
  { label: "Azerbaijani", value: "az" },
  { label: "Slovenian", value: "sl" },
  { label: "Kannada", value: "kn" },
  { label: "Estonian", value: "et" },
  { label: "Macedonian", value: "mk" },
  { label: "Breton", value: "br" },
  { label: "Basque", value: "eu" },
  { label: "Icelandic", value: "is" },
  { label: "Armenian", value: "hy" },
  { label: "Nepali", value: "ne" },
  { label: "Mongolian", value: "mn" },
  { label: "Bosnian", value: "bs" },
  { label: "Kazakh", value: "kk" },
  { label: "Albanian", value: "sq" },
  { label: "Swahili", value: "sw" },
  { label: "Galician", value: "gl" },
  { label: "Marathi", value: "mr" },
  { label: "Punjabi", value: "pa" },
  { label: "Sinhala", value: "si" },
  { label: "Khmer", value: "km" },
  { label: "Shona", value: "sn" },
  { label: "Yoruba", value: "yo" },
  { label: "Somali", value: "so" },
  { label: "Afrikaans", value: "af" },
  { label: "Occitan", value: "oc" },
  { label: "Georgian", value: "ka" },
  { label: "Belarusian", value: "be" },
  { label: "Tajik", value: "tg" },
  { label: "Sindhi", value: "sd" },
  { label: "Gujarati", value: "gu" },
  { label: "Amharic", value: "am" },
  { label: "Yiddish", value: "yi" },
  { label: "Lao", value: "lo" },
  { label: "Uzbek", value: "uz" },
  { label: "Faroese", value: "fo" },
  { label: "Haitian Creole", value: "ht" },
  { label: "Pashto", value: "ps" },
  { label: "Turkmen", value: "tk" },
  { label: "Nynorsk", value: "nn" },
  { label: "Maltese", value: "mt" },
  { label: "Sanskrit", value: "sa" },
  { label: "Luxembourgish", value: "lb" },
  { label: "Myanmar", value: "my" },
  { label: "Tibetan", value: "bo" },
  { label: "Tagalog", value: "tl" },
  { label: "Malagasy", value: "mg" },
  { label: "Assamese", value: "as" },
  { label: "Tatar", value: "tt" },
  { label: "Hawaiian", value: "haw" },
  { label: "Lingala", value: "ln" },
  { label: "Hausa", value: "ha" },
  { label: "Bashkir", value: "ba" },
  { label: "Javanese", value: "jw" },
  { label: "Sundanese", value: "su" },
]

interface LanguageSettingsCardProps {
  sourceLanguage: string
  translate: boolean
  onSourceLanguageChange: (language: string) => void
  onTranslateChange: (translate: boolean) => void
}

export const LanguageSettingsCard = ({
  sourceLanguage,
  translate,
  onSourceLanguageChange,
  onTranslateChange
}: LanguageSettingsCardProps) => {
  const [openSourceLanguages, setOpenSourceLanguages] = React.useState(false)

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
        {sourceLanguage !== 'en' && (
          <div className="mt-3 pt-3 border-t flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="ml-0 p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Languages className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex items-center gap-1">
                <p className="text-sm font-medium">Translate to English</p>
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
                  <TooltipContent side="bottom" align="start" className="w-64 p-3">
                    <p className="text-xs text-left">
                      OpenAI Whisper models currently only support translating to English while transcribing. More language options coming soon with dedicated translation models.
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
        )}
      </div>
    </div>
  )
}
