import * as React from "react"
import { Check } from "lucide-react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Switch } from "@/components/ui/switch"
import { useSettings } from "@/contexts/SettingsContext"
import { languages, translateLanguages } from "@/lib/languages"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"

interface LanguageSelectorProps {
    mode: "source" | "translate"
    onSelect?: () => void
}

export function LanguageSelector({ mode, onSelect }: LanguageSelectorProps) {
    const { t } = useTranslation()
    const { settings, updateSetting } = useSettings()
    const inputRef = React.useRef<HTMLInputElement>(null)

    React.useEffect(() => {
        const timer = setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus()
                inputRef.current.select()
            }
        }, 50)
        return () => clearTimeout(timer)
    }, [mode])

    if (mode === "source") {
        return (
            <Command className="max-h-[220px]">
                <CommandInput ref={inputRef} placeholder={t("actionBar.language.searchSourcePlaceholder")} />
                <CommandList>
                    <CommandEmpty>{t("actionBar.language.noLanguageFound")}</CommandEmpty>
                    <CommandGroup>
                        {languages
                            .slice()
                            .map((language) => (
                                <CommandItem
                                    value={language.label}
                                    key={language.value}
                                    onSelect={() => {
                                        updateSetting("language", language.value)
                                        onSelect?.()
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            language.value === settings.language
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
        )
    }

    return (
        <Command className="max-h-[220px]">
            <div className="relative">
                <CommandInput ref={inputRef} placeholder={t("actionBar.language.searchTargetShortPlaceholder", "Search")} className="border-0 focus-visible:ring-0 px-0 pr-12" />
                <Switch
                    checked={settings.translate}
                    onCheckedChange={(checked: boolean) => updateSetting("translate", checked)}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                />
            </div>
            <CommandList>
                <CommandEmpty>{t("actionBar.language.noLanguageFound")}</CommandEmpty>
                <CommandGroup>
                    {translateLanguages.map((language) => (
                        <CommandItem
                            value={language.label}
                            key={language.value}
                            onSelect={() => {
                                updateSetting("targetLanguage", language.value)
                                if (!settings.translate) {
                                    updateSetting("translate", true)
                                }
                                onSelect?.()
                            }}
                        >
                            <Check
                                className={cn(
                                    "mr-2 h-4 w-4",
                                    language.value === settings.targetLanguage
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
    )
}
