
import { useState } from "react"
import {
  ArrowUpFromLine,
  Blend,
  Highlighter,
  Keyboard,
  PaintRoller,
  Text,
  PencilOff,
  TypeOutline,
  WholeWord,
  ZoomIn,
  MessageSquare,
  MessageCircle,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { ColorPicker } from "@/components/color-picker"

const highlightTypes = [
  { value: "none", label: "None", description: "No highlighting.", icon: PencilOff },
  { value: "outline", label: "Outline", description: "Adds a word outline.", icon: TypeOutline },
  { value: "fill", label: "Fill", description: "Fills words with color.", icon: PaintRoller },
  { value: "bubble", label: "Bubble", description: "Adds a rounded box.", icon: MessageCircle },
] as const

const animationTypes = [
  { value: "none", label: "None", description: "No Animation", icon: PencilOff },
  { value: "pop-in", label: "Pop In", description: "Subtitle will bounce in", icon: ZoomIn },
  { value: "fade-in", label: "Fade In", description: "Subtitle will fade in gradually", icon: Blend },
  {
    value: "slide-in",
    label: "Slide Up",
    icon: ArrowUpFromLine,
    description: "Subtitle will slide in from the bottom",
  },
  { value: "typewriter", label: "Typewriter", icon: Keyboard, description: "Subtitle will appear as if being typed" },
] as const

type AnimationType = (typeof animationTypes)[number]["value"]
type HighlightType = (typeof highlightTypes)[number]["value"]

export function AnimatePage() {
  const [animationType, setAnimationType] = useState<AnimationType>("none")
  const [wordLevel, setWordLevel] = useState(false)
  const [highlightType, setHighlightType] = useState<HighlightType>("none")
  const [fontColor, setFontColor] = useState("#000000")

  const renderToggleGroup = (
    items: typeof animationTypes | typeof highlightTypes,
    value: string,
    onValueChange: (value: string) => void,
  ) => (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(newValue) => {
        onValueChange(newValue || "none")
      }}
      className="flex flex-wrap gap-2.5"
    >
      {items.map((m) => (
        <ToggleGroupItem
          key={m.value}
          value={m.value}
          className="flex items-center justify-center flex-grow basis-[calc(50%-0.5rem)] sm:basis-[calc(33.333%-0.5rem)] md:basis-auto p-6 h-12 hover:text-accent-foreground rounded-md border-2 border-accent data-[state=on]:border-primary"
          aria-label={m.label}
        >
          <m.icon className="size-5 flex-shrink-0 text-foreground" />
          <span className="text-sm">{m.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )

  return (
    <main className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2 lg:grid-cols-2">
      <div className="relative flex-col items-start gap-4 md:flex">
        <div className="grid w-full items-start gap-4">
          <Card>
            <CardHeader className="pb-5">
              <CardTitle>Animation</CardTitle>
              <CardDescription>Customise the animation for your subtitles.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3">
                <Select value={wordLevel.toString()} onValueChange={(value) => setWordLevel(value === "true")}>
                  <SelectTrigger
                    id="wordLevel"
                    className="[&_[data-description]]:hidden h-11"
                  >
                    <SelectValue placeholder="Select animation type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <Text className="size-5 flex-shrink-0 text-foreground" />
                        <div className="grid gap-0.5 text-left">
                          <p className="font-medium text-foreground">
                            Segment Level
                          </p>
                          <p className="text-xs" data-description>
                            Animate the entire subtitle at once
                          </p>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="true">
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <WholeWord className="size-5 flex-shrink-0 text-foreground" />
                        <div className="grid gap-0.5 text-left">
                          <p className="font-medium text-foreground">Word Level</p>
                          <p className="text-xs" data-description>Animate each word individually</p>
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3">
                {renderToggleGroup(animationTypes, animationType, setAnimationType as (value: string) => void)}
              </div>

            </CardContent>
          </Card>
        </div>
      </div>
      <div className="relative flex-col items-start gap-8 md:flex">
        <Card className="w-full">
          <CardHeader className="pb-5">
            <CardTitle>Word Highlighting</CardTitle>
            <CardDescription>Highlight words as they are spoken.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3">
              {renderToggleGroup(highlightTypes, highlightType, setHighlightType as (value: string) => void)}
            </div>
            <div className="grid gap-3">
              <Card className="shadow-none">
                <CardContent className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <Highlighter className="h-5 w-5 ml-2" />
                    <Label htmlFor="fontColor" className="font-medium">Highlight Colour</Label>
                    <Input
                      id="fontColor"
                      type="color"
                      value={fontColor}
                      onChange={(e) => setFontColor(e.target.value)}
                      className="w-14 h-12 transition-all hover:bg-muted rounded-md ml-auto cursor-pointer py-1 px-2"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

