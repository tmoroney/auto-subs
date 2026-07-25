import * as React from "react";
import { useTranslation } from "react-i18next";
import { ProcessingStepItem } from "@/components/processing/processing-step-item";
import type { ProcessingStep } from "./utils";

interface ProcessingStepsListProps {
  steps: ProcessingStep[];
  isProcessing?: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
}

/**
 * Vertical stepper for the granular pipeline steps.
 *
 * This is the status surface: it says what is happening and how far along it is,
 * and nothing more. It deliberately renders each fact exactly once — the
 * previous version rendered the active step as a hero card *and* as a list row,
 * so the same title and percentage appeared two or three times.
 */
export function ProcessingStepsList({
  steps,
  isProcessing = false,
  containerRef,
}: ProcessingStepsListProps) {
  const { t } = useTranslation();

  const visibleSteps =
    isProcessing && steps.length === 0
      ? [
          {
            id: "prepare.normalize",
            title: t("progressSteps.prepare", "Preparing audio and models"),
            progress: 0,
            isActive: true,
            isCompleted: false,
          },
        ]
      : steps;

  const allCompleted =
    visibleSteps.length > 0 && visibleSteps.every((step) => step.isCompleted);
  const isComplete = !isProcessing && allCompleted;

  // Several Prepare steps run concurrently, so there can be more than one active
  // step. The headline tracks the furthest one along the pipeline, which is what
  // the user perceives as "where we are".
  const lastActiveIndex = visibleSteps.reduce(
    (acc, step, index) => (step.isActive ? index : acc),
    -1,
  );
  const headlineIndex = isComplete
    ? -1
    : lastActiveIndex >= 0
      ? lastActiveIndex
      : visibleSteps.findIndex((step) => !step.isCompleted);
  const headlineStep =
    headlineIndex >= 0 ? visibleSteps[headlineIndex] : undefined;

  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto"
      style={{
        maskImage: "linear-gradient(to bottom, black 90%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, black 90%, transparent 100%)",
      }}
    >
      <div ref={containerRef} className="w-full relative z-10 px-1.5 pt-1 pb-4">
        {(headlineStep || isComplete) && (
          <div className="mb-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {isComplete
                ? t("progressSteps.complete", { defaultValue: "Complete" })
                : t("progressSteps.stepCounter", {
                    current: headlineIndex + 1,
                    total: visibleSteps.length,
                    defaultValue: `Step {{current}} of {{total}}`,
                  })}
            </p>
            <h3 className="truncate text-base font-semibold">
              {isComplete
                ? t("progressSteps.transcriptReady", {
                    defaultValue: "Transcript is ready",
                  })
                : headlineStep!.title}
            </h3>
          </div>
        )}

        <div className="flex flex-col">
          {visibleSteps.map((step, index) => (
            <ProcessingStepItem
              key={step.id ?? index}
              title={step.title}
              detail={step.detail}
              progress={step.progress}
              isActive={step.isActive}
              isCompleted={step.isCompleted}
              isCancelled={step.isCancelled}
              isLast={index === visibleSteps.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
