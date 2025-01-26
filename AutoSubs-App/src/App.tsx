// App.tsx
import { useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from "react-router-dom";
import { HomePage } from "@/pages/home-page";
import { SearchPage } from "@/pages/search-page";
import { ChatPage } from "@/pages/chat-page";
import { DiarizePage } from "@/pages/diarize-page";
import { AnimatePage } from "./pages/animate-page";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { Search, LifeBuoy, HeartHandshake, Github, Speech, ChevronRight, House, Download } from "lucide-react";
// import { Paintbrush, SwatchBook } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGlobal } from "@/GlobalContext";
import { platform } from '@tauri-apps/plugin-os';

const pathNames = {
  "/": "Generate Subtitles",
  "/search": "Text Search",
  "/diarize": "Diarized Speakers",
  "/animate": "Design Subtitles",
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

  const { checkForUpdates } = useGlobal();
  const [updateInfo, setUpdateInfo] = useState<string[]>([]);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  useEffect(() => {
    async function fetchUpdateInfo() {
      let info = await checkForUpdates();
      if (info != null) {
        let changes = info.split('\r\n').map(change => change.split("- ")[1]);
        setUpdateInfo(changes);
      }
    }
    fetchUpdateInfo();
  }, []);

  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <>
      <header className="sticky top-0 z-10 flex min-h-[57px] items-center gap-1 border-b bg-background px-4">
        <h1 className="text-xl font-semibold">{pathNames[currentPath as keyof typeof pathNames]}</h1>
        <Button
          asChild
          variant="link"
          size="sm"
          className="gap-1.5 text-sm"
        >
          <Link to="https://www.buymeacoffee.com/tmoroney" target="_blank" rel="noopener noreferrer" className="ml-auto">
              <HeartHandshake className="size-4" />
              Support AutoSubs
          </Link>
        </Button>
        {updateInfo.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-sm hidden sm:flex"
            onClick={() => setUpdateDialogOpen(true)}>
            <Download className="size-4" />
            New Update Available
          </Button>
        ) : (
        <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-1.5 text-sm hidden sm:flex"
          >
            <Link to="https://github.com/tmoroney/auto-subs" target="_blank" rel="noopener noreferrer">
              <Github className="size-4" />
              GitHub
            </Link>
          </Button>
        )}
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

      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent className="sm:max-w-[430px] md:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>New Update Available</DialogTitle>
            <DialogDescription>Here are the changes in the latest update</DialogDescription>
          </DialogHeader>
          <ScrollArea className="mt-2 max-h-[60vh] pr-4">
            <div className="space-y-6">
              {updateInfo.map((changeInfo, index) => (
                <section key={index} className="space-y-3">
                  <h2 className="text-md font-medium flex items-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 mr-2 text-sm font-bold text-white bg-primary rounded-full">
                      {index + 1}
                    </span>
                    {changeInfo}
                  </h2>
                </section>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter className="pt-4">
            <a href={platform() == "windows" ? "https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Win-setup.exe" : "https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-ARM.pkg"} target="_blank" rel="noopener noreferrer">
              <Button
                variant="default"
                className="gap-1.5 text-sm hidden sm:flex"
              >
                <Download className="size-4" />
                Download Update
              </Button>
            </a>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NavigationAside() {

  const location = useLocation();
  const currentPath = location.pathname;
  const [open, setOpen] = useState(false)
  const [openErrorDialog, setOpenErrorDialog] = useState(false)
  const { error, setError } = useGlobal();

  useEffect(() => {
    if (error?.title !== "") {
      setOpenErrorDialog(true);
    }
  }, [error])

  return (
    <>
      <aside className="inset-y fixed  left-0 z-20 flex h-full flex-col border-r">
        <div className="border-b p-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild variant="outline" size="icon" aria-label="Home">
                  <Link to="/">
                    {useTheme().theme === 'dark' ? (
                      <svg
                        width="24"
                        height="28"
                        viewBox="0 0 411 746"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <g filter="url(#filter0_d_104_2)">
                          <path
                            d="M162.773 172.6L305.333 90.1C320.293 81.3 333.493 80.2 344.933 86.8C356.813 93.4 362.753 105.5 362.753 123.1V545.5L305.333 578.5V446.5L162.773 529V661L105.353 694V271.6C105.353 259.72 107.993 247.4 113.273 234.64C118.553 221.44 125.593 209.34 134.393 198.34C143.193 186.9 152.653 178.32 162.773 172.6ZM305.333 380.5V156.1L162.773 238.6V463L305.333 380.5ZM305.333 446.5V578.5L247.913 545.5V413.5L305.333 446.5ZM305.333 156.1V380.5L247.913 347.5V123.1L305.333 156.1ZM305.333 380.5L162.773 463L105.353 430L247.913 347.5L305.333 380.5ZM345.593 86.8C333.713 80.2 320.293 81.3 305.333 90.1L162.773 172.6C152.653 178.32 143.193 186.9 134.393 198.34C125.593 209.34 118.553 221.44 113.273 234.64C107.993 247.4 105.353 259.72 105.353 271.6V694L47.9327 661V238.6C47.9327 226.72 50.5727 214.4 55.8527 201.64C61.1327 188.44 68.1727 176.34 76.9727 165.34C85.7727 153.9 95.2327 145.32 105.353 139.6L247.913 57.1C263.313 48.3 276.733 47.2 288.173 53.8L345.593 86.8Z"
                            fill="white"
                          />
                        </g>
                        <defs>
                          <filter
                            id="filter0_d_104_2"
                            x="0.63274"
                            y="0.599964"
                            width="409.42"
                            height="744.7"
                            filterUnits="userSpaceOnUse"
                            colorInterpolationFilters="sRGB"
                          >
                            <feFlood floodOpacity="0" result="BackgroundImageFix" />
                            <feColorMatrix
                              in="SourceAlpha"
                              type="matrix"
                              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                              result="hardAlpha"
                            />
                            <feOffset dy="4" />
                            <feGaussianBlur stdDeviation="23.65" />
                            <feComposite in2="hardAlpha" operator="out" />
                            <feColorMatrix
                              type="matrix"
                              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.2 0"
                            />
                            <feBlend
                              mode="normal"
                              in2="BackgroundImageFix"
                              result="effect1_dropShadow_104_2"
                            />
                            <feBlend
                              mode="normal"
                              in="SourceGraphic"
                              in2="effect1_dropShadow_104_2"
                              result="shape"
                            />
                          </filter>
                        </defs>
                      </svg>
                    ) : (
                      <svg
                        width="26"
                        height="28"
                        viewBox="0 0 411 746"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <g filter="url(#filter0_d_110_2)">
                          <path
                            d="M162.773 172.6L305.333 90.1C320.293 81.3 333.493 80.2 344.933 86.8C356.813 93.4 362.753 105.5 362.753 123.1V545.5L305.333 578.5V446.5L162.773 529V661L105.353 694V271.6C105.353 259.72 107.993 247.4 113.273 234.64C118.553 221.44 125.593 209.34 134.393 198.34C143.193 186.9 152.653 178.32 162.773 172.6ZM305.333 380.5V156.1L162.773 238.6V463L305.333 380.5ZM305.333 446.5V578.5L247.913 545.5V413.5L305.333 446.5ZM305.333 156.1V380.5L247.913 347.5V123.1L305.333 156.1ZM305.333 380.5L162.773 463L105.353 430L247.913 347.5L305.333 380.5ZM345.593 86.8C333.713 80.2 320.293 81.3 305.333 90.1L162.773 172.6C152.653 178.32 143.193 186.9 134.393 198.34C125.593 209.34 118.553 221.44 113.273 234.64C107.993 247.4 105.353 259.72 105.353 271.6V694L47.9327 661V238.6C47.9327 226.72 50.5727 214.4 55.8527 201.64C61.1327 188.44 68.1727 176.34 76.9727 165.34C85.7727 153.9 95.2327 145.32 105.353 139.6L247.913 57.1C263.313 48.3 276.733 47.2 288.173 53.8L345.593 86.8Z"
                            fill="black"
                          />
                        </g>
                        <defs>
                          <filter
                            id="filter0_d_110_2"
                            x="0.63274"
                            y="0.599903"
                            width="409.42"
                            height="744.7"
                            filterUnits="userSpaceOnUse"
                            colorInterpolationFilters="sRGB"
                          >
                            <feFlood floodOpacity="0" result="BackgroundImageFix" />
                            <feColorMatrix
                              in="SourceAlpha"
                              type="matrix"
                              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                              result="hardAlpha"
                            />
                            <feOffset dy="4" />
                            <feGaussianBlur stdDeviation="23.65" />
                            <feComposite in2="hardAlpha" operator="out" />
                            <feColorMatrix
                              type="matrix"
                              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.2 0"
                            />
                            <feBlend
                              mode="normal"
                              in2="BackgroundImageFix"
                              result="effect1_dropShadow_110_2"
                            />
                            <feBlend
                              mode="normal"
                              in="SourceGraphic"
                              result="shape"
                            />
                          </filter>
                        </defs>
                      </svg>
                    )}
                  </Link>
                </Button>
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
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className={`rounded-lg ${currentPath === "/" ? "bg-muted" : ""}`}
                  aria-label="Playground"
                >
                  <Link to="/">
                    <House className="size-5" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Generate Subtitles
              </TooltipContent>
            </Tooltip>
            {/* <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className={`rounded-lg ${currentPath === "/animate" ? "bg-muted" : ""}`}
                  aria-label="Animate"
                >
                  <Link to="/animate">
                    <Paintbrush className="size-5" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Design Subtitles
              </TooltipContent>
            </Tooltip> */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className={`rounded-lg ${currentPath === "/diarize" ? "bg-muted" : ""}`}
                  aria-label="Edit Speakers"
                >
                  <Link to="/diarize">
                    <Speech className="size-5" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Edit Speakers
              </TooltipContent>
            </Tooltip>
            {/* <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className={`rounded-lg ${currentPath === "/chat" ? "bg-muted" : ""}`}
                  aria-label="Chat"
                >
                  <Link to="/chat">
                    <SwatchBook className="size-5" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Toolbox
              </TooltipContent>
            </Tooltip> */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className={`rounded-lg ${currentPath === "/search" ? "bg-muted" : ""}`}
                  aria-label="Text Search"
                >
                  <Link to="/search">
                    <Search className="size-5" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Text Search
              </TooltipContent>
            </Tooltip>
            {/*
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className={`rounded-lg ${currentPath === "/chat" ? "bg-muted" : ""}`}
                  aria-label="Chat"
                >
                  <Link to="/chat">
                    <Bot className="size-5" />
                  </Link>
                </Button>
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
      </aside >
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[430px] md:max-w-[550px]">
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

      <Dialog open={openErrorDialog} onOpenChange={setOpenErrorDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{error?.title}</DialogTitle>
            <DialogDescription>
              Report any bugs on{' '}
              <a
                href="https://discord.com/invite/TBFUfGWegm"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Discord{' '}
              </a>
              or create an issue on {' '}
              <a
                href="https://github.com/tmoroney/auto-subs/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                GitHub
              </a>.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="mt-2 mb-4 max-h-[60vh] pr-4">
            <div className="space-y-6">
              <span className="text-s">{error?.desc}</span>
            </div>
          </ScrollArea>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" onClick={() => setError({
                title: "",
                desc: ""
              })}>Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}

export default App;
