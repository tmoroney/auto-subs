// App.tsx
import { useState } from "react";
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from "react-router-dom";
import { HomePage } from "@/pages/home-page";
import { SearchPage } from "@/pages/search-page";
import { ChatPage } from "@/pages/chat-page";
import { DiarizePage } from "@/pages/diarize-page";
import { AnimatePage } from "./pages/animate-page";
import { ThemeProvider } from "@/components/theme-provider";
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { Pyramid, Type, Search, LifeBuoy, HeartHandshake, Github, Speech, ChevronRight, PenTool } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { ScrollArea } from "./components/ui/scroll-area";

const pathNames = {
  "/": "Transcribe",
  "/search": "Text Search",
  "/diarize": "Edit Speakers",
  "/animate": "Animate Subtitles",
  "/chat": "Chat",
};

const tutorialSections = [
  {
    title: "Getting Started",
    items: [
      "Set the output track for subtitles.",
      "Choose a subtitle template (default included).",
      "Select the language and click Generate.",
      "Subtitles will appear on the timeline shortly."
    ]
  },
  {
    title: "Transcription Models",
    items: [
      "Pick a transcription model from the list.",
      "Larger models like Large-V3 offer more accuracy.",
      "Lightweight models provide faster but less accurate results."
    ]
  },
  {
    title: "Speaker Diarization",
    items: [
      "Detects speakers in audio automatically if enabled.",
      "Assigns each speaker a color for easy tracking.",
      "Edit labels on the Edit Speakers page."
    ]
  }
];

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <Router>
        <NavigationAside />
        <div className="flex flex-col h-screen pl-[56px] overflow-hidden">
          <NavigationHeader />
          <div className="flex flex-col flex-grow overflow-auto min-h-0">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/diarize" element={<DiarizePage />} />
              <Route path="/animate" element={<AnimatePage />} />
              <Route path="/chat" element={<ChatPage />} />
            </Routes>
          </div>
        </div>
      </Router>
    </ThemeProvider>
  );
}

function NavigationHeader() {

  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <>
      <header className="sticky top-0 z-10 flex min-h-[57px] items-center gap-1 border-b bg-background px-4">
        <h1 className="text-xl font-semibold">{pathNames[currentPath as keyof typeof pathNames]}</h1>
        <a href="https://www.buymeacoffee.com/tmoroney" target="_blank" rel="noopener noreferrer" className="ml-auto">
          <Button
            variant="link"
            size="sm"
            className="gap-1.5 text-sm"
          >
            <HeartHandshake className="size-4" />
            Support AutoSubs
          </Button>
        </a>
        <a href="https://github.com/tmoroney/auto-subs" target="_blank" rel="noopener noreferrer">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-sm hidden sm:flex"
          >
            <Github className="size-4" />
            GitHub
          </Button>
        </a>
        {/* <div className="min-w-[190px]">
        <Select onValueChange={(value) => setTrack(value)} >
            <SelectTrigger>
              <SelectValue placeholder="Subtitle Output Track" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Tracks available</SelectLabel>
                {tracks.map((track) => (
                  <SelectItem key={track.value} value={track.value}>
                    {track.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          </div> */}
      </header>
    </>
  );
}

function NavigationAside() {

  const location = useLocation();
  const currentPath = location.pathname;
  const [open, setOpen] = useState(false)

  return (
    <>
      <aside className="inset-y fixed  left-0 z-20 flex h-full flex-col border-r">
        <div className="border-b p-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/">
                  <Button variant="outline" size="icon" aria-label="Home">
                    <Pyramid className="size-5 fill-foreground" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                AutoSubs
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <nav className="grid gap-1 p-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-lg ${currentPath === "/" ? "bg-muted" : ""}`}
                    aria-label="Playground"
                  >
                    <Type className="size-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Subtitles
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/search">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-lg ${currentPath === "/search" ? "bg-muted" : ""}`}
                    aria-label="Text Search"
                  >
                    <Search className="size-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Text Search
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/diarize">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-lg ${currentPath === "/diarize" ? "bg-muted" : ""}`}
                    aria-label="Edit Speakers"
                  >
                    <Speech className="size-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Edit Speakers
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/animate">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`rounded-lg ${currentPath === "/animate" ? "bg-muted" : ""}`}
                  aria-label="Animate"
                >
                  <PenTool className="size-5" />
                </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Animate
              </TooltipContent>
            </Tooltip>
            {/*
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/chat">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-lg ${currentPath === "/chat" ? "bg-muted" : ""}`}
                    aria-label="Chat"
                  >
                    <Bot className="size-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Chat AI
              </TooltipContent>
            </Tooltip>
            */}
          </TooltipProvider>
        </nav>
        <nav className="mt-auto grid gap-1 p-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-auto rounded-lg"
                  aria-label="Help"
                  onClick={() => setOpen(true)}
                >
                  <LifeBuoy className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Help
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <ModeToggle />
        </nav>
      </aside>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Quick Tutorial</DialogTitle>
          <DialogDescription>Learn how to use our subtitle generation tool</DialogDescription>
        </DialogHeader>
        <ScrollArea className="mt-2 max-h-[60vh] pr-4">
          <div className="space-y-6">
            {tutorialSections.map((section, index) => (
              <section key={index} className="space-y-3">
                <h2 className="text-lg font-semibold flex items-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 mr-2 text-sm font-bold text-white bg-primary rounded-full">
                    {index + 1}
                  </span>
                  {section.title}
                </h2>
                <ul className="space-y-2">
                  {section.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="flex items-start">
                      <ChevronRight className="mr-2 h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    </>
  );
}

export default App;