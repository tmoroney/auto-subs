import * as React from "react"
import { Globe, Languages, Check, Cpu, Cloud } from "lucide-react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useSettings } from "@/contexts/SettingsContext"
import { languages, translateLanguages, getTranslationMethod } from "@/lib/languages"
import { models, modelSupportsLanguage } from "@/lib/models"
import { cn } from "@/lib/utils"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/animated-tabs"
import { useTranslation } from "react-i18next"

export function LanguageSelector() {
    const { t } = useTranslation()
    const { settings, updateSetting } = useSettings()
    const [languageTab, setLanguageTab] = React.useState<'source' | 'translate'>('source')
    const currentModel = models[settings.model]
    const sourceInputRef = React.useRef<HTMLInputElement>(null)
    const translateInputRef = React.useRef<HTMLInputElement>(null)

    React.useEffect(() => {
        const timer = setTimeout(() => {
            const input = languageTab === 'source' ? sourceInputRef.current : translateInputRef.current
            if (input) {
                input.focus()
                input.select()
            }
        }, 50)
        return () => clearTimeout(timer)
    }, [languageTab])

    return (
        <TooltipProvider>
            <Tabs value={languageTab} onValueChange={(value) => setLanguageTab(value as 'source' | 'translate')}>
            <TabsContent value="source" className="mt-0 border-b">
                <Command className="max-h-[240px] rounded-b-none">
                    <CommandInput ref={sourceInputRef} placeholder={t("actionBar.language.searchSourcePlaceholder")} />
                    <CommandList>
                        <CommandEmpty>{t("actionBar.language.noLanguageFound")}</CommandEmpty>
                        <CommandGroup>
                            {languages
                                .slice()
                                .map((language) => {
                                    const supported = currentModel
                                        ? modelSupportsLanguage(currentModel, language.value)
                                        : true
                                    return (
                                    <CommandItem
                                        value={language.label}
                                        key={language.value}
                                        onSelect={() => {
                                            updateSetting("language", language.value);
                                        }}
                                        className={cn(
                                            !supported && "opacity-40 pointer-events-auto"
                                        )}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 size-4",
                                                language.value === settings.language
                                                    ? "opacity-100"
                                                    : "opacity-0"
                                            )}
                                        />
                                        {language.label}
                                    </CommandItem>
                                    )
                                })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </TabsContent>

            <TabsContent value="translate" className="mt-0 border-b">
                <Command className="max-h-[240px] rounded-b-none">
                    <div className="relative">
                        <CommandInput ref={translateInputRef} placeholder={t("actionBar.language.searchTargetPlaceholder")} className="border-0 focus-visible:ring-0 px-0 pr-12" />
                        <Switch
                            checked={settings.translate}
                            onCheckedChange={(checked: boolean) => updateSetting("translate", checked)}
                            className="absolute right-2 top-1/2 -translate-y-1/2"
                        />
                    </div>
                    <CommandList>
                        <CommandEmpty>{t("actionBar.language.noLanguageFound")}</CommandEmpty>
                        <CommandGroup>
                            {translateLanguages.map((language) => {
                                const method = currentModel
                                    ? getTranslationMethod(currentModel.engine, settings.language, language.value)
                                    : "google"
                                return (
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
                                            "mr-2 size-4",
                                            language.value === settings.targetLanguage
                                                ? "opacity-100"
                                                : "opacity-0"
                                        )}
                                    />
                                    {language.label}
                                    {method === "native" ? (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="ml-auto mr-2" onPointerDown={(e) => e.stopPropagation()}>
                                                    <Cpu
                                                        className="size-3.5 text-muted-foreground"
                                                        aria-label={t("actionBar.language.nativeTranslation")}
                                                    />
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Model translation</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    ) : (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="ml-auto mr-2" onPointerDown={(e) => e.stopPropagation()}>
                                                    <Cloud
                                                        className="size-3.5 text-muted-foreground"
                                                        aria-label={t("actionBar.language.googleTranslation")}
                                                    />
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Google Translate</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    )}
                                </CommandItem>
                                )
                            })}
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
                        <span className="ml-0.5 size-1.5 rounded-full bg-primary" />
                    )}
                </TabsTrigger>
            </TabsList>
        </Tabs>
        </TooltipProvider>
    )
}