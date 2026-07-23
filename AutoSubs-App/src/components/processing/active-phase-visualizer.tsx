import { useTranslation } from "react-i18next";
import { SegmentPreview } from "@/components/processing/segment-preview";
import { Subtitle } from "@/types";
import { cn } from "@/lib/utils";

interface ActivePhaseVisualizerProps {
  phase: string;
  progress: number;
  description?: string;
  livePreviewSegments: Subtitle[];
}

function WaveBars({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-end justify-center gap-1 h-16", className)}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="w-1.5 bg-primary/80 rounded-full animate-pulse"
          style={{
            height: `${20 + Math.random() * 60}%`,
            animationDelay: `${i * 0.05}s`,
            animationDuration: `${0.6 + Math.random() * 0.6}s`,
          }}
        />
      ))}
    </div>
  );
}

function SpeakerBlocks({ className }: { className?: string }) {
  const speakers = ["1", "2", "?"];
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500"];
  return (
    <div className={cn("flex flex-col gap-1.5 w-full", className)}>
      {Array.from({ length: 5 }).map((_, i) => {
        const speakerIdx = i % speakers.length;
        return (
          <div
            key={i}
            className={cn(
              "h-3 rounded-full opacity-80 animate-pulse",
              colors[speakerIdx]
            )}
            style={{
              width: `${40 + Math.random() * 55}%`,
              marginLeft: `${speakerIdx * 8}%`,
              animationDelay: `${i * 0.1}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function WordTokens({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5 justify-center", className)}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="px-2 py-1 rounded-md bg-primary/10 text-xs text-primary animate-bounce"
          style={{ animationDelay: `${i * 0.05}s`, animationDuration: "1s" }}
        >
          word
        </div>
      ))}
    </div>
  );
}

function FormattingCheck({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-4 border-primary/30 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-primary/20 animate-ping" />
        </div>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-8 h-2 rounded-full bg-muted animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    </div>
  );
}

export function ActivePhaseVisualizer({
  phase,
  progress,
  description,
  livePreviewSegments,
}: ActivePhaseVisualizerProps) {
  const { t } = useTranslation();

  const title = t(`progressSteps.${phase.toLowerCase()}`, phase);

  return (
    <div className="w-full rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {description || t("progressSteps.processing", "Processing")}
          </p>
        </div>
        <span className="text-sm tabular-nums font-medium">{Math.round(progress)}%</span>
      </div>

      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>

      <div className="min-h-[4rem]">
        {phase === "Transcribe" ? (
          <SegmentPreview
            segments={livePreviewSegments}
            isActive={true}
            placeholder={description}
          />
        ) : phase === "Prepare" ? (
          <div className="flex flex-col gap-3">
            <WaveBars />
            <div className="flex flex-wrap gap-2 justify-center">
              <div className="px-2 py-1 rounded-md bg-muted text-xs animate-pulse">audio</div>
              <div className="px-2 py-1 rounded-md bg-muted text-xs animate-pulse" style={{ animationDelay: "0.1s" }}>models</div>
              <div className="px-2 py-1 rounded-md bg-muted text-xs animate-pulse" style={{ animationDelay: "0.2s" }}>cache</div>
            </div>
          </div>
        ) : phase === "Analyze" ? (
          <div className="flex flex-col gap-3">
            <WaveBars className="opacity-60" />
            <SpeakerBlocks />
          </div>
        ) : phase === "Refine" ? (
          <WordTokens />
        ) : phase === "Finish" ? (
          <FormattingCheck />
        ) : (
          <WaveBars />
        )}
      </div>
    </div>
  );
}
