import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, History, Settings, Sun, Moon, Monitor, Trash2, AlertTriangle, Archive, Heart, Github } from "lucide-react";
import { platform } from "@tauri-apps/plugin-os";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/animated-tabs";
import { getTranscriptsDir } from "@/utils/file-utils";
import { readDir } from "@tauri-apps/plugin-fs";
import { readTranscript } from "@/utils/file-utils";
import { useTranscript } from "@/contexts/TranscriptContext";
import { useTheme } from "@/components/theme-provider";
import { useModels } from "@/contexts/ModelsContext";
import { Model } from "@/types/interfaces";
import { useState, useEffect } from "react";
import { SettingsDialog } from "@/components/settings-dialog";

interface TimelineInfo {
  timelineId?: string;
  name?: string;
}

interface ResolveStatusProps {
  timelineInfo: TimelineInfo | null;
}

function ResolveStatus({ timelineInfo }: ResolveStatusProps) {
  const { t } = useTranslation();
  const isConnected = timelineInfo && timelineInfo.timelineId;

  return (
    <HoverCard openDelay={400}>
      <HoverCardTrigger asChild>
        <Button
          variant="ghost"
          className={`flex items-center gap-2 h-7 text-xs ${isConnected
            ? "hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900 dark:hover:text-green-300"
            : "hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950 dark:hover:text-red-300"
            }`}
          data-tauri-drag-region
        >
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
          />
          {isConnected
            ? (timelineInfo?.name || t("titlebar.resolve.status.connected"))
            : t("titlebar.resolve.status.disconnected")}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 z-50">
        <div className="flex items-start gap-3">
          <img
            src="/davinci-resolve-logo.png"
            alt={t("titlebar.resolve.productName")}
            className="h-8 w-8"
          />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">{t("titlebar.resolve.productName")}</h4>
            {isConnected ? (
              <div className="space-y-1">
                <p className="text-sm text-green-600 dark:text-green-400">
                  ✓ {t("titlebar.resolve.tooltip.connected")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {timelineInfo?.name
                    ? t("titlebar.resolve.tooltip.currentlyViewing", { name: timelineInfo.name })
                    : t("titlebar.resolve.tooltip.ready")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("titlebar.resolve.tooltip.canGetAudio")}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-red-600 dark:text-red-400">
                  {t("titlebar.resolve.tooltip.cantConnect")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("titlebar.resolve.tooltip.openResolve")}
                </p>
              </div>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

interface TranscriptFile {
  name: string;
  lastModified: Date;
}

function ManageModelsDialog({
  open,
  onOpenChange,
  models,
  onDeleteModel
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: Model[];
  onDeleteModel: (modelValue: string) => void;
}) {
  const { t } = useTranslation();
  const [confirmOpenForModelValue, setConfirmOpenForModelValue] = useState<string | null>(null);
  const downloadedModels = models.filter(model => model.isDownloaded);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t("models.manage.title")}</DialogTitle>
            <DialogDescription>
              {t("models.manage.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {downloadedModels.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {t("models.manage.empty")}
              </p>
            ) : (
              downloadedModels.map((model) => (
                <div key={model.value} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <img
                      src={model.image}
                      alt={t(model.label)}
                      className="w-9 h-9 object-contain rounded"
                    />
                    <div>
                      <div className="flex items-center">
                        <p className="font-medium text-sm">{t(model.label)}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{model.size}</p>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    title={t("models.manage.deleteModel")}
                    onClick={() => setConfirmOpenForModelValue(model.value)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmOpenForModelValue !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmOpenForModelValue(null);
        }}
      >
        <DialogContent
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="font-semibold text-red-500 dark:text-red-500">{t("models.manage.confirmTitle")}</span>
          </DialogTitle>
          <span className="text-sm text-muted-foreground">
            {t("models.manage.confirmBody", {
              model: confirmOpenForModelValue
                ? t(models.find((m) => m.value === confirmOpenForModelValue)?.label || "")
                : "",
            })}
          </span>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">{t("common.cancel")}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!confirmOpenForModelValue) return;
                onDeleteModel(confirmOpenForModelValue);
                setConfirmOpenForModelValue(null);
              }}
            >
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SettingsDropdown() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { modelsState, handleDeleteModel } = useModels();
  const [manageModelsOpen, setManageModelsOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  const handleThemeChange = (themeValue: string) => {
    setTheme(themeValue as "dark" | "light" | "system");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            data-tauri-drag-region="false"
            className="gap-2 rounded-full !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-48 rounded-lg"
          side="bottom"
          align="end"
          sideOffset={4}
        >
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setSettingsDialogOpen(true)} className="cursor-pointer">
              <Settings className="h-4 w-4 mr-2" />
              <span>{t("settings.title", "Settings")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setManageModelsOpen(true)} className="cursor-pointer">
              <Archive className="h-4 w-4 mr-2" />
              <span>{t("models.manage.title", "Manage Models")}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem asChild className="cursor-pointer">
              <a
                href="https://github.com/tmoroney/auto-subs"
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <Github className="h-4 w-4 mr-2 text-slate-600 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors" />
                <span>{t("settings.support.viewSource", "View Source")}</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem
              asChild
              className="cursor-pointer focus:bg-pink-100 focus:text-pink-700 data-[highlighted]:bg-pink-100 data-[highlighted]:text-pink-700 dark:focus:bg-pink-900/50 dark:focus:text-pink-500 dark:data-[highlighted]:bg-pink-900/50 dark:data-[highlighted]:text-pink-500"
            >
              <a
                href="https://buymeacoffee.com/tmoroney"
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex w-full items-center"
              >
                <Heart className="h-4 w-4 mr-2 text-pink-500 group-data-[highlighted]:fill-pink-500 group-focus:fill-pink-500 transition-all" />
                <span>{t("settings.support.supportAutoSubs", "Support AutoSubs")}</span>

                {/* Bursting hearts animation */}
                <div className="absolute inset-0 pointer-events-none">
                  {[
                    { tx: '-90px', ty: '-90px', s: 1.8, r: '-20deg', d: '0s' },
                    { tx: '80px', ty: '-100px', s: 1.5, r: '25deg', d: '0.05s' },
                    { tx: '-30px', ty: '-120px', s: 1.7, r: '5deg', d: '0.1s' },
                    { tx: '100px', ty: '-80px', s: 1.4, r: '-15deg', d: '0.15s' },
                    { tx: '0px', ty: '-115px', s: 1.9, r: '0deg', d: '0.2s' },
                    { tx: '-100px', ty: '-75px', s: 1.5, r: '15deg', d: '0.25s' },
                    { tx: '70px', ty: '-115px', s: 1.6, r: '-5deg', d: '0.3s' },
                  ].map((p, i) => (
                    <Heart
                      key={i}
                      className="heart-anim absolute top-1/2 left-1/2 h-5 w-5 text-pink-400 opacity-0"
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
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          {/* Theme Tabs */}
          <div className="p-1">
            <Tabs value={theme} onValueChange={handleThemeChange}>
              <TabsList className="w-full">
                <TabsTrigger value="light">
                  <Sun className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="dark">
                  <Moon className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="system">
                  <Monitor className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <ManageModelsDialog
        open={manageModelsOpen}
        onOpenChange={setManageModelsOpen}
        models={modelsState}
        onDeleteModel={handleDeleteModel}
      />

      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
      />
    </>
  );
}

function TranscriptsButton() {
  const [open, setOpen] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptFile[]>([]);
  const [loading, setLoading] = useState(false);
  const { setSubtitles, setSpeakers, setCurrentTranscriptFilename } = useTranscript();

  useEffect(() => {
    if (open) {
      loadTranscripts();
    }
  }, [open]);

  const loadTranscripts = async () => {
    setLoading(true);
    try {
      const transcriptsDir = await getTranscriptsDir();
      const entries = await readDir(transcriptsDir);

      const transcriptFiles = await Promise.all(
        entries
          .filter(entry => entry.name.endsWith('.json'))
          .map(async (entry) => {
            // For now, just use current time as lastModified since the API doesn't expose it easily
            const lastModified = new Date();
            return {
              name: entry.name,
              lastModified
            };
          })
      );

      transcriptFiles.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
      setTranscripts(transcriptFiles);
    } catch (error) {
      console.error('Failed to load transcripts:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          data-tauri-drag-region="false"
          className="gap-2 rounded-full"
        >
          <History className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search transcripts..." />
          <CommandList>
            {loading ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : transcripts.length === 0 ? (
              <CommandEmpty>No transcripts found.</CommandEmpty>
            ) : (
              <CommandGroup>
                {transcripts.map((transcript) => (
                  <CommandItem
                    key={transcript.name}
                    value={transcript.name}
                    onSelect={async () => {
                      try {
                        const transcriptData = await readTranscript(transcript.name);
                        if (transcriptData) {
                          setSubtitles(transcriptData.segments || []);
                          setSpeakers(transcriptData.speakers || []);
                          setCurrentTranscriptFilename(transcript.name);
                        }
                      } catch (error) {
                        console.error('Failed to load transcript:', error);
                      }
                      setOpen(false);
                    }}
                  >
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-sm font-medium">
                        {transcript.name.replace('.json', '')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {transcript.lastModified.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function Titlebar({ timelineInfo }: { timelineInfo: TimelineInfo | null }) {
  const { t } = useTranslation();
  const [isMacOS, setIsMacOS] = useState(false);

  useEffect(() => {
    const checkPlatform = async () => {
      const currentPlatform = await platform();
      setIsMacOS(currentPlatform === "macos");
    };
    checkPlatform();
  }, []);

  const handleMinimize = () => {
    getCurrentWindow().minimize();
  };

  const handleMaximize = () => {
    getCurrentWindow().toggleMaximize();
  };

  const handleClose = () => {
    getCurrentWindow().close();
  };

  return (
    <header
      className="flex items-center justify-between h-9 px-1 border-b bg-card backdrop-blur select-none z-50"
      data-tauri-drag-region
    >
      {isMacOS ? (
        // macOS layout: System handles traffic lights, status in center, settings on right
        <>
          {/* Left side - Empty spacer for system traffic lights */}
          <div className="w-20" data-tauri-drag-region />

          {/* Center - Resolve status */}
          <div className="flex items-center justify-center flex-1" data-tauri-drag-region>
            <ResolveStatus timelineInfo={timelineInfo} />
          </div>

          {/* Right side - Transcripts and Settings buttons */}
          <div className="flex items-center w-24 justify-end">
            <div data-tauri-drag-region="false">
              <TranscriptsButton />
            </div>
            <div data-tauri-drag-region="false">
              <SettingsDropdown />
            </div>
          </div>
        </>
      ) : (
        // Windows/Linux layout: Settings on left, status in center, window buttons on right
        <>
          {/* Left side - Transcripts and Settings */}
          <div className="flex items-center">
            <div data-tauri-drag-region="false">
              <TranscriptsButton />
            </div>
            <div data-tauri-drag-region="false">
              <SettingsDropdown />
            </div>
          </div>

          {/* Center - Resolve status */}
          <div className="flex items-center justify-center flex-1" data-tauri-drag-region>
            <ResolveStatus timelineInfo={timelineInfo} />
          </div>

          {/* Right side - Window controls */}
          <div className="flex items-center gap-1 controls">
            <button
              className="hover:bg-accent rounded px-2 h-7 flex items-center justify-center transition-colors"
              onClick={handleMinimize}
              data-tauri-drag-region="false"
              aria-label={t("titlebar.windowControls.minimize")}
            >
              <Minus className="h-3 w-3" />
            </button>
            <button
              className="hover:bg-accent rounded px-2 h-7 flex items-center justify-center transition-colors"
              onClick={handleMaximize}
              data-tauri-drag-region="false"
              aria-label={t("titlebar.windowControls.maximize")}
            >
              <Square className="h-3 w-3" />
            </button>
            <button
              className="hover:bg-destructive hover:text-destructive-foreground rounded px-2 h-7 flex items-center justify-center transition-colors"
              onClick={handleClose}
              data-tauri-drag-region="false"
              aria-label={t("titlebar.windowControls.close")}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
    </header>
  );
}
