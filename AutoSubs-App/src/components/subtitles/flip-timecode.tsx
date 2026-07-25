import * as React from "react";
import { cn } from "@/lib/utils";
import { DRAFT_EASE, ROLL_MS, prefersReducedMotion } from "@/lib/draft-motion";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function formatTimecode(seconds: number): string {
  const sec = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const secs = Math.floor(sec % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

interface FlipTimecodeProps {
  seconds: number;
  /**
   * Whether the digits should roll to their new value. Only true while this
   * segment is the alignment playhead's target, so the timecode rolls forward
   * as words arrive and snaps cleanly back to `segment.start` when the
   * playhead moves on (no backward roll).
   */
  animate?: boolean;
  className?: string;
}

/**
 * A timecode whose digits roll like a flip clock during word alignment.
 *
 * Each digit is a vertical strip of 0-9 inside a one-line-tall window; on
 * change the strip translates to the new digit using the shared draft easing.
 * Unchanged digits do not move, so only the seconds (and occasionally minutes)
 * column rolls. Colons are static. Falls back to a plain string under
 * `prefers-reduced-motion` or when not animating.
 */
export function FlipTimecode({ seconds, animate = false, className }: FlipTimecodeProps) {
  const reduced = React.useMemo(() => prefersReducedMotion(), []);
  const text = formatTimecode(seconds);

  if (!animate || reduced) {
    return (
      <span className={cn("font-mono tabular-nums", className)} aria-label={text}>
        {text}
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex font-mono tabular-nums leading-none", className)}
      aria-label={text}
    >
      {text.split("").map((ch, i) => {
        if (ch === ":") {
          return (
            <span key={`sep-${i}`} className="inline-block" aria-hidden="true">
              {ch}
            </span>
          );
        }
        const digit = Number(ch);
        return (
          <span
            key={`d-${i}`}
            className="relative inline-block overflow-hidden"
            style={{ height: "1em", lineHeight: 1 }}
            aria-hidden="true"
          >
            <span
              className="inline-flex flex-col"
              style={{
                transform: `translateY(-${digit}em)`,
                transition: `transform ${ROLL_MS}ms ${DRAFT_EASE}`,
                lineHeight: 1,
              }}
            >
              {DIGITS.map((d) => (
                <span
                  key={d}
                  className="inline-block"
                  style={{ height: "1em", lineHeight: 1 }}
                >
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
