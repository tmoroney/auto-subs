import { useState, useEffect, useRef } from "react";

const BRAND = "hsl(var(--primary))";
const INK = "hsl(var(--foreground))";

const SVG_W = 400, SVG_H = 210;
const DOT_X = 68, DOT_Y = 75;
const FW = 276, FH = 76;
const PAD = 14;
const FONT = 38;
const WORD = "AutoSubs";
const SPLIT = 4;
const AVAIL = FW - PAD * 2;

export function SplashScreen() {
  const [cycle, setCycle] = useState(0);
  const R = useRef<{ tids: number[]; raf: number }>({ tids: [], raf: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const [exp, setExp] = useState(0);
  const [brDot, setBrDot] = useState(0);
  const [chars, setChars] = useState(Array(WORD.length).fill(0));
  const [charXs, setCharXs] = useState<number[] | null>(null);

  function spring(
    set: (v: number) => void,
    target: number,
    k: number,
    b: number,
    delay: number,
  ) {
    const st = { p: 0, v: 0 };
    const tid = window.setTimeout(() => {
      let prev: number | null = null;
      function tick(now: number) {
        if (prev === null) prev = now;
        const dt = Math.min((now - prev) / 1000, 0.05);
        prev = now;
        const f = k * (target - st.p) - b * st.v;
        st.v += f * dt;
        st.p += st.v * dt;
        const done =
          Math.abs(target - st.p) < 0.0006 && Math.abs(st.v) < 0.0006;
        set(done ? target : st.p);
        if (!done) R.current.raf = requestAnimationFrame(tick);
      }
      R.current.raf = requestAnimationFrame(tick);
    }, delay);
    R.current.tids.push(tid);
  }

  function eased(
    set: (v: number) => void,
    to: number,
    dur: number,
    delay: number,
    pw?: number,
  ) {
    const tid = window.setTimeout(() => {
      let t0: number | null = null;
      function tick(now: number) {
        if (!t0) t0 = now;
        const p = Math.min((now - t0) / dur, 1);
        set((1 - Math.pow(1 - p, pw || 4)) * to);
        if (p < 1) R.current.raf = requestAnimationFrame(tick);
      }
      R.current.raf = requestAnimationFrame(tick);
    }, delay);
    R.current.tids.push(tid);
  }

  useEffect(() => {
    const tid = window.setTimeout(() => {
      if (!svgRef.current) return;
      const probe = svgRef.current.querySelector("#probe");
      if (!probe) return;
      const xs: number[] = [];
      for (let i = 0; i < WORD.length; i++) {
        try {
          xs.push((probe as SVGTextElement).getStartPositionOfChar(i).x);
        } catch {
          xs.push(PAD + i * 30);
        }
      }
      setCharXs(xs);
    }, 80);
    return () => clearTimeout(tid);
  }, []);

  useEffect(() => {
    R.current.tids.forEach(clearTimeout);
    R.current.tids = [];
    cancelAnimationFrame(R.current.raf);
    setExp(0);
    setBrDot(0);
    setChars(Array(WORD.length).fill(0));

    spring(setExp, 1, 115, 15, 50);
    eased(setBrDot, 1, 300, 500, 4);

    WORD.split("").forEach((_, i) => {
      const tid = window.setTimeout(() => {
        let t0: number | null = null;
        function tick(now: number) {
          if (!t0) t0 = now;
          const p = Math.min((now - t0) / 260, 1);
          setChars((prev) => {
            const n = [...prev];
            n[i] = 1 - Math.pow(1 - p, 3);
            return n;
          });
          if (p < 1) R.current.raf = requestAnimationFrame(tick);
        }
        R.current.raf = requestAnimationFrame(tick);
      }, 560 + i * 60);
      R.current.tids.push(tid);
    });

    R.current.tids.push(
      window.setTimeout(() => setCycle((c) => c + 1), 3900),
    );

    return () => {
      R.current.tids.forEach(clearTimeout);
      cancelAnimationFrame(R.current.raf);
    };
  }, [cycle]);

  const bw = exp * FW;
  const bh = exp * FH;
  const bx = DOT_X;
  const by = DOT_Y;
  const tlDot = Math.min(exp * 6, 1);
  const textY = by + bh / 2 + FONT * 0.37;
  const probeX = bx + PAD;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background select-none">
      <svg
        ref={svgRef}
        width={SVG_W}
        height={SVG_H}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ display: "block" }}
      >
        <text
          id="probe"
          x={probeX}
          y={textY}
          fontSize={FONT}
          fontWeight={700}
          fontFamily='-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
          textLength={AVAIL}
          lengthAdjust="spacingAndGlyphs"
          opacity={0}
          style={{ userSelect: "none" }}
        >
          {WORD}
        </text>

        <rect
          x={bx} y={by}
          width={bw} height={bh}
          rx={1.5}
          fill="none"
          strokeWidth={1.5}
          style={{ stroke: INK }}
        />

        <circle cx={DOT_X} cy={DOT_Y} r={3.5 * tlDot} style={{ fill: BRAND }} />

        <circle
          cx={bx + bw} cy={by + bh}
          r={3.5 * brDot}
          opacity={brDot}
          style={{ fill: BRAND }}
        />

        {charXs &&
          WORD.split("").map((ch, i) => (
            <text
              key={`${cycle}-${i}`}
              x={charXs[i]}
              y={textY + 13 * (1 - chars[i])}
              fontSize={FONT}
              fontWeight={700}
              fontFamily='-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
              opacity={chars[i]}
              style={{ userSelect: "none", fill: i < SPLIT ? INK : BRAND }}
            >
              {ch}
            </text>
          ))}
      </svg>
    </div>
  );
}
