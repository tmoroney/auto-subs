import { useState } from "react";
import { Blend, CircleFadingPlusIcon, Highlighter, Minus, PencilOff, WholeWord, ZoomIn } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

export function AnimatePage() {
  const [animation, setAnimation] = useState("pop-in");
  const [wordLevel, setWordLevel] = useState(false);
  const [highlightWord, setHightlightWord] = useState(false);
  const [fontColor, setFontColor] = useState("#ffffff");

  return (
    <main className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2 lg:grid-cols-2">
      <div className="relative flex-col items-start gap-8 md:flex">
        <div className="grid w-full items-start gap-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Animation Options</CardTitle>
              <CardDescription>Customise the animation for your subtitles.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3">
                <Label htmlFor="textFormat">Animation Type</Label>
                <ToggleGroup
                  type="single"
                  value={animation}
                  onValueChange={(value: string) => value && setAnimation(value)}
                  className="grid grid-cols-3 gap-3 h-20"
                >
                  <ToggleGroupItem
                    value="none"
                    className={`h-full flex flex-col items-center justify-center border-2 bg-transparent hover:text-accent-foreground data-[state=on]:border-primary data-[state=on]:bg-card`}
                  >
                    <Minus />
                    <span className="text-xs">None</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="pop-in"
                    className={`h-full flex flex-col items-center justify-center border-2 bg-transparent hover:text-accent-foreground data-[state=on]:border-primary data-[state=on]:bg-card`}
                  >
                    <ZoomIn />
                    <span className="text-xs">Pop-In</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="fade-in"
                    className={`h-full flex flex-col items-center justify-center border-2 bg-transparent hover:text-accent-foreground data-[state=on]:border-primary data-[state=on]:bg-card`}
                  >
                    <Blend />
                    <span className="text-xs">Fade-In</span>
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="flex items-center space-x-4 rounded-md border p-4">
                <WholeWord className="w-5" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">
                    Word Level Subtitles
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Show words when spoken
                  </p>
                </div>
                <Switch checked={wordLevel} onCheckedChange={(checked) => setWordLevel(checked)} />
              </div>
              <div className="flex items-center space-x-4 rounded-md border p-4">
                <Highlighter className="w-5" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">
                    Highlight Word
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Highlight when spoken
                  </p>
                </div>
                <Switch checked={highlightWord} onCheckedChange={(checked) => setHightlightWord(checked)} />
              </div>

            </CardContent>
          </Card>
        </div>
      </div>
      <div className="relative flex-col items-start gap-8 md:flex">
        <Card className="w-full">
          <CardHeader className="pb-4">
            <CardTitle>Customise Template</CardTitle>
            <CardDescription>Customise the look of your subtitles.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
          <div>
              <Label htmlFor="font-color">Font Color</Label>
              <Input
                id="font-color"
                type="color"
                value={fontColor}
                onChange={(e) => setFontColor(e.target.value)}
              />
            </div>
          </CardContent>

        </Card>
      </div>
    </main>
  );
}