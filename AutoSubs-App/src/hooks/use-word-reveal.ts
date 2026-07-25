import * as React from "react";
import {
  INSTANT_MODE_BACKLOG,
  WORD_REVEAL_MS,
  prefersReducedMotion,
} from "@/lib/draft-motion";

interface RevealCursor {
  /** Index of the segment currently being revealed. */
  index: number;
  /** Number of words already revealed within that segment. */
  words: number;
}

/**
 * Paces the reveal of already-received segment text, word by word.
 *
 * Note what this is and is not: the words are real and already in hand, so this
 * only controls *when* they are shown. Pacing real content is fine; inventing
 * content is not. Nothing here fabricates text.
 *
 * The queue is backlog-aware. Segments arrive in bursts — a small model on a
 * fast GPU can produce them far quicker than 25ms per word — so when the cursor
 * falls more than `INSTANT_MODE_BACKLOG` segments behind, it abandons the
 * per-word reveal and jumps to the newest segment. A preview visibly seconds
 * behind the progress bar is worse than no animation at all.
 *
 * @param wordCounts Number of words in each segment, in display order.
 * @param isComplete When true, everything is revealed immediately. The animation
 *   must never outlive the work.
 * @returns `limitFor(index)` — how many words of that segment to render.
 *   `Infinity` means "all of it".
 */
export function useWordReveal(
  wordCounts: number[],
  isComplete: boolean,
): (index: number) => number {
  const [cursor, setCursor] = React.useState<RevealCursor>({ index: 0, words: 0 });

  // The counts array is rebuilt every render, so the interval reads it through a
  // ref instead of taking it as a dependency and restarting the timer each time.
  const countsRef = React.useRef(wordCounts);
  countsRef.current = wordCounts;

  const total = wordCounts.length;

  React.useEffect(() => {
    if (total === 0) {
      setCursor({ index: 0, words: 0 });
    }
  }, [total]);

  React.useEffect(() => {
    // Fast-forward: the run is over, or the user does not want motion.
    if (isComplete || prefersReducedMotion()) {
      setCursor({ index: Number.MAX_SAFE_INTEGER, words: 0 });
      return;
    }
    if (total === 0) return;

    const id = window.setInterval(() => {
      setCursor((prev) => {
        const counts = countsRef.current;
        if (prev.index >= counts.length) return prev;

        // Too far behind to be useful: skip to the newest segment and show the
        // intervening ones in full.
        if (counts.length - 1 - prev.index > INSTANT_MODE_BACKLOG) {
          return { index: counts.length - 1, words: 0 };
        }

        const wordsInSegment = counts[prev.index] ?? 0;
        if (prev.words + 1 >= wordsInSegment) {
          return { index: prev.index + 1, words: 0 };
        }
        return { index: prev.index, words: prev.words + 1 };
      });
    }, WORD_REVEAL_MS);

    return () => window.clearInterval(id);
  }, [total, isComplete]);

  return React.useCallback(
    (index: number) => {
      if (index < cursor.index) return Infinity;
      if (index > cursor.index) return 0;
      return cursor.words;
    },
    [cursor],
  );
}
