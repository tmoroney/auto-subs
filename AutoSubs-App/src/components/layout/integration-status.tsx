import { ChevronDown, Check, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
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
      projectName: resolveTimeline?.projectName,
      description: t("titlebar.resolve.description"),
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
      projectName: premiereTimeline?.projectName,
      description: t("titlebar.premiere.description"),
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
      projectName: afterEffectsTimeline?.projectName,
      description: t("titlebar.aftereffects.description"),
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
      projectName?: string;
      description: string;
      connectedText: string;
      disconnectedText: string;
      helperText: string;
      refresh: () => Promise<void>;
    }
  >;

  const activeIntegration = integrations[selectedIntegration];

  const activeLabel = activeIntegration.connected
    ? activeIntegration.timelineName || activeIntegration.connectedText
    : t("titlebar.status.disconnected");

  return (
    <div
      className="flex items-center select-none z-20 min-w-0"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={`flex items-center gap-1.5 h-7 text-xs px-1.5 min-w-0 !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 ${
              activeIntegration.connected
                ? "hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900 dark:hover:text-green-300"
                : "hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            }`}
          >
            <img
              src={activeIntegration.logo}
              alt={activeIntegration.productName}
              className="h-5 w-5 shrink-0"
            />
            <span className={`truncate min-w-0 ${!activeIntegration.connected ? "text-gray-600 dark:text-gray-400" : ""}`}>
              {activeLabel}
            </span>
            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80 z-50">
          <div className="px-2.5 py-2">
            <div>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold">
                  {activeIntegration.productName}
                </h3>
                <Badge
                  variant="outline"
                  className={
                    activeIntegration.connected
                      ? "font-normal border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                      : "font-normal border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                  }
                >
                  {activeIntegration.connected
                    ? activeIntegration.connectedText
                    : activeIntegration.disconnectedText}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {activeIntegration.helperText}
              </p>
            </div>
          </div>
          <DropdownMenuSeparator />
          {(Object.keys(integrations) as Integration[]).map((integration) => {
            const item = integrations[integration];
            return (
              <DropdownMenuItem
                key={integration}
                onClick={() => setSelectedIntegration(integration)}
                className="cursor-pointer pl-1.5 pr-3"
              >
                <img
                  src={item.logo}
                  alt={item.productName}
                  className="h-10 w-10"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span>{item.productName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.description}
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
