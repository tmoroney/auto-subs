import * as React from "react"
import { Heart } from "lucide-react"
import { ProcessingStepItem } from "@/components/processing-step-item"

export function WorkspaceBody({
  processingSteps,
  showLoadingMessage,
  progressContainerRef,
  onExportToFile,
  onAddToTimeline,
  livePreviewSegments,
}: {
  processingSteps: any[]
  showLoadingMessage: boolean
  progressContainerRef: React.RefObject<HTMLDivElement>
  onExportToFile: () => void
  onAddToTimeline: () => void
  livePreviewSegments: any
}) {
  return (
    <>
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
                />
              </div>
            ))}
          </div>
        </div>
      ) : showLoadingMessage ? (
        <div className="flex flex-col items-center justify-center h-full space-y-3 pb-14 relative z-10">
          <div className="bg-background/10 backdrop-blur-sm rounded-md px-3 py-2">
            <p className="text-base font-medium text-foreground animate-pulse">
              Loading model into memory...
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full space-y-3 pb-14">
          <img
            src="/autosubs-logo.png"
            alt="AutoSubs"
            className="w-20 h-20"
          />
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-semibold text-foreground">
              Welcome to AutoSubs
            </h2>
            <p className="text-muted-foreground max-w-72">
              Select an audio source to start generating subtitles.
            </p>

            {/* Support Button */}
            <a
              href="https://buymeacoffee.com/tmoroney"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-full border border-pink-200 dark:border-pink-800 bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900/50 transition-colors"
            >
              <Heart className="h-3 w-3 group-hover:fill-pink-500 fill-background transition-colors" />
              Support AutoSubs

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
          </div>
        </div>
      )}
    </>
  )
}
