import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Scissors, Repeat, CaseLower, CaseUpper, MessageCircleX, Speaker, AudioWaveform, WandSparkles, Regex, Repeat2 } from "lucide-react";

const tools = [
    {
        icon: WandSparkles, // Silence Deletion Icon
        title: "Silence Deletion",
        description: "Remove silent sections from your timeline.",
        optionsComponent: () => <div>Options for Silence Deletion</div>,
    },
    {
        icon: AudioWaveform,
        title: "Text to Speech",
        description: "Create lifelike voices from text using AI.",
        optionsComponent: () => <div>Options for Text to Speech</div>,
    },
    {
        icon: Regex, // Remove Characters Icon
        title: "Remove Characters",
        description: "Remove specific characters from subtitles.",
        optionsComponent: () => (
            <div>
                <Textarea placeholder="Enter characters to remove" />
                <Button className="mt-2">Apply</Button>
            </div>
        ),
    },
    {
        icon: Repeat2, // Remove Repetition Icon
        title: "Remove Repetition",
        description: "Remove repeated words from subtitles.",
        optionsComponent: () => <div>Options for Removing Repetition</div>,
    },
    {
        icon: MessageCircleX, // Censor Swear Words Icon
        title: "Censor Swear Words",
        description: "Replace swear words with asterisks.",
        optionsComponent: () => <div>Options for Censoring Swear Words</div>,
    },
    {
        icon: CaseLower, // Lowercase Icon
        title: "Lowercase Subtitles",
        description: "Convert all subtitles to lowercase.",
        optionsComponent: () => <div>Confirm applying lowercase</div>,
    },
    {
        icon: CaseUpper, // Uppercase Icon
        title: "Uppercase Subtitles",
        description: "Convert all subtitles to uppercase.",
        optionsComponent: () => <div>Confirm applying Uppercase</div>,
    },
];

export function ToolsPage() {
    const [activeTool, setActiveTool] = useState<null | typeof tools[0]>(null);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 p-4">
            {tools.map((tool, index) => (
                <Card
                    key={index}
                    className="flex flex-col h-full cursor-pointer transition-all duration-300 hover:shadow-md hover:border-primary"
                    onClick={() => setActiveTool(tool)}
                >
                    <CardContent className="p-5 grid gap-0.5 pb-2.5">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center space-x-2">
                                <div className="p-2 rounded-full">
                                    <tool.icon className="h-8 w-8 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg">{tool.title}</h3>
                                    <p className="text-sm text-muted-foreground">{tool.description}</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}


            {activeTool && (
                <Dialog open={!!activeTool} onOpenChange={() => setActiveTool(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{activeTool.title}</DialogTitle>
                        </DialogHeader>
                        <div>{activeTool.optionsComponent()}</div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
};

export default ToolsPage;
