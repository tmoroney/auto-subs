import * as React from "react";
import { platform } from "@tauri-apps/plugin-os";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWordReveal } from "@/hooks/use-word-reveal";
import { useAlignmentPlayhead } from "@/hooks/use-alignment-playhead";
import { DRAFT_EASE, SCROLL_MS, SETTLE_MS, draftEase } from "@/lib/draft-motion";
import { FlipTimecode } from "@/components/subtitles/flip-timecode";
import type { DraftSubtitle } from "@/types";

interface DraftTranscriptPanelProps {
  segments: DraftSubtitle[];
  /** True once the run has finished, so any in-flight reveal fast-forwards. */
  isComplete?: boolean;
  /**
   * Progress of the step currently running, 0-100. Drawn as a hairline along
   * the top edge so the user has global context without having to be scrolled
   * somewhere they did not choose to be.
   */
  progress?: number;
  isFullScreen?: boolean;
  onClose?: () => void;
}

/** Split into words while keeping the original spacing recoverable. */
function splitWords(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

/** Distance from the bottom, in px, still treated as "pinned to the bottom". */
const BOTTOM_THRESHOLD = 40;

/**
 * Stable colour per speaker id. Derived from the id itself so the same speaker
 * keeps the same colour across renders without needing the speakers list, which
 * does not exist yet while the transcript is still a draft.
 *
 * Only ever used as a small solid swatch, never behind text: a hash-chosen hue
 * has no guaranteed contrast against either theme, so the label itself stays on
 * the theme's own foreground colours and the colour is purely an identifier.
 */
function speakerColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash % 360)}, 65%, 55%)`;
}

/**
 * The live transcript as it is being produced.
 *
 * This deliberately looks *unfinished*: reduced contrast, dimmed timestamps and
 * no card borders. The segments it shows are pre-formatting — they can be far
 * longer than the user's configured line length and may still be untranslated —
 * so the styling and the header have to communicate "draft, still improving"
 * without the user having to be told. It occupies the same slot as the real
 * subtitle viewer, which replaces it on completion, so there is no jarring
 * layout change at the finish line; the panel simply becomes interactive.
 */
export function DraftTranscriptPanel({
  segments,
  isComplete = false,
  progress,
  isFullScreen = false,
  onClose,
}: DraftTranscriptPanelProps) {
  const { t } = useTranslation();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [isMacOs, setIsMacOs] = React.useState(true);

  // Once the user scrolls away from the bottom we stop following, so reading
  // back through the transcript is not fought by incoming segments.
  const isFollowingRef = React.useRef(true);
  // The scroll position we last set ourselves. Anything else arriving through
  // the scroll handler is the user, which is the escape hatch out of following.
  const ownScrollTopRef = React.useRef<number | null>(null);
  const rowRefs = React.useRef<Map<number, HTMLDivElement>>(new Map());
  const wasAligningRef = React.useRef(false);
  // Active rAF id for a smooth scroll, so a new target or the end of the pass
  // can cancel it.
  const scrollAnimRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    try {
      setIsMacOs(platform() === "macos");
    } catch {
      setIsMacOs(false);
    }
  }, []);

  /** Scroll without the handler mistaking it for the user taking over. */
  const scrollTo = React.useCallback((el: HTMLDivElement, top: number) => {
    el.scrollTop = top;
    // Read back: the browser clamps, so the assigned value is not necessarily
    // the resulting one.
    ownScrollTopRef.current = el.scrollTop;
  }, []);

  /**
   * Smooth-scroll to `top` over SCROLL_MS on the shared draft easing.
   *
   * Used only to follow the alignment playhead from one segment to the next.
   * Updates `ownScrollTopRef` every frame so the scroll handler still treats
   * each frame as "ours" and not the user taking over; if the user does scroll
   * mid-flight, `isFollowingRef` flips false and the next frame aborts. A new
   * target cancels any in-flight animation, so fast segment-to-segment moves
   * retarget instead of stacking.
   */
  const smoothScrollTo = React.useCallback(
    (el: HTMLDivElement, top: number) => {
      if (scrollAnimRef.current !== null) {
        cancelAnimationFrame(scrollAnimRef.current);
        scrollAnimRef.current = null;
      }
      const start = el.scrollTop;
      const delta = top - start;
      if (Math.abs(delta) <= 1) {
        scrollTo(el, top);
        return;
      }
      const startTime = performance.now();
      const step = (now: number) => {
        // The user took over: abandon the animation where it stands.
        if (!isFollowingRef.current) {
          scrollAnimRef.current = null;
          return;
        }
        const t = Math.min(1, (now - startTime) / SCROLL_MS);
        const next = start + delta * draftEase(t);
        el.scrollTop = next;
        ownScrollTopRef.current = el.scrollTop;
        if (t < 1) {
          scrollAnimRef.current = requestAnimationFrame(step);
        } else {
          scrollAnimRef.current = null;
        }
      };
      scrollAnimRef.current = requestAnimationFrame(step);
    },
    [scrollTo],
  );

  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const own = ownScrollTopRef.current;
    if (own !== null && Math.abs(el.scrollTop - own) <= 2) return;
    if (wasAligningRef.current) {
      // During the alignment pass any manual scroll means "leave me alone".
      isFollowingRef.current = false;
      return;
    }
    isFollowingRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }, []);

  const present = React.useMemo(
    () => segments.filter((segment): segment is DraftSubtitle => Boolean(segment)),
    [segments],
  );

  // Tokenise once per render pass so both the reveal queue and the renderer work
  // from the same token list.
  const tokenised = React.useMemo(
    () => present.map((segment) => splitWords(segment.text ?? "")),
    [present],
  );
  const wordCounts = React.useMemo(
    () => tokenised.map((tokens) => tokens.length),
    [tokenised],
  );
  const revealLimitFor = useWordReveal(wordCounts, isComplete);
  const playhead = useAlignmentPlayhead(present, isComplete);
  const isAligning = playhead !== null;
  const playheadIndex = playhead?.index ?? null;

  // Runs on every render rather than only when the segment count changes: the
  // per-word reveal grows the content height continuously, so following the
  // bottom has to keep up with that too, not just with new cards. Suppressed
  // during alignment, which follows the playhead instead.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && !isAligning && isFollowingRef.current) {
      scrollTo(el, el.scrollHeight);
    }
  });

  // Follow the segment being aligned. Alignment is sequential per segment, so
  // following it is genuinely informative — unlike a whole-document pass, where
  // moving the user would be noise.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (playheadIndex === null) {
      // Pass ended: cancel any in-flight smooth scroll so it does not drift
      // after the playhead is gone.
      if (scrollAnimRef.current !== null) {
        cancelAnimationFrame(scrollAnimRef.current);
        scrollAnimRef.current = null;
      }
      wasAligningRef.current = false;
      return;
    }
    if (!wasAligningRef.current) {
      wasAligningRef.current = true;
      // One instant reposition at the start of the pass. An instant jump reads
      // as a cut; a long smooth scroll back to the top reads as travel and is
      // far more disorienting.
      isFollowingRef.current = true;
      scrollTo(el, 0);
    }
    if (!isFollowingRef.current) return;
    const row = rowRefs.current.get(playheadIndex);
    if (!row) return;
    smoothScrollTo(
      el,
      Math.max(0, row.offsetTop - el.clientHeight / 2 + row.clientHeight / 2),
    );
  }, [playheadIndex, scrollTo, smoothScrollTo]);

  // Reset following when a new run clears the list.
  React.useEffect(() => {
    if (present.length === 0) {
      if (scrollAnimRef.current !== null) {
        cancelAnimationFrame(scrollAnimRef.current);
        scrollAnimRef.current = null;
      }
      isFollowingRef.current = true;
      wasAligningRef.current = false;
      rowRefs.current.clear();
    }
  }, [present.length]);

  const speakerBase = React.useMemo(() => {
    // speaker_id may be 0-based or 1-based depending on the diarizer output;
    // detect once so "Speaker 1" is not mislabelled as "Speaker 2".
    return present.some((segment) => String(segment.speaker_id) === "0") ? 0 : 1;
  }, [present]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className="flex shrink-0 items-center justify-between px-3 pt-2"
        data-tauri-drag-region={isMacOs ? true : undefined}
      >
        <div
          className={cn("select-none", isFullScreen && isMacOs ? "pl-20" : "pl-1")}
          data-tauri-drag-region={isMacOs ? true : undefined}
        >
          <h2
            className="flex items-center gap-2 font-semibold"
            data-tauri-drag-region={isMacOs ? true : undefined}
          >
            {t("subtitles.draftTitle", "Draft transcript")}
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("subtitles.draftDescription", "Improving as each step completes")}
          </p>
        </div>
        <div
          className="z-20 flex items-center"
          data-tauri-drag-region={isMacOs ? "false" : undefined}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={!onClose}
          >
            <X />
          </Button>
        </div>
      </div>

      {/* `--border` already carries its own alpha, so an opacity modifier
          (`bg-border/40`) produces an invalid `hsl(... / .2 / .4)` and silently
          falls back to currentColor. Use the token as-is. */}
      <div className="mt-2 h-px w-full shrink-0 bg-border">
        <div
          className="h-full bg-primary/60"
          style={{
            width: `${Math.max(0, Math.min(100, progress ?? 0))}%`,
            transition: `width ${SETTLE_MS}ms ${DRAFT_EASE}`,
          }}
        />
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative min-h-0 flex-1 overflow-y-auto"
      >
        {present.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t("subtitles.draftEmpty", "Listening for speech…")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {present.map((segment, index) => {
              const speakerId = segment.speaker_id;
              const hasSpeaker = Boolean(speakerId) && speakerId !== "?";
              const color = hasSpeaker ? speakerColor(String(speakerId)) : undefined;
              const speakerNumber = hasSpeaker
                ? Number(speakerId) - speakerBase + 1
                : null;

              const limit = revealLimitFor(index);
              const tokens = tokenised[index] ?? [];
              const visibleText =
                limit === Infinity ? segment.text : tokens.slice(0, limit).join("");

              // Nothing revealed yet: hold the row back entirely rather than
              // rendering an empty card.
              if (!visibleText.trim()) return null;

              // The playhead only ever sits on a segment the aligner has just
              // refined, so `words` is guaranteed present by the hook.
              const activeWord = playhead?.index === index ? playhead.word : null;
              const words = segment.words ?? [];

              return (
                <div
                  key={index}
                  ref={(node) => {
                    if (node) rowRefs.current.set(index, node);
                    else rowRefs.current.delete(index);
                  }}
                  className={cn(
                    "animate-draft-rise flex flex-col gap-1 border-b px-3 py-2.5",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "font-mono text-xs tabular-nums",
                        // One timestamp, in one fixed place, tracking the word
                        // under the playhead. Monospace and same width, so the
                        // layout does not move as it rolls.
                        activeWord !== null
                          ? "text-foreground/80"
                          : "text-muted-foreground/60",
                      )}
                    >
                      <FlipTimecode
                        seconds={
                          activeWord !== null && playhead ? playhead.time : segment.start
                        }
                        animate={activeWord !== null}
                      />
                    </span>
                    {hasSpeaker && (
                      <span className="flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        {t("subtitles.speakerLabel", {
                          number: Number.isFinite(speakerNumber) ? speakerNumber : speakerId,
                          defaultValue: `Speaker {{number}}`,
                        })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {activeWord !== null && words.length > 0
                      ? words.map((word, wordIndex) => (
                          <React.Fragment key={wordIndex}>
                            {wordIndex > 0 && " "}
                            <span
                              className={cn(
                                "rounded px-0.5",
                                wordIndex < activeWord && "text-foreground",
                                wordIndex === activeWord &&
                                  "bg-primary/15 text-foreground",
                              )}
                            >
                              {word.word.trim()}
                            </span>
                          </React.Fragment>
                        ))
                      : visibleText}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
