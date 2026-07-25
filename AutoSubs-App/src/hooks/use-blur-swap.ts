import * as React from "react";
import { BLUR_SWAP_MS, prefersReducedMotion } from "@/lib/draft-motion";

/**
 * Defers a content swap to the peak of a blur-and-fade, so a wholesale
 * replacement of a list reads as a transition rather than a jump cut.
 *
 * Used for the draft transcript -> final subtitles hand-off. Formatting is a
 * global re-segmentation, so there is no card-to-card correspondence to animate;
 * the honest presentation is "the whole thing was rewritten", and the blur is
 * what makes that acceptable to look at.
 *
 * @param value The target state to display.
 * @returns The value to render right now, plus the class to apply to the
 *   container while the transition is in flight.
 */
export function useBlurSwap<T>(value: T): { displayed: T; className: string } {
  const [displayed, setDisplayed] = React.useState<T>(value);
  const [phase, setPhase] = React.useState<"idle" | "out" | "in">("idle");

  React.useEffect(() => {
    if (Object.is(displayed, value)) return;

    if (prefersReducedMotion()) {
      setDisplayed(value);
      return;
    }

    setPhase("out");
    const swap = window.setTimeout(() => {
      // At the peak: the new content mounts already scrolled to the top, which
      // is exactly the reposition we want and costs nothing to perform.
      setDisplayed(value);
      setPhase("in");
    }, BLUR_SWAP_MS);
    const settle = window.setTimeout(() => setPhase("idle"), BLUR_SWAP_MS * 2);

    return () => {
      window.clearTimeout(swap);
      window.clearTimeout(settle);
    };
  }, [value, displayed]);

  const className =
    phase === "out"
      ? "animate-blur-scroll-out"
      : phase === "in"
        ? "animate-blur-scroll-in"
        : "";

  return { displayed, className };
}
