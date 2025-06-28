import * as React from "react"
import {
    Languages,
    Users,
    Download,
    HelpCircle,
    Heart,
    Github,
    Type,
    Trash2,
    AlertTriangle,
    X,
    MessageSquare,
    HardDrive,
    MemoryStick,
    Info,
    Globe,
    RefreshCcw,
    ChevronDown as ChevronDownIcon,
    Speech,
    Hash,
    Signature,
    ALargeSmall,
    AArrowUp,
    ShieldX,
} from "lucide-react"

import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
} from "@/components/ui/tooltip"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { CarouselContent, CarouselItem } from "@/components/carousel"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

// Custom carousel controls with className support
const CarouselButton = ({ onClick, className, children }: { onClick: () => void; className?: string; children: React.ReactNode }) => (
    <button
        onClick={onClick}
        className={`absolute top-1/2 -translate-y-1/2 z-20 flex items-center justify-center ${className || ''}`}
        aria-label={children === 'Previous' ? 'Previous slide' : 'Next slide'}
    >
        {children}
    </button>
);

const CarouselPrevious = (props: { onClick: () => void; className?: string }) => (
    <CarouselButton {...props}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
        </svg>
    </CarouselButton>
);

const CarouselNext = (props: { onClick: () => void; className?: string }) => (
    <CarouselButton {...props}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
        </svg>
    </CarouselButton>
);
import { useIsMobile } from "@/hooks/use-mobile"
import { MobileCaptionViewer } from "@/components/mobile-caption-viewer"
import { PopoverTrigger } from "@radix-ui/react-popover"
import { Popover, PopoverContent } from "./ui/popover"

const models = [
    {
        value: "tiny",
        label: "Tiny",
        description: "Fastest",
        size: "75MB",
        ram: "~1GB",
        image: "/hummingbird.png",
        details: "Smallest and fastest model. Great for quick drafts or low-resource devices. Lower accuracy on tough audio.",
        isDownloaded: true,
    },
    {
        value: "base",
        label: "Base",
        description: "General use",
        size: "140MB",
        ram: "~1GB",
        image: "/sparrow.png",
        details: "Balanced for most standard tasks. Good speed and accuracy for everyday transcription.",
        isDownloaded: true,
    },
    {
        value: "small",
        label: "Small",
        description: "Balanced",
        size: "480MB",
        ram: "~2GB",
        image: "/fox.png",
        details: "Better accuracy than Tiny/Base. Still fast. Good for varied accents and conditions.",
        isDownloaded: false,
    },
    {
        value: "medium",
        label: "Medium",
        description: "Accurate",
        size: "1.5GB",
        ram: "~5GB",
        image: "/wolf.png",
        details: "High accuracy, handles difficult audio. Slower and uses more memory.",
        isDownloaded: false,
    },
    {
        value: "large",
        label: "Large",
        description: "Max accuracy",
        size: "3.1GB",
        ram: "~10GB",
        image: "/elephant.png",
        details: "Most accurate, best for complex audio or many speakers. Requires lots of RAM and a strong GPU.",
        isDownloaded: false,
    },
]

interface TranscriptionSettingsProps {
    isStandaloneMode: boolean
}

export function TranscriptionSettings({ isStandaloneMode }: TranscriptionSettingsProps) {
    const [selectedModel, setSelectedModel] = React.useState(models[1])
    const [downloadingModel, setDownloadingModel] = React.useState<string | null>(null)
    const [downloadProgress, setDownloadProgress] = React.useState(0)
    const [isUpdateDismissed, setIsUpdateDismissed] = React.useState(false)
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
    const [isTranscribing, setIsTranscribing] = React.useState(false)
    const [transcriptionProgress, setTranscriptionProgress] = React.useState(0)
    const [modelsState, setModelsState] = React.useState(models)
    const [showMobileCaptions, setShowMobileCaptions] = React.useState(false)
    const isMobile = useIsMobile()

    const carouselContentRef = React.useRef<HTMLDivElement>(null)
    const [canScrollPrev, setCanScrollPrev] = React.useState(false)
    const [canScrollNext, setCanScrollNext] = React.useState(true)

    const [settings, setSettings] = React.useState({
        diarize: true,
        translate: false,
        numSpeakers: "3",
        sourceLanguage: "en",
        maxWordsLine: "10",
        removePunctuation: false,
        textFormat: "none" as const,
        censorWords: false,
        sensitiveWords: [] as string[],
    })

    const updateSetting = (key: string, value: any) => {
        setSettings((prev) => ({ ...prev, [key]: value }))
    }

    const handleScroll = (direction: "next" | "prev") => {
        const content = carouselContentRef.current
        if (content) {
            const itemWidth = content.firstElementChild?.clientWidth || 0
            const scrollAmount = direction === "next" ? itemWidth : -itemWidth
            content.scrollBy({ left: scrollAmount, behavior: "smooth" })
        }
    }

    const checkArrows = React.useCallback(() => {
        const content = carouselContentRef.current
        if (content) {
            const { scrollLeft, scrollWidth, clientWidth } = content
            setCanScrollPrev(scrollLeft > 5)
            setCanScrollNext(scrollLeft < scrollWidth - clientWidth - 5)
        }
    }, [])

    const handleDownload = (modelValue: string) => {
        if (downloadingModel) return
        setDownloadingModel(modelValue)
        setDownloadProgress(0)

        const interval = setInterval(() => {
            setDownloadProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(interval)
                    setModelsState((prevModels) =>
                        prevModels.map((m) => (m.value === modelValue ? { ...m, isDownloaded: true } : m)),
                    )
                    if (selectedModel.value === modelValue) {
                        setSelectedModel((prev) => ({ ...prev, isDownloaded: true }))
                    }
                    setDownloadingModel(null)
                    return 100
                }
                return prev + 10
            })
        }, 150)
    }

    const handleDeleteModel = (modelValue: string) => {
        setModelsState((prevModels) => prevModels.map((m) => (m.value === modelValue ? { ...m, isDownloaded: false } : m)))
        if (selectedModel.value === modelValue) {
            setSelectedModel((prev) => ({ ...prev, isDownloaded: false }))
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFile(e.target.files[0])
        }
    }

    const handleStartTranscription = () => {
        setIsTranscribing(true)
        setTranscriptionProgress(0)

        // Simulate transcription progress
        const interval = setInterval(() => {
            setTranscriptionProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval)
                    setTimeout(() => {
                        setIsTranscribing(false)
                        // Keep progress at 100% for a moment before hiding
                        setTimeout(() => setTranscriptionProgress(0), 1000)
                    }, 500)
                    return 100
                }
                return prev + 10 // Increment by 10% each time
            })
        }, 500) // Update progress every 500ms
    }

    React.useEffect(() => {
        const content = carouselContentRef.current
        if (content) {
            const timer = setTimeout(() => checkArrows(), 100)
            content.addEventListener("scroll", checkArrows)
            window.addEventListener("resize", checkArrows)
            return () => {
                clearTimeout(timer)
                if (content) {
                    content.removeEventListener("scroll", checkArrows)
                }
                window.removeEventListener("resize", checkArrows)
            }
        }
    }, [checkArrows])

    return (
        <>
            <div className="flex flex-col sm:h-[calc(100vh-73px)] h-[calc(100vh-60px)] bg-background overflow-y-auto">
                {/* Main Content */}
                <div className="flex-1 p-4 space-y-6">
                    {/* Update Alert */}
                    {!isUpdateDismissed && (
                        <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                            <AlertTriangle className="h-4 w-4 text-green-600" />
                            <AlertDescription className="flex items-center justify-between">
                                <div>
                                    <strong className="text-green-800 dark:text-green-200">Update Available!</strong>
                                    <p className="text-xs text-green-700 dark:text-green-300">
                                        Click the link to get the latest version.
                                    </p>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setIsUpdateDismissed(true)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* File Source / DaVinci Resolve */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                {isStandaloneMode ? "File Source" : "DaVinci Resolve"}
                            </h3>
                            {!isStandaloneMode && <div className="w-2 h-2 bg-green-500 rounded-full" title="Connected" />}
                            <div className="flex-1 h-px bg-border ml-4"></div>
                        </div>
                        <div className="space-y-4">
                            {isStandaloneMode ? (
                                <div>
                                    <Label
                                        htmlFor="file-upload"
                                        className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                                    >
                                        <Download className="h-8 w-8 text-muted-foreground mb-2" />
                                        <p className="text-sm">
                                            <span className="font-semibold">Click to upload</span> or drag and drop
                                        </p>
                                        <p className="text-xs text-muted-foreground">Audio or Video file</p>
                                        <Input
                                            id="file-upload"
                                            type="file"
                                            className="sr-only"
                                            onChange={handleFileChange}
                                            accept="audio/*,video/*"
                                        />
                                    </Label>
                                    {selectedFile && (
                                        <p className="text-xs text-center text-muted-foreground mt-2">Selected: {selectedFile.name}</p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm">Audio Track</Label>
                                        <Select defaultValue="1">
                                            <SelectTrigger className="w-48">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Tracks</SelectItem>
                                                <SelectItem value="1">Track 1</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm">Caption Track</Label>
                                        <Select defaultValue="1">
                                            <SelectTrigger className="w-48">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">Video Track 1</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm">Caption Style</Label>
                                        <Select defaultValue="default">
                                            <SelectTrigger className="w-48">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="default">Default Text+</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Model Selection Carousel */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">Model</h3>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>
                        <div className="relative -mx-4 px-4">
                            {/* Gradient overlays */}
                            {canScrollPrev && (
                                <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-background via-background/80 to-transparent z-10 pointer-events-none" />
                            )}
                            {canScrollNext && (
                                <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-background via-background/80 to-transparent z-10 pointer-events-none" />
                            )}
                            <CarouselContent ref={carouselContentRef} onScroll={checkArrows} className="relative -mx-0.5">
                                {modelsState.map((model) => (
                                    <CarouselItem key={model.value} className="w-44 max-w-[11rem]">
                                        <div className="p-0.5 h-full">
                                            <Card
                                                onClick={() => setSelectedModel(model)}
                                                className={`cursor-pointer h-full flex flex-col justify-between relative ${selectedModel.value === model.value
                                                    ? "ring-2 ring-blue-500 dark:ring-blue-400 bg-blue-50 dark:bg-slate-700/50"
                                                    : "hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-200"
                                                    }`}
                                            >
                                                {model.isDownloaded && downloadingModel !== model.value && (
                                                    <Dialog>
                                                        <DialogTrigger asChild>
                                                            <Button
                                                                onClick={(e) => e.stopPropagation()}
                                                                variant="ghost"
                                                                size="icon"
                                                                className="absolute top-2 right-2 h-6 w-6 text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors z-10"
                                                                title="Delete Model"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </DialogTrigger>
                                                        <DialogContent className="sm:w-[70vw] w-[90vw] p-4 flex flex-col gap-6" onOpenAutoFocus={e => e.preventDefault()}>
                                                            <div className="flex items-center gap-2">
                                                                <AlertTriangle className="h-4 w-4 text-red-500" />
                                                                <span className="font-semibold text-red-700 dark:text-red-400">Are you sure?</span>
                                                            </div>
                                                            <span className="text-sm text-muted-foreground">
                                                                This will delete the <span className="font-bold">{model.label}</span> model from your device. <br /><br /> You will need to download it again if you want to use it in the future.
                                                            </span>
                                                            <div className="flex justify-end gap-2">
                                                                <DialogClose asChild>
                                                                    <Button variant="ghost" size="sm">Cancel</Button>
                                                                </DialogClose>
                                                                <Button
                                                                    variant="destructive"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        handleDeleteModel(model.value)
                                                                    }}
                                                                >
                                                                    Delete
                                                                </Button>
                                                            </div>
                                                        </DialogContent>
                                                    </Dialog>
                                                )}

                                                <CardContent className="flex flex-col items-center text-center p-2 pb-0">
                                                    <img src={model.image} alt={model.label + " icon"} className="w-full h-20 mt-2 mb-0 object-contain" />
                                                    <div className="flex items-center justify-center gap-1">
                                                        <h3 className="text-md font-bold text-slate-900 dark:text-white">{model.label}</h3>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <button type="button" tabIndex={0} className="p-0.5 rounded-full hover:bg-muted focus:outline-none focus:ring-2 focus:ring-blue-400">
                                                                    <Info className="h-4 w-4" />
                                                                </button>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top" align="center" className="w-[250px] p-3">
                                                                <div className="flex flex-col gap-2 min-w-[100px] max-w-xs">
                                                                    <p className="text-xs text-slate-700 dark:text-slate-200 text-left">
                                                                        {model.details}
                                                                    </p>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <span className="inline-flex items-center gap-1 text-xs text-slate-700 dark:text-slate-200">
                                                                            <HardDrive className="h-4 w-4 mr-0.5" />
                                                                            <span className="font-medium">Model Size:</span>
                                                                            <span>{model.size}</span>
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="inline-flex items-center gap-1 text-xs text-slate-700 dark:text-slate-200">
                                                                            <MemoryStick className="h-4 w-4 mr-0.5" />
                                                                            <span className="font-medium">Required RAM:</span>
                                                                            <span>{model.ram}</span>
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </div>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 h-8">{model.description}</p>
                                                </CardContent>

                                                <div className="h-[32px] flex items-center justify-center">
                                                    {downloadingModel === model.value ? (
                                                        <div className="w-full px-2">
                                                            <Progress value={downloadProgress} className="h-2" />
                                                            <p className="text-xs text-center mt-1 text-blue-600 dark:text-blue-400">
                                                                {downloadProgress}%
                                                            </p>
                                                        </div>
                                                    ) : model.isDownloaded ? (
                                                        <div className="w-full text-center py-2 text-xs font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-b-md">
                                                            Downloaded
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handleDownload(model.value)
                                                            }}
                                                            className="w-full text-center py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-900 rounded-b-md transition-colors"
                                                        >
                                                            Download
                                                        </button>
                                                    )}
                                                </div>
                                            </Card>
                                        </div>
                                    </CarouselItem>
                                ))}
                            </CarouselContent>
                            {canScrollPrev && (
                                <CarouselPrevious
                                    onClick={() => handleScroll("prev")}
                                    className="left-2 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm shadow-lg border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                                />
                            )}
                            {canScrollNext && (
                                <CarouselNext
                                    onClick={() => handleScroll("next")}
                                    className="right-2 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm shadow-lg border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                                />
                            )}
                        </div>
                    </div>



                    {/* Processing */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                Processing
                            </h3>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>
                        <div className="space-y-4">
                            <div className="border rounded-lg overflow-hidden">
                                <div className="p-3.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Globe className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                                            <div>
                                                <p className="text-sm font-medium">Input Language</p>
                                                <p className="text-xs text-muted-foreground">Language in audio</p>
                                            </div>
                                        </div>
                                        <Select
                                            value={settings.sourceLanguage}
                                            onValueChange={(value) => updateSetting("sourceLanguage", value)}
                                        >
                                            <SelectTrigger className="w-32 sm:w-44">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="en">English</SelectItem>
                                                <SelectItem value="es">Spanish</SelectItem>
                                                <SelectItem value="fr">French</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {settings.sourceLanguage !== 'en' && (
                                        <div className="mt-3 pt-3 border-t flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <Languages className="h-5 w-5 text-amber-600 dark:text-amber-400 ml-1" />
                                                <div>
                                                    <p className="text-sm font-medium">Translate to English</p>
                                                </div>
                                            </div>
                                            <Switch
                                                checked={settings.translate}
                                                onCheckedChange={(checked) => updateSetting("translate", checked)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="border rounded-lg overflow-hidden">
                            <div className="p-3.5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Speech className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                                        <div>
                                            <p className="text-sm font-medium">Speaker Labeling</p>
                                            <p className="text-xs text-muted-foreground">
                                                Unique captions for each speaker.
                                            </p>
                                        </div>
                                    </div>
                                    <Switch checked={settings.diarize} onCheckedChange={(checked) => updateSetting("diarize", checked)} />
                                </div>
                                {settings.diarize && (
                                    <div className="mt-3 pt-3 border-t">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Label className="text-sm">Auto-detect Speakers</Label>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <button
                                                            type="button"
                                                            tabIndex={0}
                                                            className="rounded-full hover:bg-muted focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                        >
                                                            <Info className="h-4 w-4" />
                                                        </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="bottom" align="center" className="w-[220px] p-3">
                                                        <p className="text-xs text-left text-slate-700 dark:text-slate-200">
                                                            Auto-detecting speakers can be less accurate than specifying the exact number of speakers.
                                                        </p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                            <Switch
                                                checked={parseInt(settings.numSpeakers as string) === 0}
                                                onCheckedChange={(checked) => updateSetting("numSpeakers", checked ? "0" : "2")}
                                            />
                                        </div>
                                        {parseInt(settings.numSpeakers as string) > 0 && (
                                            <div className="flex items-center justify-between mt-2">
                                                <div className="flex items-center gap-3">
                                                    <Label className="text-sm">No. of Speakers</Label>
                                                </div>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    value={settings.numSpeakers}
                                                    onChange={(e) => updateSetting("numSpeakers", e.target.value)}
                                                    className="w-20"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Text Formatting */}
                    <Collapsible defaultOpen className="space-y-4">
                        <div className="flex items-center gap-4">
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 p-0 h-auto group">
                                    <ChevronDownIcon className="h-4 w-4 transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
                                    <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                        Text Formatting
                                    </h3>
                                </Button>
                            </CollapsibleTrigger>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>
                        <CollapsibleContent>
                            <div className="space-y-4">
                                {/* Max Words */}
                                <div className="flex items-center justify-between p-3.5 border rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <Type className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                                        <div>
                                            <p className="text-sm font-medium">Max Words</p>
                                            <p className="text-xs text-muted-foreground">Number of words per line</p>
                                        </div>
                                    </div>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={settings.maxWordsLine}
                                        onChange={(e) => updateSetting("maxWordsLine", e.target.value)}
                                        className="w-20"
                                    />
                                </div>

                                {/* Text Case Dropdown */}
                                <div className="border rounded-lg overflow-hidden">
                                    <div className="p-3.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <AArrowUp className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                                                <div>
                                                    <p className="text-sm font-medium">Text Case</p>
                                                    <p className="text-xs text-muted-foreground">Set all text to specific case</p>
                                                </div>
                                            </div>
                                            <Select
                                                value={settings.textFormat}
                                                onValueChange={(value: 'none' | 'uppercase' | 'lowercase') => {
                                                    updateSetting('textFormat', value);
                                                }}
                                            >
                                                <SelectTrigger className="w-32">
                                                    <SelectValue placeholder="Select text case" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Original</SelectItem>
                                                    <SelectItem value="uppercase">Uppercase</SelectItem>
                                                    <SelectItem value="lowercase">Lowercase</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>

                                {/* Remove Punctuation Toggle */}
                                <div className="flex items-center justify-between p-3.5 border rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <Signature className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                                        <div>
                                            <p className="text-sm font-medium">Remove Punctuation</p>
                                            <p className="text-xs text-muted-foreground">Removes all commas, periods, etc.</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={settings.removePunctuation}
                                        onCheckedChange={(checked) => updateSetting('removePunctuation', checked)}
                                    />
                                </div>

                                {/* Censored Words Card */}
                                <div className="border rounded-lg overflow-hidden">
                                    <div className="p-3.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <ShieldX className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                                                <div>
                                                    <p className="text-sm font-medium">Censored Words</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Censor specific words in the transcription.
                                                    </p>
                                                </div>
                                            </div>
                                            <Switch checked={settings.censorWords} onCheckedChange={(checked) => updateSetting("censorWords", checked)} />
                                        </div>
                                        {settings.censorWords && (
                                            <div className="mt-3 pt-3 border-t">
                                                <div className="flex flex-col gap-2">
                                                    <ScrollArea className="max-h-[150px]">
                                                        {settings.sensitiveWords.map((word: string, index: number) => (
                                                            <div key={index} className="flex items-center m-1 mb-2 mr-3">
                                                                <Input
                                                                    value={word}
                                                                    type="string"
                                                                    placeholder="Enter word"
                                                                    onChange={(e) => {
                                                                        const newWords = [...settings.sensitiveWords];
                                                                        newWords[index] = e.target.value;
                                                                        updateSetting('sensitiveWords', newWords);
                                                                    }}
                                                                />
                                                                <Button
                                                                    variant="destructive"
                                                                    size="sm"
                                                                    className="ml-2"
                                                                    onClick={() => {
                                                                        const newWords = settings.sensitiveWords.filter((_, i) => i !== index);
                                                                        updateSetting('sensitiveWords', newWords);
                                                                    }}
                                                                >
                                                                    <Trash2 className="size-4" />
                                                                </Button>
                                                            </div>
                                                        ))}
                                                    </ScrollArea>
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        className="mx-1 w-full"
                                                        onClick={() => updateSetting('sensitiveWords', [...settings.sensitiveWords, ""])}
                                                    >
                                                        Add Word
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CollapsibleContent>
                    </Collapsible>

                    {/* About & Support */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                About & Support
                            </h3>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>
                        <div className="space-y-4">
                            <Button
                                asChild
                                variant="outline"
                                className="w-full text-pink-500 border-pink-500 hover:bg-pink-50 dark:hover:bg-pink-950/20 transition-colors relative overflow-hidden group"
                            >
                                <a
                                    href="https://buymeacoffee.com/tmoroney"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center w-full h-full"
                                >
                                    <Heart className="h-4 w-4 mr-2 group-hover:fill-pink-500 transition-colors" />
                                    <span>Support AutoSubs</span>

                                    {/* Bursting hearts animation */}
                                    <div className="absolute inset-0 pointer-events-none">
                                        {[
                                            { tx: '-80px', ty: '-80px', s: 1.5, r: '-20deg', d: '0s' },
                                            { tx: '70px', ty: '-90px', s: 1.2, r: '25deg', d: '0.05s' },
                                            { tx: '-30px', ty: '-120px', s: 1.4, r: '5deg', d: '0.1s' },
                                            { tx: '90px', ty: '-70px', s: 1.1, r: '-15deg', d: '0.15s' },
                                            { tx: '0px', ty: '-110px', s: 1.6, r: '0deg', d: '0.2s' },
                                            { tx: '-90px', ty: '-60px', s: 1.2, r: '15deg', d: '0.25s' },
                                            { tx: '60px', ty: '-110px', s: 1.3, r: '-5deg', d: '0.3s' },
                                        ].map((p, i) => (
                                            <Heart
                                                key={i}
                                                className="heart-anim absolute top-1/2 left-1/2 h-3 w-3 text-pink-400 opacity-0"
                                                style={{
                                                    '--tx': p.tx,
                                                    '--ty': p.ty,
                                                    '--s': p.s,
                                                    '--r': p.r,
                                                    animationDelay: p.d,
                                                } as React.CSSProperties}
                                            />
                                        ))}
                                    </div>
                                </a>
                            </Button>
                            <div className="grid grid-cols-2 gap-2">
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="w-full bg-transparent">
                                            <HelpCircle className="h-4 w-4 mr-2" />
                                            Help
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Help & Hints</DialogTitle>
                                            <DialogDescription className="space-y-4 text-sm">
                                                <p>
                                                    <strong>1. Select a Model:</strong> Choose a model from the carousel. Smaller models are
                                                    faster, larger models are more accurate. You must download a model before use.
                                                </p>
                                                <p>
                                                    <strong>2. Configure Settings:</strong> Adjust language, speaker labeling, and translation
                                                    options to fit your needs.
                                                </p>
                                                <p>
                                                    <strong>3. Link to Resolve:</strong> Ensure the app is connected to DaVinci Resolve and select
                                                    the correct audio and caption tracks.
                                                </p>
                                                <p>
                                                    <strong>4. Transcribe & Edit:</strong> Click "Start Transcription". You can edit the text in
                                                    the editor panel as it appears.
                                                </p>
                                            </DialogDescription>
                                        </DialogHeader>
                                    </DialogContent>
                                </Dialog>
                                <Button variant="outline" className="w-full bg-transparent" asChild>
                                    <a href="#" target="_blank" rel="noopener noreferrer">
                                        <Github className="h-4 w-4 mr-2" />
                                        Source
                                    </a>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
                {/* Footer */}
                <div className="sticky bottom-0 p-4 border-t bg-background/95 backdrop-blur-sm z-20 shadow-lg space-y-2">
                    {/* Mobile Caption Viewer Button */}
                    {isMobile && (
                        <Button onClick={() => setShowMobileCaptions(true)} variant="outline" className="w-full" size="lg">
                            <MessageSquare className="h-4 w-4 mr-2" />
                            View Captions
                        </Button>
                    )}

                    {/* Transcription Progress */}
                    {isTranscribing && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Transcription Progress</span>
                                <span>{transcriptionProgress}%</span>
                            </div>
                            <Progress value={transcriptionProgress} className="h-2" />
                        </div>
                    )}

                    {/* Start Transcription Button */}
                    <Button
                        onClick={handleStartTranscription}
                        disabled={!selectedModel.isDownloaded || isTranscribing || downloadingModel !== null}
                        className="w-full"
                        size="lg"
                    >
                        {isTranscribing ? "Processing..." : "Start Transcription"}
                    </Button>
                </div>
            </div>

            {/* Mobile Caption Viewer */}
            {isMobile && <MobileCaptionViewer isOpen={showMobileCaptions} onClose={() => setShowMobileCaptions(false)} />}
        </>
    )
}
