import {
    Bird,
    CornerDownLeft,
    Mic,
    Paperclip,
    Rabbit,
    Turtle,
    CirclePlay,
    Rat
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
    Tooltip,
    TooltipProvider,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"

export function ChatPage() {
    return (
        <main className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2 lg:grid-cols-3 h-full">
            <div
                className="relative hidden flex-col items-start gap-8 md:flex" x-chunk="dashboard-03-chunk-0"
            >
                <form className="grid w-full items-start gap-6">
                    <fieldset className="grid gap-6 rounded-lg border p-4 h-full">
                        <legend className="-ml-1 px-1 text-sm font-medium">
                            Generate
                        </legend>

                        <div className="grid gap-3">
                            <Label htmlFor="model">Model</Label>
                            <Select defaultValue="small">
                                <SelectTrigger
                                    id="model"
                                    className="items-start [&_[data-description]]:hidden"
                                >
                                    <SelectValue placeholder="Select a model..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="base">
                                        <div className="flex items-start gap-3 text-muted-foreground">
                                            <Rat className="size-5" />
                                            <div className="grid gap-0.5">
                                                <p>
                                                    Quantised{" "}
                                                    <span className="font-medium text-foreground">
                                                        Base
                                                    </span>
                                                </p>
                                                <p className="text-xs" data-description>
                                                    Fastest model for general use cases.
                                                </p>
                                            </div>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="small">
                                        <div className="flex items-start gap-3 text-muted-foreground">
                                            <Rabbit className="size-5" />
                                            <div className="grid gap-0.5">
                                                <p>
                                                    Distilled{" "}
                                                    <span className="font-medium text-foreground">
                                                        Small
                                                    </span>
                                                </p>
                                                <p className="text-xs" data-description>
                                                    Good balance of speed and accuracy.
                                                </p>
                                            </div>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="medium">
                                        <div className="flex items-start gap-3 text-muted-foreground">
                                            <Bird className="size-5" />
                                            <div className="grid gap-0.5">
                                                <p>
                                                    Distilled{" "}
                                                    <span className="font-medium text-foreground">
                                                        Medium
                                                    </span>
                                                </p>
                                                <p className="text-xs" data-description>
                                                    Great accuracy and moderate speed.
                                                </p>
                                            </div>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="large">
                                        <div className="flex items-start gap-3 text-muted-foreground">
                                            <Turtle className="size-5" />
                                            <div className="grid gap-0.5">
                                                <p>
                                                    Distilled{" "}
                                                    <span className="font-medium text-foreground">
                                                        Large-V3
                                                    </span>
                                                </p>
                                                <p className="text-xs" data-description>
                                                    Most accurate / slowest (best for non-english).
                                                </p>
                                            </div>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-3">
                            <Label htmlFor="template">Output Track</Label>
                            <Select>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a timeline track" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectLabel>Tracks available</SelectLabel>
                                        <SelectItem value="apple">Apple</SelectItem>
                                        <SelectItem value="banana">Banana</SelectItem>
                                        <SelectItem value="blueberry">Blueberry</SelectItem>
                                        <SelectItem value="grapes">Grapes</SelectItem>
                                        <SelectItem value="pineapple">Pineapple</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            className="gap-1.5 text-sm"
                        >
                            <CirclePlay className="size-4" />
                            Generate
                        </Button>
                    </fieldset>
                </form>
            </div>
            <div className="relative flex min-h-[50vh] flex-col rounded-xl bg-muted/50 p-4 lg:col-span-2">
                <Badge variant="outline" className="absolute right-3 top-3">
                    Output
                </Badge>
                <div className="flex-1" />
                <form
                    className="relative overflow-hidden rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring" x-chunk="dashboard-03-chunk-1"
                >
                    <Label htmlFor="message" className="sr-only">
                        Message
                    </Label>
                    <Textarea
                        id="message"
                        placeholder="Type your message here..."
                        className="min-h-12 resize-none border-0 p-3 shadow-none focus-visible:ring-0"
                    />
                    <div className="flex items-center p-3 pt-0">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                        <Paperclip className="size-4" />
                                        <span className="sr-only">Attach file</span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">Attach File</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                        <Mic className="size-4" />
                                        <span className="sr-only">Use Microphone</span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">Use Microphone</TooltipContent>
                            </Tooltip>
                            <Button type="submit" size="sm" className="ml-auto gap-1.5">
                                Send Message
                                <CornerDownLeft className="size-3.5" />
                            </Button>
                        </TooltipProvider>
                    </div>
                </form>
            </div>
        </main>
    )
}