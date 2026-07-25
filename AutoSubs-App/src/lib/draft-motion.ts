/**
 * Shared timing constants for the draft transcript animations.
 *
 * These mirror the CSS in `App.css`. Anything JS-driven (the reveal queue, the
 * alignment playhead) must use these rather than its own numbers, so the whole
 * surface shares one easing curve and one rhythm.
 *
 * Design rules, deliberately narrow:
 *  - One easing curve everywhere. Do not add a second.
 *  - Durations stay in the 150–250ms band. Longer reads as sluggish, not premium.
 *  - Siblings stagger by STAGGER_MS. This is the cheapest way to feel expensive.
 */

/** The single easing curve, as a CSS value. */
export const DRAFT_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/** The same curve as a cubic-bezier tuple, for the `motion` library. */
export const DRAFT_EASE_POINTS = [0.32, 0.72, 0, 1] as const;

/**
 * The same curve as a JS function, for rAF-driven motion that cannot use a CSS
 * cubic-bezier string (e.g. scrollTop animation). Solves x(s)=t for s via
 * Newton-Raphson, then returns y(s). x is monotonic for any valid CSS easing,
 * so this converges in a handful of iterations. Keeps JS-driven animation on
 * the one curve this surface allows.
 */
const [BEZIER_X1, BEZIER_Y1, BEZIER_X2, BEZIER_Y2] = DRAFT_EASE_POINTS;
function bezierAxis(s: number, p1: number, p2: number): number {
  return 3 * (1 - s) * (1 - s) * s * p1 + 3 * (1 - s) * s * s * p2 + s * s * s;
}
export function draftEase(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let s = t;
  for (let i = 0; i < 8; i++) {
    const x = bezierAxis(s, BEZIER_X1, BEZIER_X2) - t;
    if (Math.abs(x) < 1e-4) break;
    const dx =
      3 * (1 - s) * (1 - s) * (BEZIER_X1 - 0) +
      6 * (1 - s) * s * (BEZIER_X2 - BEZIER_X1) +
      3 * s * s * (1 - BEZIER_X2);
    if (Math.abs(dx) < 1e-6) break;
    s -= x / dx;
  }
  return bezierAxis(s, BEZIER_Y1, BEZIER_Y2);
}

/** Delay applied per successive sibling in a staggered group. */
export const STAGGER_MS = 25;

/** Rise: a new segment card arriving. Matches `.animate-draft-rise`. */
export const RISE_MS = 150;

/** Settle: draft -> final contrast change. Matches `.draft-settle`. */
export const SETTLE_MS = 200;

/**
 * Smooth scroll: following the alignment playhead from one segment to the next.
 *
 * Kept short — the playhead can advance to a new segment every ~150ms under
 * compression, so the scroll must either finish faster than that or be
 * interruptible. It is both: a new target cancels the in-flight animation, and
 * a manual scroll aborts it via the panel's following flag.
 */
export const SCROLL_MS = 180;

/**
 * Roll: a single timecode digit sliding to its new value during alignment.
 *
 * The playhead is compressed (runs faster than realtime), so the seconds digit
 * can retarget every few tens of milliseconds. CSS retargets a running transition
 * gracefully, so a value in the standard 150-250ms band reads as a continuous
 * mechanical roll when digits change fast and as a clean settle when they pause.
 */
export const ROLL_MS = 150;

/**
 * Minimum time a word can be highlighted by the alignment playhead.
 *
 * Below roughly two frames a highlight is imperceptible, so at high compression
 * short words would flicker rather than read. Segments whose budget divided by
 * word count falls under this floor degrade to a single fast uniform pass.
 */
export const MIN_WORD_DWELL_MS = 40;

/**
 * Cap on the gap rendered between words.
 *
 * Real pauses are informative at 1x, but compressed playback still leaves long
 * silences as dead air where nothing is highlighted, which reads as a stall
 * rather than a pause. Word durations stay faithful; gaps get squashed.
 */
export const MAX_WORD_GAP_MS = 60;

/**
 * Backlog, in segments, past which per-word reveal is abandoned in favour of
 * showing whole cards immediately.
 *
 * A preview visibly seconds behind the progress bar is worse than no animation,
 * so the queue must always be allowed to give up and catch up.
 */
export const INSTANT_MODE_BACKLOG = 2;

/** Per-word reveal interval while streaming transcribed text. */
export const WORD_REVEAL_MS = 25;

/**
 * Half of the blur-scroll: blur out, swap the list, blur back in.
 *
 * Slightly outside the 150–250ms band per half is fine because the two halves
 * are one gesture, and nothing else is moving while it runs.
 */
export const BLUR_SWAP_MS = 180;

/** Returns true when the user has asked for reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
