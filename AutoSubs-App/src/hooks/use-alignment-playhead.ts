import * as React from "react";
import {
  INSTANT_MODE_BACKLOG,
  MAX_WORD_GAP_MS,
  MIN_WORD_DWELL_MS,
  prefersReducedMotion,
} from "@/lib/draft-motion";
import type { DraftSubtitle, Word } from "@/types";

export interface PlayheadPosition {
  /** Index of the segment currently being traversed. */
  index: number;
  /** Index of the highlighted word within that segment's `words`. */
  word: number;
  /** Start time of the highlighted word, for the gutter timestamp. */
  time: number;
}

/** Fallback per-segment budget before any wall-clock evidence has arrived. */
const DEFAULT_BUDGET_MS = 400;
/** Bounds on the per-segment budget, so one slow or instant segment cannot skew the pass. */
const MIN_BUDGET_MS = 150;
const MAX_BUDGET_MS = 1200;
/** Weight of the newest sample in the rolling average of alignment wall-clock time. */
const BUDGET_SMOOTHING = 0.3;

interface Schedule {
  index: number;
  /** Offset, in ms from the start of the pass, at which each word becomes current. */
  offsets: number[];
  words: Word[];
  totalMs: number;
  startedAt: number;
}

/**
 * Builds the timing of one segment's playhead pass.
 *
 * The playhead carries *ratios, not absolute time*. Forced alignment runs several
 * times faster than realtime, so a realtime playhead would fall hopelessly behind
 * the work it is describing. Every word duration is therefore scaled by one common
 * factor chosen so the pass takes exactly as long as aligning that segment actually
 * took. Uniform compression leaves the relative proportions — which is where all
 * the information lives — completely intact: drawn-out words still linger, fast
 * ones still rip past.
 */
function buildSchedule(words: Word[], budgetMs: number): number[] {
  const count = words.length;
  const offsets = new Array<number>(count);

  // Not enough budget for any word to be perceptible: degrade to one uniform
  // pass. Faithful proportions below ~2 frames per word just read as flicker.
  if (budgetMs / count < MIN_WORD_DWELL_MS) {
    const dwell = Math.max(budgetMs / count, 16);
    for (let i = 0; i < count; i++) offsets[i] = i * dwell;
    return offsets;
  }

  const durations = words.map((word) => Math.max(0, (word.end - word.start) * 1000));
  const gaps = words.map((word, i) => {
    const next = words[i + 1];
    return next ? Math.max(0, (next.start - word.end) * 1000) : 0;
  });

  const raw = durations.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
  const scale = raw > 0 ? budgetMs / raw : 0;

  let cursor = 0;
  for (let i = 0; i < count; i++) {
    offsets[i] = cursor;
    // Word durations stay faithful (subject to the perceptibility floor); gaps
    // get squashed, because compressed silence reads as a stall, not a pause.
    const dwell = Math.max(durations[i] * scale, MIN_WORD_DWELL_MS);
    const gap = Math.min(gaps[i] * scale, MAX_WORD_GAP_MS);
    cursor += dwell + gap;
  }
  return offsets;
}

/**
 * A karaoke-style playhead that walks word by word through each segment as
 * forced alignment refines its timings.
 *
 * This is informational, not decorative: the rhythm is the real per-word timing
 * the aligner just produced, so the unevenness of the pass *is* the data. A
 * constant-speed playhead would communicate nothing.
 *
 * @param segments Live draft segments, keyed by their emitted index.
 * @param isComplete When true the pass is abandoned immediately — the animation
 *   must never outlive the work.
 * @returns The current position, or `null` when nothing is being aligned.
 */
export function useAlignmentPlayhead(
  segments: DraftSubtitle[],
  isComplete: boolean,
): PlayheadPosition | null {
  const [position, setPosition] = React.useState<PlayheadPosition | null>(null);

  const queueRef = React.useRef<number[]>([]);
  const claimedRef = React.useRef<Set<number>>(new Set());
  const activeRef = React.useRef<Schedule | null>(null);
  const lastArrivalRef = React.useRef<number | null>(null);
  const budgetRef = React.useRef<number>(DEFAULT_BUDGET_MS);
  const segmentsRef = React.useRef(segments);
  segmentsRef.current = segments;

  const total = segments.length;

  // Enqueue segments as the aligner reports them, and learn how fast it is going
  // from the gaps between arrivals.
  React.useEffect(() => {
    if (prefersReducedMotion() || isComplete) return;

    let arrived = false;
    segments.forEach((segment, index) => {
      if (!segment || segment.stage !== "align") return;
      if (claimedRef.current.has(index)) return;
      if (!segment.words || segment.words.length === 0) return;
      claimedRef.current.add(index);
      queueRef.current.push(index);
      arrived = true;
    });
    if (!arrived) return;

    const now = performance.now();
    const previous = lastArrivalRef.current;
    if (previous !== null) {
      const delta = now - previous;
      budgetRef.current =
        budgetRef.current * (1 - BUDGET_SMOOTHING) + delta * BUDGET_SMOOTHING;
    }
    lastArrivalRef.current = now;
  }, [segments, isComplete]);

  // Reset between runs.
  React.useEffect(() => {
    if (total !== 0) return;
    queueRef.current = [];
    claimedRef.current.clear();
    activeRef.current = null;
    lastArrivalRef.current = null;
    budgetRef.current = DEFAULT_BUDGET_MS;
    setPosition(null);
  }, [total]);

  React.useEffect(() => {
    if (prefersReducedMotion()) return;
    if (isComplete) {
      queueRef.current = [];
      activeRef.current = null;
      setPosition(null);
      return;
    }

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const now = performance.now();

      // Too far behind to be describing anything current: drop everything but
      // the newest segment. A playhead seconds behind the aligner is a lie.
      if (queueRef.current.length > INSTANT_MODE_BACKLOG) {
        queueRef.current = queueRef.current.slice(-1);
        activeRef.current = null;
      }

      let active = activeRef.current;
      if (!active) {
        const next = queueRef.current.shift();
        if (next === undefined) {
          setPosition((prev) => (prev === null ? prev : null));
          return;
        }
        const words = segmentsRef.current[next]?.words ?? [];
        if (words.length === 0) return;

        // Split the budget across anything still waiting, so a burst is absorbed
        // by speeding up rather than by falling behind.
        const budget = Math.min(
          MAX_BUDGET_MS,
          Math.max(MIN_BUDGET_MS, budgetRef.current / (queueRef.current.length + 1)),
        );
        const offsets = buildSchedule(words, budget);
        active = {
          index: next,
          words,
          offsets,
          totalMs: offsets[offsets.length - 1] + MIN_WORD_DWELL_MS,
          startedAt: now,
        };
        activeRef.current = active;
      }

      const elapsed = now - active.startedAt;
      if (elapsed >= active.totalMs) {
        activeRef.current = null;
        return;
      }

      let word = 0;
      for (let i = active.offsets.length - 1; i >= 0; i--) {
        if (active.offsets[i] <= elapsed) {
          word = i;
          break;
        }
      }

      // Only commit to state when the highlighted word actually changes, so the
      // panel re-renders per word (>= 40ms apart) rather than per frame.
      setPosition((prev) => {
        if (prev && prev.index === active!.index && prev.word === word) return prev;
        return { index: active!.index, word, time: active!.words[word]?.start ?? 0 };
      });
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isComplete]);

  return position;
}
