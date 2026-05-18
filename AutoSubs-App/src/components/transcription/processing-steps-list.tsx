import * as React from "react";
import { ProcessingStepItem } from "@/components/processing/processing-step-item";
import { useSettings } from "@/contexts/SettingsContext";
import type { TimelineInfo } from "@/types";
import type { ProcessingStep } from "./utils";

interface ProcessingStepsListProps {
  steps: ProcessingStep[];
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
}

export function ProcessingStepsList({
  steps,
  containerRef,
  livePreviewSegments,
  timelineInfo,
  selectedIntegration,
  onExportToFile,
  onAddToTimeline,
  onViewSubtitles,
}: ProcessingStepsListProps) {
  const { settings: currentSettings } = useSettings();

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
        <div className="flex flex-col gap-2">
          {steps.map((step) => (
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
                livePreviewSegments={livePreviewSegments}
                settings={currentSettings}
                timelineInfo={timelineInfo}
                selectedIntegration={selectedIntegration}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
