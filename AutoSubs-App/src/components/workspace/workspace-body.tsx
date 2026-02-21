import * as React from "react"
import { ProcessingStepItem } from "@/components/processing/processing-step-item"
import { Settings, TimelineInfo } from "@/types/interfaces"
import { useTranslation } from "react-i18next"

export function WorkspaceBody({
  processingSteps,
  progressContainerRef,
  onExportToFile,
  onAddToTimeline,
  livePreviewSegments,
  settings,
  timelineInfo,
}: {
  processingSteps: any[]
  progressContainerRef: React.RefObject<HTMLDivElement>
  onExportToFile: () => void
  onAddToTimeline: (selectedOutputTrack: string, selectedTemplate: string) => Promise<void>
  livePreviewSegments: any
  settings: Settings
  timelineInfo: TimelineInfo
}) {
  const { t } = useTranslation()

  return (
    <div className="h-full">
      {processingSteps.length > 0 ? (
        <div ref={progressContainerRef} className="w-full px-4 pb-6 relative z-10">
          <div className="flex flex-col gap-2">
            {processingSteps.map((step) => (
              <div key={step.id} className="w-full">
                <ProcessingStepItem
                  id={step.id}
                  title={step.title}
                  progress={step.progress}
                  isActive={step.isActive}
                  isCompleted={step.isCompleted}
                  isCancelled={step.isCancelled}
                  onExportToFile={onExportToFile}
                  onAddToTimeline={onAddToTimeline}
                  livePreviewSegments={livePreviewSegments}
                  settings={settings}
                  timelineInfo={timelineInfo}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full space-y-2 pb-12 text-center">
          <img
            src="/autosubs-logo.png"
            alt="AutoSubs"
            className="w-16 h-16"
          />
          <h2 className="text-lg font-semibold">
            {t("workspace.empty.welcomeTitle")}
          </h2>
          <p className="max-w-72 pb-2">
            {t("workspace.empty.welcomeDescription")}
          </p>
        </div>
      )}
    </div>
  )
}
