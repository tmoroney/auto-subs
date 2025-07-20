import * as React from "react"
import { Tally5, AArrowUp, Signature, ShieldX, Trash2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface TextFormattingCardProps {
  maxWordsLine: string
  textFormat: "none" | "uppercase" | "lowercase"
  removePunctuation: boolean
  censorWords: boolean
  sensitiveWords: string[]
  onMaxWordsLineChange: (value: string) => void
  onTextFormatChange: (format: "none" | "uppercase" | "lowercase") => void
  onRemovePunctuationChange: (checked: boolean) => void
  onCensorWordsChange: (checked: boolean) => void
  onSensitiveWordsChange: (words: string[]) => void
  walkthroughMode?: boolean
}

export const TextFormattingCard = ({
  maxWordsLine,
  textFormat,
  removePunctuation,
  censorWords,
  sensitiveWords,
  onMaxWordsLineChange,
  onTextFormatChange,
  onRemovePunctuationChange,
  onCensorWordsChange,
  onSensitiveWordsChange,
  walkthroughMode = false
}: TextFormattingCardProps) => {
  return (
    <div className="space-y-4">
      {/* Max Words */}
      <div className="flex items-center justify-between p-3.5 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
            <Tally5 className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <p className="text-sm font-medium">Max Words</p>
            <p className="text-xs text-muted-foreground">Number of words per line</p>
          </div>
        </div>
        <Input
          type="number"
          min="1"
          value={maxWordsLine}
          onChange={(e) => onMaxWordsLineChange(e.target.value)}
          className="w-20"
        />
      </div>

      {/* Text Case */}
      <div className="border rounded-lg overflow-hidden">
        <div className="p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
                <AArrowUp className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Text Case</p>
                <p className="text-xs text-muted-foreground">Set all text to specific case</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 px-3",
                  textFormat === "uppercase" && "bg-cyan-50 border-cyan-200 dark:bg-cyan-900/30 dark:border-cyan-800 hover:bg-cyan-100 dark:hover:bg-cyan-900/40"
                )}
                onClick={() => {
                  const newFormat = textFormat === "uppercase" ? "none" : "uppercase";
                  onTextFormatChange(newFormat);
                }}
              >
                ABC
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 px-3",
                  textFormat === "lowercase" && "bg-cyan-50 border-cyan-200 dark:bg-cyan-900/30 dark:border-cyan-800 hover:bg-cyan-100 dark:hover:bg-cyan-900/40"
                )}
                onClick={() => {
                  const newFormat = textFormat === "lowercase" ? "none" : "lowercase";
                  onTextFormatChange(newFormat);
                }}
              >
                abc
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Remove Punctuation */}
      <div className="flex items-center justify-between p-3.5 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
            <Signature className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <p className="text-sm font-medium">Remove Punctuation</p>
            <p className="text-xs text-muted-foreground">Removes all commas, periods, etc.</p>
          </div>
        </div>
        <Switch
          checked={removePunctuation}
          onCheckedChange={onRemovePunctuationChange}
        />
      </div>

      {/* Censored Words */}
      <div className="border rounded-lg overflow-hidden">
        <div className="p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
                <ShieldX className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Censor Sensitive Words</p>
                <p className="text-xs text-muted-foreground">
                  Example: <span className="font-mono bg-muted px-1 rounded">kill</span> → <span className="font-mono bg-muted px-1 rounded">k*ll</span>
                </p>
              </div>
            </div>
            <Switch checked={censorWords} onCheckedChange={onCensorWordsChange} />
          </div>
          {censorWords && (
            <div className="mt-3 pt-3 border-t">
              <div className="flex flex-col gap-2">
                <ScrollArea className="max-h-[150px]">
                  {sensitiveWords.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-4 text-center">
                      No words selected to censor.
                    </div>
                  ) : (
                    sensitiveWords.map((word: string, index: number) => (
                      <div key={index} className="flex items-center m-1 mb-2 mr-3">
                        <Input
                          value={word}
                          type="string"
                          placeholder="Enter word"
                          onChange={(e) => {
                            const newWords = [...sensitiveWords];
                            newWords[index] = e.target.value;
                            onSensitiveWordsChange(newWords);
                          }}
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          className="ml-2"
                          onClick={() => {
                            const newWords = sensitiveWords.filter((_, i) => i !== index);
                            onSensitiveWordsChange(newWords);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </ScrollArea>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mx-1 w-full"
                  onClick={() => onSensitiveWordsChange([...sensitiveWords, ""])}
                >
                  Add Word
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
