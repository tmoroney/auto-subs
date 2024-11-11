// App.tsx
import React, { useEffect } from "react";
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from "react-router-dom";
import { HomePage } from "@/pages/home-page";
import { SearchPage } from "@/pages/search-page";
import { ChatPage } from "@/pages/chat-page";
import { EditPage } from "@/pages/edit-page";
import { ThemeProvider } from "@/components/theme-provider";
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { Pyramid, Type, Search, Bot, Settings2, LifeBuoy, HeartHandshake, Github, SquarePen } from "lucide-react";

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
              <Route path="/edit" element={<EditPage />} />
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

  const pathNames = {
    "/": "Transcribe",
    "/search": "Text Search",
    "/edit": "Edit Subtitles",
    "/chat": "Chat",
  };

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
                <Link to="/edit">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-lg ${currentPath === "/edit" ? "bg-muted" : ""}`}
                    aria-label="Edit Subtitles"
                  >
                    <SquarePen className="size-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Edit Subtitles
              </TooltipContent>
            </Tooltip>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-lg"
                  aria-label="Settings"
                >
                  <Settings2 className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Settings
              </TooltipContent>
            </Tooltip>
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

    </>
  );
}

export default App;