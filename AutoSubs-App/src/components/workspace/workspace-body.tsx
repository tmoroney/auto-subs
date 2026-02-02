import * as React from "react"
import { Heart } from "lucide-react"
import { ProcessingStepItem } from "@/components/processing-step-item"
import { Settings, TimelineInfo } from "@/types/interfaces"
import { useTranslation } from "react-i18next"

export function WorkspaceBody({
  processingSteps,
  showLoadingMessage,
  progressContainerRef,
  onExportToFile,
  onAddToTimeline,
  livePreviewSegments,
  settings,
  timelineInfo,
}: {
  processingSteps: any[]
  showLoadingMessage: boolean
  progressContainerRef: React.RefObject<HTMLDivElement>
  onExportToFile: () => void
  onAddToTimeline: (selectedOutputTrack: string, selectedTemplate: string) => Promise<void>
  livePreviewSegments: any
  settings: Settings
  timelineInfo: TimelineInfo
}) {
  const { t } = useTranslation()

  return (
    <div className="flex-1">
      {processingSteps.length > 0 ? (
        <div ref={progressContainerRef} className="w-full px-4 pb-8 overflow-y-auto h-full relative z-10" style={{
          maskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)'
        }}>
          <div className="flex flex-col gap-3">
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
      ) : showLoadingMessage ? (
        <div className="flex flex-col items-center justify-center h-full space-y-3 pb-14 relative z-10">
          <div className="bg-background/10 backdrop-blur-sm rounded-md px-3 py-2">
            <p className="text-base font-medium text-foreground animate-pulse">
              {t("workspace.empty.loadingModel")}
            </p>
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
