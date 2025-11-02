import * as React from "react"
import { Upload, Mic, Brain, Settings, Languages, Users, Type, Play, Pause, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { useGlobal } from "@/contexts/GlobalContext"
import { models } from "@/lib/models"

interface BottomBarTranscriptionProps {
  isTranscribing: boolean
  onTranscribe: () => void
  onCancel: () => void
}

export const BottomBarTranscription = ({
  isTranscribing,
  onTranscribe,
  onCancel
}: BottomBarTranscriptionProps) => {
  const { settings, modelsState, updateSetting, fileInput, validateTranscriptionInput } = useGlobal()

  const handleTranscribe = () => {
    if (validateTranscriptionInput()) {
      onTranscribe()
    }
  }

  const currentModel = modelsState[settings.model]
  const isStandaloneMode = settings.isStandaloneMode

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
      <div className="container max-w-4xl mx-auto p-4">
        {/* Main Input Area */}
        <div className="mb-3">
          {isStandaloneMode ? (
            /* File Drop Zone */
            <div className="relative rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors cursor-pointer">
              <div className="flex items-center justify-center gap-3 p-6">
                {fileInput ? (
                  <div className="flex items-center gap-3 w-full">
                    <div className="flex-1">
                      <p className="text-sm font-medium truncate">
                        {fileInput.split('/').pop() || fileInput}
                      </p>
                      <p className="text-xs text-muted-foreground">Click to change file</p>
                    </div>
                    <Button variant="ghost" size="sm">
                      Change
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Drop audio file here or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supports MP3, WAV, M4A, and video files
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* DaVinci Resolve Mode */
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center gap-3">
                <Mic className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {settings.selectedInputTracks.length > 0 
                      ? `Track ${settings.selectedInputTracks.join(', ')}`
                      : 'No tracks selected'
                    }
                  </p>
                  <p className="text-xs text-muted-foreground">Select audio tracks from timeline</p>
                </div>
                <Button variant="ghost" size="sm">Change</Button>
              </div>
            </div>
          )}
        </div>

        {/* Main Options Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Language */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Languages className="h-4 w-4" />
                <span>{settings.language === 'auto' ? 'Auto-detect' : 'English'}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Language Settings</h4>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs font-medium">Input Language</Label>
                    <Select value={settings.language} onValueChange={(value) => updateSetting("language", value)}>
                      <SelectTrigger className="w-full mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto-detect</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                        <SelectItem value="it">Italian</SelectItem>
                        <SelectItem value="pt">Portuguese</SelectItem>
                        <SelectItem value="ru">Russian</SelectItem>
                        <SelectItem value="ja">Japanese</SelectItem>
                        <SelectItem value="ko">Korean</SelectItem>
                        <SelectItem value="zh">Chinese</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-medium">Translate Output</Label>
                      <p className="text-xs text-muted-foreground">
                        {settings.translate ? `To ${settings.targetLanguage === 'en' ? 'English' : 'Target'}` : 'Off'}
                      </p>
                    </div>
                    <Switch
                      checked={settings.translate}
                      onCheckedChange={(checked) => updateSetting("translate", checked)}
                    />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Speaker Diarization */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Users className="h-4 w-4" />
                <span>Speakers</span>
                <Badge variant={settings.enableDiarize ? "default" : "secondary"} className="ml-1 text-xs">
                  {settings.enableDiarize ? 'On' : 'Off'}
                </Badge>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Speaker Labeling</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-medium">Enable Speaker Detection</Label>
                      <p className="text-xs text-muted-foreground">Identify different speakers</p>
                    </div>
                    <Switch
                      checked={settings.enableDiarize}
                      onCheckedChange={(checked) => updateSetting("enableDiarize", checked)}
                    />
                  </div>
                  
                  {settings.enableDiarize && (
                    <div>
                      <Label className="text-xs font-medium">Max Speakers</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Slider
                          value={[settings.maxSpeakers || 10]}
                          onValueChange={([value]) => updateSetting("maxSpeakers", value)}
                          max={20}
                          min={2}
                          step={1}
                          className="flex-1"
                        />
                        <span className="text-sm w-8 text-right">
                          {settings.maxSpeakers || 'Auto'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Text Formatting */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Type className="h-4 w-4" />
                <span>Formatting</span>
                {settings.maxCharsPerLine > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {settings.maxCharsPerLine}c
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Text Formatting</h4>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs font-medium">Character Limit</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={settings.maxCharsPerLine}
                        onChange={(e) => updateSetting("maxCharsPerLine", Number(e.target.value))}
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">per line (0 = unlimited)</span>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-xs font-medium">Line Count</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        min="1"
                        max="4"
                        value={settings.maxLinesPerSubtitle}
                        onChange={(e) => updateSetting("maxLinesPerSubtitle", Number(e.target.value))}
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">max lines</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-medium">Split on Punctuation</Label>
                      <p className="text-xs text-muted-foreground">Natural line breaks</p>
                    </div>
                    <Switch
                      checked={settings.splitOnPunctuation}
                      onCheckedChange={(checked) => updateSetting("splitOnPunctuation", checked)}
                    />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Bottom Row - Model, Advanced Settings, Generate */}
        <div className="flex items-center gap-2 flex-wrap border-t pt-3 mt-3">
          {/* Model Selection */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Brain className="h-4 w-4" />
                <span>{currentModel.label}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">AI Model</h4>
                <div className="space-y-1">
                  {modelsState.map((model, index) => (
                    <Button
                      key={model.value}
                      variant={settings.model === index ? "secondary" : "ghost"}
                      className="w-full justify-start"
                      size="sm"
                      onClick={() => updateSetting("model", index)}
                    >
                      <span className="flex-1 text-left">{model.label}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {model.size}
                        </Badge>
                        {model.isDownloaded && (
                          <Badge variant="secondary" className="text-xs">
                            ✓
                          </Badge>
                        )}
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Advanced Settings */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Advanced Settings</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-medium">GPU Acceleration</Label>
                      <p className="text-xs text-muted-foreground">Use GPU for faster processing</p>
                    </div>
                    <Switch
                      checked={settings.enableGpu}
                      onCheckedChange={(checked) => updateSetting("enableGpu", checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-medium">DTW Alignment</Label>
                      <p className="text-xs text-muted-foreground">Better word timestamps</p>
                    </div>
                    <Switch
                      checked={settings.enableDTW}
                      onCheckedChange={(checked) => updateSetting("enableDTW", checked)}
                    />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Action Button */}
          {isTranscribing ? (
            <Button variant="destructive" size="sm" onClick={onCancel} className="gap-2">
              <Pause className="h-4 w-4" />
              <span>Cancel</span>
            </Button>
          ) : (
            <Button size="sm" onClick={handleTranscribe} className="gap-2" disabled={!validateTranscriptionInput()}>
              <Play className="h-4 w-4" />
              <span>Generate</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
