import * as React from "react";
import { Joyride, STATUS } from "react-joyride";
import type { Step, EventData, TooltipRenderProps } from "react-joyride";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/contexts/SettingsContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function TourBeacon() {
  return (
    <span className="relative flex h-5 w-5 pt-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-90" />
      <span className="relative inline-flex rounded-full h-5 w-5 bg-primary" />
    </span>
  );
}

function TourTooltip({
  continuous,
  index,
  isLastStep,
  size,
  step,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
}: TooltipRenderProps) {
  return (
    <Card
      className="w-80 p-4 shadow-xl border bg-card text-card-foreground"
      {...tooltipProps}
    >
      {step.title && (
        <h3 className="text-base font-semibold mb-1.5">{step.title}</h3>
      )}
      <div className="text-sm text-muted-foreground mb-4 leading-relaxed">
        {step.content}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {continuous && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                {...skipProps}
              >
                {skipProps.title}
              </Button>
              {index > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  {...backProps}
                >
                  {backProps.title}
                </Button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {continuous && (
            <span className="text-xs text-muted-foreground">
              {index + 1} / {size}
            </span>
          )}
          <Button
            size="sm"
            className="h-8 text-xs"
            {...primaryProps}
          >
            {isLastStep ? primaryProps.title : primaryProps.title}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function OnboardingTour() {
  const { t } = useTranslation();
  const { updateSetting } = useSettings();
  const [run, setRun] = React.useState(true);

  const steps: Step[] = React.useMemo(
    () => [
      {
        target: '[data-tour="connection-indicator"]',
        title: t("tour.connection.title"),
        content: t("tour.connection.description"),
        disableBeacon: true,
        offset: -16,
        placement: "bottom",
      },
      {
        target: '[data-tour="mode-switcher"]',
        title: t("tour.modeSwitcher.title"),
        content: t("tour.modeSwitcher.description"),
        offset: -16,
        placement: "bottom",
      },
      {
        target: '[data-tour="model-picker"]',
        title: t("tour.modelPicker.title"),
        content: t("tour.modelPicker.description"),
        offset: -16,
        placement: "bottom",
      },
      {
        target: '[data-tour="audio-input"]',
        title: t("tour.audioInput.title"),
        content: t("tour.audioInput.description"),
        offset: -10,
        placement: "top",
      },
      {
        target: '[data-tour="transcription-controls"]',
        title: t("tour.controls.title"),
        content: t("tour.controls.description"),
        offset: -16,
        placement: "top",
      },
      {
        target: '[data-tour="history-button"]',
        title: t("tour.history.title"),
        content: t("tour.history.description"),
        disableBeacon: true,
        offset: -16,
        placement: "bottom",
      },
    ],
    [t]
  );

  const handleEvent = React.useCallback(
    (data: EventData) => {
      const { status } = data;
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        setRun(false);
        updateSetting("tourCompleted", true);
      }
    },
    [updateSetting]
  );

  return (
    <Joyride
      run={run}
      steps={steps}
      continuous
      onEvent={handleEvent}
      tooltipComponent={TourTooltip}
      beaconComponent={TourBeacon}
      arrowComponent={() => null}
      locale={{
        skip: t("tour.skip"),
        next: t("tour.next"),
        back: t("common.back"),
        last: t("tour.finish"),
        close: t("common.close"),
      }}
    />
  );
}
