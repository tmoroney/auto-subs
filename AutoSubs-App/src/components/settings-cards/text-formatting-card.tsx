import { AArrowUp, Signature, ShieldX, Trash2, WholeWord, WrapText } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface TextFormattingCardProps {
  maxWordsPerLine: number
  maxLinesPerSubtitle: number
  textCase: "none" | "uppercase" | "lowercase"
  removePunctuation: boolean
  enableCensor: boolean
  censoredWords: string[]
  onMaxWordsPerLineChange: (value: number) => void
  onMaxLinesPerSubtitleChange: (value: number) => void
  onTextCaseChange: (textCase: "none" | "uppercase" | "lowercase") => void
  onRemovePunctuationChange: (checked: boolean) => void
  onEnableCensorChange: (checked: boolean) => void
  onCensoredWordsChange: (words: string[]) => void
}

export const TextFormattingCard = ({
  maxWordsPerLine,
  maxLinesPerSubtitle,
  textCase,
  removePunctuation,
  enableCensor,
  censoredWords,
  onMaxWordsPerLineChange,
  onMaxLinesPerSubtitleChange,
  onTextCaseChange,
  onRemovePunctuationChange,
  onEnableCensorChange,
  onCensoredWordsChange,
}: TextFormattingCardProps) => {
  return (
    <div className="space-y-4">
      {/* Max Words */}
      <div className="flex items-center justify-between p-3.5 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
            <WholeWord className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <p className="text-sm font-medium">Word Count</p>
            <p className="text-xs text-muted-foreground">Max words per line</p>
          </div>
        </div>
        <Input
          type="number"
          min="1"
          value={maxWordsPerLine}
          onChange={(e) => onMaxWordsPerLineChange(Number(e.target.value))}
          className="w-20"
        />
      </div>

      {/* Number of lines */}
      <div className="flex items-center justify-between p-3.5 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
            <WrapText className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <p className="text-sm font-medium">Line Count</p>
            <p className="text-xs text-muted-foreground">Max lines shown per subtitle</p>
          </div>
        </div>
        <Input
          type="number"
          min="1"
          value={maxLinesPerSubtitle}
          onChange={(e) => onMaxLinesPerSubtitleChange(Number(e.target.value))}
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
                <p className="text-xs text-muted-foreground">Modify subtitle text case</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="default"
                    className={cn(
                      "px-3",
                      textCase === "lowercase" && "bg-cyan-50 border-cyan-200 dark:bg-cyan-900/30 dark:border-cyan-800 hover:bg-cyan-100 dark:hover:bg-cyan-900/40"
                    )}
                    onClick={() => {
                      const newFormat = textCase === "lowercase" ? "none" : "lowercase";
                      onTextCaseChange(newFormat);
                    }}
                  >
                    abc
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  Lowercase All Text
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="default"
                    className={cn(
                      "px-3",
                      textCase === "uppercase" && "bg-cyan-50 border-cyan-200 dark:bg-cyan-900/30 dark:border-cyan-800 hover:bg-cyan-100 dark:hover:bg-cyan-900/40"
                    )}
                    onClick={() => {
                      const newFormat = textCase === "uppercase" ? "none" : "uppercase";
                      onTextCaseChange(newFormat);
                    }}
                  >
                    ABC
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  Uppercase All Text
                </TooltipContent>
              </Tooltip>
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
            <Switch checked={enableCensor} onCheckedChange={onEnableCensorChange} />
          </div>
          {enableCensor && (
            <div className="mt-3 pt-3 border-t">
              <div className="flex flex-col gap-2">
                <ScrollArea className="max-h-[150px]">
                  {censoredWords.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-4 text-center">
                      No words selected to censor.
                    </div>
                  ) : (
                    censoredWords.map((word: string, index: number) => (
                      <div key={index} className="flex items-center m-1 mb-2 mr-3">
                        <Input
                          value={word}
                          type="string"
                          placeholder="Enter word"
                          onChange={(e) => {
                            const newWords = [...censoredWords];
                            newWords[index] = e.target.value;
                            onCensoredWordsChange(newWords);
                          }}
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          className="ml-2"
                          onClick={() => {
                            const newWords = censoredWords.filter((_, i) => i !== index);
                            onCensoredWordsChange(newWords);
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
                  onClick={() => onCensoredWordsChange([...censoredWords, ""])}
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
