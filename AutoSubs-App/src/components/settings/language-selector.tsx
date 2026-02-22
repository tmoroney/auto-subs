import * as React from "react"
import { Globe, Languages, Check } from "lucide-react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Switch } from "@/components/ui/switch"
import { useSettings } from "@/contexts/SettingsContext"
import { languages, translateLanguages } from "@/lib/languages"
import { cn } from "@/lib/utils"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/animated-tabs"
import { useTranslation } from "react-i18next"

export function LanguageSelector() {
    const { t } = useTranslation()
    const { settings, updateSetting } = useSettings()
    const [languageTab, setLanguageTab] = React.useState<'source' | 'translate'>('source')

    return (
        <Tabs value={languageTab} onValueChange={(value) => setLanguageTab(value as 'source' | 'translate')}>
            <TabsContent value="source" className="mt-0 border-b">
                <Command className="max-h-[260px] rounded-b-none">
                    <CommandInput placeholder={t("actionBar.language.searchSourcePlaceholder")} />
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
                                            updateSetting("language", language.value);
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
            </TabsContent>

            <TabsContent value="translate" className="mt-0 border-b">
                <Command className="max-h-[260px] rounded-b-none">
                    <div className="relative">
                        <CommandInput placeholder={t("actionBar.language.searchTargetPlaceholder")} className="border-0 focus-visible:ring-0 px-0 pr-12" />
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
                                        updateSetting("targetLanguage", language.value);
                                        if (!settings.translate) {
                                            updateSetting("translate", true);
                                        }
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
            </TabsContent>
            <TabsList className="h-auto mx-2 mb-2 w-auto flex">
                <TabsTrigger value="source" className="flex-1 gap-1.5 text-xs py-1.5">
                    <Globe className="size-3.5" />
                    {t("actionBar.language.source")}
                </TabsTrigger>
                <TabsTrigger value="translate" className="flex-1 gap-1.5 text-xs py-1.5">
                    <Languages className="size-3.5" />
                    {t("actionBar.language.translate")}
                    {settings.translate && (
                        <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                </TabsTrigger>
            </TabsList>
        </Tabs>
    )
}
