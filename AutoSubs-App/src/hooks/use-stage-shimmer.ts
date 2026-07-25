import * as React from "react";
import { SHIMMER_MS, prefersReducedMotion } from "@/lib/draft-motion";
import type { DraftSubtitle, SegmentStage } from "@/types";

/**
 * Tracks which segments have just had their text replaced, so a one-shot
 * Shimmer can be played over them.
 *
 * Translation re-emits an existing segment index with new text. Without the
 * `stage` tag that is indistinguishable from a brand-new segment, and the text
 * would simply pop — which reads as a glitch rather than a transformation.
 *
 * Returns the set of indices currently shimmering.
 */
export function useStageShimmer(
  segments: DraftSubtitle[],
  stage: SegmentStage = "translate",
): Set<number> {
  const [active, setActive] = React.useState<Set<number>>(() => new Set());
  const previousStages = React.useRef<Map<number, SegmentStage | undefined>>(new Map());
  const timers = React.useRef<Map<number, number>>(new Map());

  React.useEffect(() => {
    if (prefersReducedMotion()) return;

    const started: number[] = [];
    segments.forEach((segment, index) => {
      if (!segment) return;
      const previous = previousStages.current.get(index);
      if (previous !== stage && segment.stage === stage) {
        started.push(index);
      }
      previousStages.current.set(index, segment.stage);
    });

    if (started.length === 0) return;

    setActive((prev) => {
      const next = new Set(prev);
      started.forEach((index) => next.add(index));
      return next;
    });

    started.forEach((index) => {
      const existing = timers.current.get(index);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        timers.current.delete(index);
        setActive((prev) => {
          if (!prev.has(index)) return prev;
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }, SHIMMER_MS);
      timers.current.set(index, timer);
    });
  }, [segments, stage]);

  // Reset between runs so a new transcript does not inherit stale state.
  React.useEffect(() => {
    if (segments.length === 0) {
      previousStages.current.clear();
      setActive((prev) => (prev.size === 0 ? prev : new Set()));
    }
  }, [segments.length]);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  return active;
}
