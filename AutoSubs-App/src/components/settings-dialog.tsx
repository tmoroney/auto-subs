import { Heart, Github, Moon, Sun, Settings, Gauge, Clock, ChevronRight } from "lucide-react";
import { useGlobal } from "@/contexts/GlobalContext";
import { useTheme } from "@/components/theme-provider";
import { ask } from "@tauri-apps/plugin-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_SETTINGS } from "@/contexts/GlobalContext";

export function SettingsDialog() {
  const { settings, updateSetting } = useGlobal();
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  
  const handleResetSettings = async () => {
    const shouldReset = await ask("Are you sure you want to reset all settings to default? This cannot be undone.", {
      title: "Reset Settings",
      kind: "warning"
    });
    
    if (shouldReset) {
      // Reset all settings to default values using DEFAULT_SETTINGS
      const settingsKeys = Object.keys(DEFAULT_SETTINGS) as Array<keyof typeof DEFAULT_SETTINGS>;
      settingsKeys.forEach((key) => {
        updateSetting(key, DEFAULT_SETTINGS[key]);
      });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          data-tauri-drag-region="false"
        >
          <Settings />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your AutoSubs preferences and options.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-5 py-4 overflow-y-auto max-h-[70vh]">

          {/* Appearance Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Appearance</h4>
            
            {/* Theme Card */}
            <button
              onClick={toggleTheme}
              className="border rounded-lg overflow-hidden cursor-pointer hover:bg-accent/50 w-full text-left transition-colors"
            >
              <div className="p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                      {theme === "dark" ? (
                        <Moon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      ) : (
                        <Sun className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">Theme</p>
                      <p className="text-xs text-muted-foreground">
                        {theme === "dark" ? "Dark mode" : "Light mode"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {theme === "dark" ? "Light" : "Dark"}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* Transcription Settings */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Transcription</h4>
            
            {/* GPU Card */}
            <div className="border rounded-lg overflow-hidden">
              <div className="p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                      <Gauge className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">GPU Acceleration</p>
                      <p className="text-xs text-muted-foreground">
                        Utilise GPU for faster transcription
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.enableGpu}
                    onCheckedChange={(checked) => updateSetting("enableGpu", checked)}
                  />
                </div>
              </div>
            </div>

            {/* DTW Card */}
            <div className="border rounded-lg overflow-hidden">
              <div className="p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Dynamic Time Warping</p>
                      <p className="text-xs text-muted-foreground">
                        Improve word-level timing accuracy
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.enableDTW}
                    onCheckedChange={(checked) => updateSetting("enableDTW", checked)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Support Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Support</h4>
            
            {/* Support AutoSubs Card */}
            <a
              href="https://buymeacoffee.com/tmoroney"
              target="_blank"
              rel="noopener noreferrer"
              className="border rounded-lg overflow-hidden cursor-pointer hover:bg-accent/50 group relative block transition-colors"
            >
              <div className="p-3.5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-pink-100 dark:bg-pink-900/30 group-hover:bg-pink-200 dark:group-hover:bg-pink-800/50 transition-colors">
                    <Heart className="h-5 w-5 text-pink-600 dark:text-pink-400 group-hover:fill-pink-500 fill-background transition-colors" />
                  </div>
                  <div>
                    <p className="text-sm font-medium group-hover:text-foreground">Support AutoSubs</p>
                    <p className="text-xs text-muted-foreground group-hover:text-muted-foreground/80 transition-colors">
                      Help support development
                    </p>
                  </div>
                </div>
              </div>
              
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

            {/* View Source Card */}
            <a
              href="https://github.com/tmoroney/auto-subs"
              target="_blank"
              rel="noopener noreferrer"
              className="border rounded-lg overflow-hidden cursor-pointer hover:bg-accent/50 group relative block transition-colors"
            >
              <div className="p-3.5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900/30 group-hover:bg-slate-200 dark:group-hover:bg-slate-800/50 transition-colors">
                    <Github className="h-5 w-5 text-slate-600 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors" />
                  </div>
                  <div>
                    <p className="text-sm font-medium group-hover:text-foreground">View Source Code</p>
                    <p className="text-xs text-muted-foreground group-hover:text-muted-foreground/80 transition-colors">
                      Check out the GitHub repository
                    </p>
                  </div>
                </div>
              </div>
            </a>
          </div>

          {/* Reset Section */}
          <div className="space-y-3">
            <Button
              variant="destructive"
              onClick={handleResetSettings}
              className="w-full"
            >
              Reset All Settings to Default
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
