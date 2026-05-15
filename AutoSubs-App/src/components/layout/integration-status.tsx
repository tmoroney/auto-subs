import { ChevronDown, Check, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useResolve } from "@/contexts/ResolveContext";
import { useAdobe } from "@/contexts/AdobeContext";
import {
  useIntegration,
  type Integration,
} from "@/contexts/IntegrationContext";

export function IntegrationStatus() {
  const { t } = useTranslation();
  const { timelineInfo: resolveTimeline, refresh: refreshResolve } =
    useResolve();
  const {
    premiereTimeline,
    afterEffectsTimeline,
    isPremiereConnected,
    isAfterEffectsConnected,
    refresh: refreshAdobe,
  } = useAdobe();
  const { selectedIntegration, setSelectedIntegration } = useIntegration();

  const isResolveConnected = Boolean(resolveTimeline?.timelineId);
  const integrations = {
    davinci: {
      productName: t("titlebar.resolve.productName"),
      logo: "/davinci-resolve-logo.png",
      connected: isResolveConnected,
      timelineName: resolveTimeline?.name,
      connectedText: t("titlebar.resolve.tooltip.connected"),
      disconnectedText: t("titlebar.resolve.tooltip.cantConnect"),
      helperText: isResolveConnected
        ? t("titlebar.resolve.tooltip.canGetAudio")
        : t("titlebar.resolve.tooltip.openResolve"),
      refresh: refreshResolve,
    },
    premiere: {
      productName: t("titlebar.premiere.productName"),
      logo: "/premiere-logo.png",
      connected: isPremiereConnected,
      timelineName: premiereTimeline?.name,
      connectedText: t("titlebar.premiere.tooltip.connected"),
      disconnectedText: t("titlebar.premiere.tooltip.disconnected"),
      helperText: isPremiereConnected
        ? t("titlebar.premiere.tooltip.canGetAudio")
        : t("titlebar.premiere.tooltip.openPremiere"),
      refresh: refreshAdobe,
    },
    aftereffects: {
      productName: t("titlebar.aftereffects.productName"),
      logo: "/aftereffects-logo.png",
      connected: isAfterEffectsConnected,
      timelineName: afterEffectsTimeline?.name,
      connectedText: t("titlebar.aftereffects.tooltip.connected"),
      disconnectedText: t("titlebar.aftereffects.tooltip.disconnected"),
      helperText: isAfterEffectsConnected
        ? t("titlebar.aftereffects.tooltip.canGetAudio")
        : t("titlebar.aftereffects.tooltip.openAfterEffects"),
      refresh: refreshAdobe,
    },
  } satisfies Record<
    Integration,
    {
      productName: string;
      logo: string;
      connected: boolean;
      timelineName?: string;
      connectedText: string;
      disconnectedText: string;
      helperText: string;
      refresh: () => Promise<void>;
    }
  >;

  const activeIntegration = integrations[selectedIntegration];
  const activeLabel = activeIntegration.connected
    ? activeIntegration.timelineName || activeIntegration.connectedText
    : activeIntegration.productName;

  return (
    <div
      className="flex items-center select-none z-20"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={`flex items-center gap-2 h-7 text-xs px-1.5 !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 ${
              activeIntegration.connected
                ? "hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900 dark:hover:text-green-300"
                : "hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950 dark:hover:text-red-300"
            }`}
          >
            <img
              src={activeIntegration.logo}
              alt={activeIntegration.productName}
              className="h-5 w-5"
            />
            <span className="max-w-[120px] truncate">{activeLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80 z-50">
          <div className="px-2 py-1.5">
            <div className="flex items-start gap-3">
              <img
                src={activeIntegration.logo}
                alt={activeIntegration.productName}
                className="h-8 w-8"
              />
              <div>
                <h3 className="text-sm font-semibold">
                  {activeIntegration.productName}
                </h3>
                <p
                  className={`text-xs ${activeIntegration.connected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                >
                  {activeIntegration.connected
                    ? activeIntegration.connectedText
                    : activeIntegration.disconnectedText}
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeIntegration.helperText}
                </p>
              </div>
            </div>
          </div>
          <DropdownMenuSeparator />
          {(Object.keys(integrations) as Integration[]).map((integration) => {
            const item = integrations[integration];
            return (
              <DropdownMenuItem
                key={integration}
                onClick={() => setSelectedIntegration(integration)}
                className="cursor-pointer"
              >
                <div
                  className={`w-2 h-2 rounded-full ${item.connected ? "bg-green-500" : "bg-red-500"}`}
                />
                <img
                  src={item.logo}
                  alt={item.productName}
                  className="h-10 w-10"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span>{item.productName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.connected
                      ? item.timelineName || item.connectedText
                      : item.disconnectedText}
                  </span>
                </div>
                {selectedIntegration === integration ? (
                  <Check className="h-4 w-4" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              void activeIntegration.refresh();
            }}
            className="cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>{t("common.refresh", "Refresh")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
