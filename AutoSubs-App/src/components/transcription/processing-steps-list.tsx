import * as React from "react";
import { useTranslation } from "react-i18next";
import { ProcessingStepItem } from "@/components/processing/processing-step-item";
import { ActivePhaseVisualizer } from "@/components/processing/active-phase-visualizer";
import type { TimelineInfo } from "@/types";
import type { ProcessingStep } from "./utils";

interface ProcessingStepsListProps {
  steps: ProcessingStep[];
  isProcessing?: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  livePreviewSegments: any[];
  timelineInfo: TimelineInfo;
  selectedIntegration: "davinci" | "premiere" | "aftereffects";
  onExportToFile: () => void;
  onAddToTimeline: (
    selectedOutputTrack: string,
    selectedTemplate: string,
    presetSettings?: Record<string, unknown>,
  ) => Promise<void>;
  onViewSubtitles?: () => void;
  isSubtitleViewerOpen?: boolean;
}

export function ProcessingStepsList({
  steps,
  isProcessing = false,
  containerRef,
  livePreviewSegments,
  timelineInfo,
  selectedIntegration,
  onExportToFile,
  onAddToTimeline,
  onViewSubtitles,
  isSubtitleViewerOpen = false,
}: ProcessingStepsListProps) {
  const { t } = useTranslation();

  const visibleSteps =
    isProcessing && steps.length === 0
      ? [
          {
            id: "Prepare",
            title: t("progressSteps.prepare", "Preparing audio and models"),
            description: t("progressSteps.processing", "Processing"),
            progress: 0,
            isActive: true,
            isCompleted: false,
          },
        ]
      : steps;

  const currentStep =
    visibleSteps.find((s) => s.isActive) ||
    visibleSteps.find((s) => !s.isCompleted) ||
    visibleSteps[visibleSteps.length - 1];

  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto"
      style={{
        maskImage: "linear-gradient(to bottom, black 90%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, black 90%, transparent 100%)",
      }}
    >
      <div ref={containerRef} className="w-full relative z-10">
        <div className="flex flex-col gap-4">
          {currentStep && (
            <ActivePhaseVisualizer
              phase={currentStep.id || "Prepare"}
              progress={currentStep.progress}
              description={currentStep.description}
              livePreviewSegments={livePreviewSegments}
            />
          )}

          <div className="flex flex-col gap-3">
            {visibleSteps.map((step) => (
              <div key={step.id} className="w-full">
                <ProcessingStepItem
                  id={step.id}
                  title={step.title}
                  description={step.description}
                  progress={step.progress}
                  isActive={step.isActive}
                  isCompleted={step.isCompleted}
                  isCancelled={step.isCancelled}
                  onExportToFile={onExportToFile}
                  onAddToTimeline={onAddToTimeline}
                  onViewSubtitles={onViewSubtitles}
                  isSubtitleViewerOpen={isSubtitleViewerOpen}
                  timelineInfo={timelineInfo}
                  selectedIntegration={selectedIntegration}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
