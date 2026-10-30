import * as React from "react";
import { FileAudio } from "lucide-react";
import type { DraftSubtitle } from "@/types";
import { groupTranscriptSegments } from "@/utils/group-transcript-segments";

interface LiveTranscriptProps {
  segments: DraftSubtitle[];
  sourceName: string;
  projectName?: string;
  title: string;
  language: string;
  modelName: string;
  isFileMode: boolean;
  diarizationEnabled: boolean;
}

function formatStartTime(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

export function LiveTranscript({
  segments,
  sourceName,
  projectName,
  title,
  language,
  modelName,
  isFileMode,
  diarizationEnabled,
}: LiveTranscriptProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const shouldFollowRef = React.useRef(true);
  const blocks = React.useMemo(
    () => groupTranscriptSegments(segments, diarizationEnabled),
    [segments, diarizationEnabled],
  );

  React.useLayoutEffect(() => {
    if (blocks.length === 0) {
      shouldFollowRef.current = true;
      return;
    }
    const element = scrollRef.current;
    if (element && shouldFollowRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [blocks]);

  const handleScroll = React.useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    shouldFollowRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  }, []);

  return (
    <div
      ref={scrollRef}
      className="as-live-scroll"
      onScroll={handleScroll}
    >
      <div className="as-setup-content as-live-content">
        <div className="as-eyebrow">
          {isFileMode ? (
            <FileAudio className="as-file-source-icon" aria-hidden="true" />
          ) : (
            <span className="as-source-dot" />
          )}
          {sourceName}
          {!isFileMode && projectName && (
            <span className="as-eyebrow-meta">· {projectName}</span>
          )}
        </div>
        <h1 className="as-title">{title}</h1>
        <div className="as-meta">
          {language}
          {language && modelName ? " · " : ""}
          {modelName}
        </div>
        <div className="as-live-transcript" aria-live="polite">
          {blocks.map((block, blockIndex) => {
            const latestBlock = blockIndex === blocks.length - 1;
            const startTime = block.segments[0]?.start ?? 0;
            return (
              <div className="as-live-block" key={`${startTime}-${blockIndex}`}>
                <span className="as-live-time">{formatStartTime(startTime)}</span>
                <p className="as-live-text">
                  {block.segments.map((segment, segmentIndex) => {
                    const text = segment.text.trim();
                    const latestSegment =
                      latestBlock && segmentIndex === block.segments.length - 1;
                    return (
                      <React.Fragment key={`${segment.start}-${segmentIndex}`}>
                        {segmentIndex > 0 ? " " : ""}
                        <span className={latestSegment ? "as-live-pending" : undefined}>
                          {text}
                        </span>
                      </React.Fragment>
                    );
                  })}
                  {latestBlock && (
                    <span className="as-live-caret" aria-hidden="true" />
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
