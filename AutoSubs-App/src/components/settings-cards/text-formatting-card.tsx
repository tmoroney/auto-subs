import { AArrowUp, Signature, ShieldX, WholeWord, CircleX } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useState } from "react";
import { Pencil } from "lucide-react"

interface TextFormattingCardProps {
  maxWordsPerLine: number
  maxCharsPerLine: number
  maxLinesPerSubtitle: number
  textCase: "none" | "uppercase" | "lowercase"
  removePunctuation: boolean
  splitOnPunctuation: boolean
  enableCensor: boolean
  censoredWords: string[]
  onMaxWordsPerLineChange: (value: number) => void
  onMaxCharsPerLineChange: (value: number) => void
  onMaxLinesPerSubtitleChange: (value: number) => void
  onTextCaseChange: (textCase: "none" | "uppercase" | "lowercase") => void
  onRemovePunctuationChange: (checked: boolean) => void
  onSplitOnPunctuationChange: (checked: boolean) => void
  onEnableCensorChange: (checked: boolean) => void
  onCensoredWordsChange: (words: string[]) => void
}

export const TextFormattingCard = ({
  maxWordsPerLine,
  maxCharsPerLine,
  maxLinesPerSubtitle,
  textCase,
  removePunctuation,
  splitOnPunctuation,
  enableCensor,
  censoredWords,
  onMaxWordsPerLineChange,
  onMaxCharsPerLineChange,
  onMaxLinesPerSubtitleChange,
  onTextCaseChange,
  onRemovePunctuationChange,
  onSplitOnPunctuationChange,
  onEnableCensorChange,
  onCensoredWordsChange,
}: TextFormattingCardProps) => {
  const [newCensoredWord, setNewCensoredWord] = useState("");
  return (
    <div className="space-y-4">
      {/* Formatting Controls Popover */}
      <div className="border rounded-lg overflow-hidden">
        <div className="p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
                <WholeWord className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Subtitle Line Rules</p>
                <p className="text-xs text-muted-foreground">
                  {`${maxLinesPerSubtitle} line${maxLinesPerSubtitle !== 1 ? 's' : ''}`}
                  {maxWordsPerLine === 0 ? '' : ` • ${maxWordsPerLine} word${maxWordsPerLine !== 1 ? 's' : ''}`}
                  {maxCharsPerLine === 0 ? '' : ` • ${maxCharsPerLine} char${maxCharsPerLine !== 1 ? 's' : ''}`}
                  {splitOnPunctuation ? ' • split on punctuation' : ''}
                </p>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="center">
                <div className="space-y-4">
                  {/* Max Chars */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Character Count</p>
                      {maxCharsPerLine === 0 ? (
                        <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                          <CircleX className="w-3 h-3 inline-block" /> Disabled (no character limit)
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Max characters per line</p>
                      )}
                    </div>
                    <Input
                      type="number"
                      min="0"
                      value={maxCharsPerLine}
                      onChange={(e) => onMaxCharsPerLineChange(Number(e.target.value))}
                      className="w-20"
                    />
                  </div>

                  {/* Max Words */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Word Count</p>
                      {maxWordsPerLine === 0 ? (
                        <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                          <CircleX className="w-3 h-3 inline-block" /> Disabled (no word limit)
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Max words per line</p>
                      )}
                    </div>
                    <Input
                      type="number"
                      min="0"
                      value={maxWordsPerLine}
                      onChange={(e) => onMaxWordsPerLineChange(Number(e.target.value))}
                      className="w-20"
                    />
                  </div>

                  {/* Line Count */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Line Count</p>
                      <p className="text-xs text-muted-foreground">Max lines shown per subtitle</p>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      value={maxLinesPerSubtitle}
                      onChange={(e) => onMaxLinesPerSubtitleChange(Number(e.target.value))}
                      className="w-20"
                    />
                  </div>

                  {/* Split on Punctuation */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Split on Punctuation</p>
                      <p className="text-xs text-muted-foreground">Natural line breaks at punctuation</p>
                    </div>
                    <Switch
                      checked={splitOnPunctuation}
                      onCheckedChange={onSplitOnPunctuationChange}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

        </div>
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
            <div className="mt-3 pt-2 border-t">
              <div className="flex flex-col gap-3">
                {/* Add new censored word input */}
                <form
                  className="flex gap-2 items-center mt-1"
                  onSubmit={e => {
                    e.preventDefault();
                    if (!newCensoredWord.trim() || censoredWords.includes(newCensoredWord.trim())) return;
                    onCensoredWordsChange([...censoredWords, newCensoredWord.trim()]);
                    setNewCensoredWord("");
                  }}
                >
                  <Input
                    value={newCensoredWord}
                    onChange={e => setNewCensoredWord(e.target.value)}
                    placeholder="Add word to censor"
                    className="w-full"
                  />
                  <Button
                    type="submit"
                    size="default"
                    disabled={!newCensoredWord.trim() || censoredWords.includes(newCensoredWord.trim())}
                  >
                    Add
                  </Button>
                </form>
                <ScrollArea className="max-h-[150px]">
                  {censoredWords.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-4 text-center">
                      No words selected to censor.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {censoredWords.map((word: string, index: number) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="flex items-center px-2 py-1 text-xs font-normal gap-1"
                        >
                          <span>{word}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${word}`}
                            className="ml-1 focus:outline-none hover:text-destructive"
                            onClick={() => {
                              const newWords = censoredWords.filter((_, i) => i !== index);
                              onCensoredWordsChange(newWords);
                            }}
                          >
                            <span className="text-lg leading-none">×</span>
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
