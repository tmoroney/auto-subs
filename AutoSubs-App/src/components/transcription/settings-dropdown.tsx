import * as React from "react";
import {
  GitMerge,
  Heart,
  Monitor,
  Moon,
  Settings as SettingsIcon,
  Shapes,
  Sun,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/animated-tabs";
import { useTheme } from "@/components/providers/theme-provider";
import { SettingsDialog } from "@/components/dialogs/settings-dialog";
import { SupportDialog } from "@/components/dialogs/support-dialog";
import { ManageModelsDialog } from "@/components/settings/model-manager";
import { useModels } from "@/contexts/ModelsContext";
import { diarizeModel } from "@/lib/models";
import type { Model } from "@/types";

export function SettingsDropdown() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { modelsState, downloadedModelValues, handleDeleteModel } = useModels();
  const [manageModelsOpen, setManageModelsOpen] = React.useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false);
  const [supportDialogOpen, setSupportDialogOpen] = React.useState(false);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const suppressTooltipUntilRef = React.useRef(0);

  const managerModels: Model[] = downloadedModelValues.includes(
    diarizeModel.value,
  )
    ? [...modelsState, { ...diarizeModel, isDownloaded: true }]
    : modelsState;

  const handleThemeChange = (themeValue: string) => {
    setTheme(themeValue as "dark" | "light" | "system");
  };

  const suppressTooltip = React.useCallback(() => {
    suppressTooltipUntilRef.current = Date.now() + 700;
    setTooltipOpen(false);
  }, []);

  const handleDropdownOpenChange = (nextOpen: boolean) => {
    setDropdownOpen(nextOpen);
    suppressTooltip();
  };

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownOpenChange}>
        <Tooltip
          open={tooltipOpen}
          onOpenChange={(nextOpen) => {
            setTooltipOpen(
              nextOpen &&
                !dropdownOpen &&
                Date.now() > suppressTooltipUntilRef.current,
            );
          }}
        >
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-sm"
                aria-label={t("settings.title", "Settings")}
              >
                <SettingsIcon />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t("settings.title", "Settings")}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          className="w-48 rounded-lg"
          side="bottom"
          align="end"
          sideOffset={4}
          onPointerDown={suppressTooltip}
          onClick={suppressTooltip}
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => setSettingsDialogOpen(true)}
              className="cursor-pointer"
            >
              <SettingsIcon />
              <span>{t("settings.title", "Settings")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setManageModelsOpen(true)}
              className="cursor-pointer"
            >
              <Shapes />
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
                <GitMerge />
                <span>{t("settings.support.viewSource", "View Source")}</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setSupportDialogOpen(true)}
              className="cursor-pointer focus:bg-pink-100 focus:text-pink-700 data-[highlighted]:bg-pink-100 data-[highlighted]:text-pink-700 dark:focus:bg-pink-900/50 dark:focus:text-pink-500 dark:data-[highlighted]:bg-pink-900/50 dark:data-[highlighted]:text-pink-500"
            >
              <div className="group relative flex w-full items-center">
                <Heart className="mr-2 h-4 w-4 text-pink-500 transition-all group-data-[highlighted]:fill-pink-500 group-focus:fill-pink-500" />
                <span>
                  {t("settings.support.supportAutoSubs", "Support AutoSubs")}
                </span>
                <div className="pointer-events-none absolute inset-0">
                  {[
                    { tx: "-90px", ty: "-90px", s: 1.8, r: "-20deg", d: "0s" },
                    { tx: "80px", ty: "-100px", s: 1.5, r: "25deg", d: "0.05s" },
                    { tx: "-30px", ty: "-120px", s: 1.7, r: "5deg", d: "0.1s" },
                    { tx: "100px", ty: "-80px", s: 1.4, r: "-15deg", d: "0.15s" },
                    { tx: "0px", ty: "-115px", s: 1.9, r: "0deg", d: "0.2s" },
                    { tx: "-100px", ty: "-75px", s: 1.5, r: "15deg", d: "0.25s" },
                    { tx: "70px", ty: "-115px", s: 1.6, r: "-5deg", d: "0.3s" },
                  ].map((heart, index) => (
                    <Heart
                      key={index}
                      className="heart-anim absolute left-1/2 top-1/2 h-5 w-5 text-pink-400 opacity-0"
                      style={
                        {
                          "--tx": heart.tx,
                          "--ty": heart.ty,
                          "--s": heart.s,
                          "--r": heart.r,
                          animationDelay: heart.d,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <div className="p-1">
            <Tabs value={theme} onValueChange={handleThemeChange}>
              <TabsList className="w-full">
                <TabsTrigger value="light">
                  <Sun />
                </TabsTrigger>
                <TabsTrigger value="dark">
                  <Moon />
                </TabsTrigger>
                <TabsTrigger value="system">
                  <Monitor />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <ManageModelsDialog
        open={manageModelsOpen}
        onOpenChange={setManageModelsOpen}
        models={managerModels}
        onDeleteModel={(modelValue) => void handleDeleteModel(modelValue)}
      />

      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
      />

      <SupportDialog
        open={supportDialogOpen}
        onOpenChange={setSupportDialogOpen}
      />
    </>
  );
}
