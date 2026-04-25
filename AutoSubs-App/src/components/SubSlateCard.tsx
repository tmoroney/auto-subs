import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** e.g. "10 transcriptions complete" — shown above the card */
  milestone?: string;
  /** Image used inside the dot mask. Defaults to SubSlate website bg. */
  bgImage?: string;
  /** Where the CTA button sends the user. */
  url?: string;
};

export default function SubSlateCard({
  open,
  onClose,
  milestone = "Achievement unlocked",
  bgImage = "/bg.webp",
  url = "https://subslate.app",
}: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const l1 = useRef<SVGGElement | null>(null);
  const l2 = useRef<SVGGElement | null>(null);
  const l3 = useRef<SVGGElement | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setRender(true);
      setClosing(false);
    } else if (render) {
      setClosing(true);
      const t = setTimeout(() => {
        setRender(false);
        setClosing(false);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!render) return;
    const layers = [
      { el: l1.current, duration: 120, dir: 1 },
      { el: l2.current, duration: 150, dir: -1 },
      { el: l3.current, duration: 200, dir: 1 },
    ];
    const angles = [0, 0, 0];
    let prev: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      if (prev !== null) {
        const dt = (now - prev) / 1000;
        for (let i = 0; i < layers.length; i++) {
          const l = layers[i];
          if (!l.el) continue;
          angles[i] += (360 / l.duration) * l.dir * dt;
          l.el.setAttribute("transform", `rotate(${angles[i]})`);
        }
      }
      prev = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [render]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const rafId = useRef<number>(0);
  const pending = useRef<{ px: number; py: number } | null>(null);
  const easeTimeout = useRef<number>(0);

  const handleEnter = () => {
    const card = cardRef.current;
    if (!card) return;
    card.classList.add("ss-card-easing");
    window.clearTimeout(easeTimeout.current);
    easeTimeout.current = window.setTimeout(() => {
      card.classList.remove("ss-card-easing");
    }, 280);
  };
  const handleMove = (e: React.MouseEvent) => {
    const card = cardRef.current;
    if (!card) return;
    const r = card.getBoundingClientRect();
    pending.current = {
      px: (e.clientX - r.left) / r.width,
      py: (e.clientY - r.top) / r.height,
    };
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      const p = pending.current;
      if (!p || !cardRef.current) return;
      const cx = Math.max(0, Math.min(1, p.px));
      const cy = Math.max(0, Math.min(1, p.py));
      const rx = (cy - 0.5) * -22;
      const ry = (cx - 0.5) * 28;
      cardRef.current.style.setProperty("--rx", `${rx}deg`);
      cardRef.current.style.setProperty("--ry", `${ry}deg`);
      cardRef.current.style.setProperty("--mx", `${p.px * 100}%`);
      cardRef.current.style.setProperty("--my", `${p.py * 100}%`);
    });
  };
  const handleLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    card.classList.add("ss-card-easing");
    card.style.setProperty("--rx", `0deg`);
    card.style.setProperty("--ry", `0deg`);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!v.includes("@") || !v.includes(".")) {
      setStatus("error");
      setMessage("Please enter a valid email");
      return;
    }
    setStatus("loading");
    fetch(
      "https://docs.google.com/forms/d/e/1FAIpQLSefcKNTH_SydBfuDYCFE7jax3ScBx17E-vZwZTRdXTHMMdIgA/formResponse",
      {
        method: "POST",
        mode: "no-cors",
        body: new URLSearchParams({ emailAddress: v }),
      },
    ).finally(() => {
      setStatus("success");
      setMessage("Thanks! We'll keep you posted.");
      setEmail("");
    });
  };

  if (!render) return null;

  return (
    <>
      <style>{css}</style>
      <div
        className={`ss-overlay${closing ? " ss-overlay-closing" : ""}`}
        onClick={onClose}
      >
        <div
          className={`ss-stage${closing ? " ss-stage-closing" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ss-milestone">{milestone}</div>

          <div
            className="ss-hit"
            onMouseEnter={handleEnter}
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
          >
          <div ref={cardRef} className="ss-card">
            <div className="ss-card-inner">
              <button className="ss-close" onClick={onClose} aria-label="Close">×</button>
              <div className="ss-bg-dots" />

              <div className="ss-brand-row">
                <div className="ss-brand">SubSlate</div>
                <div className="ss-creator">From the creator of AutoSubs</div>
              </div>

              <div className="ss-art-wrap">
                <svg className="ss-art" viewBox="-200 -200 400 400" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <mask id="ss-dots-mask">
                      <rect x="-200" y="-200" width="400" height="400" fill="black" />
                      <g ref={l1} className="ss-layer ss-layer-1">
                        {[0, 60, 120, 180, 240, 300].map((a) => (
                          <circle key={a} cy="0" fill="white" transform={`rotate(${a})`} />
                        ))}
                      </g>
                      <g ref={l2} className="ss-layer ss-layer-2">
                        {Array.from({ length: 12 }, (_, i) => i * 30).map((a) => (
                          <circle key={a} cy="0" fill="white" transform={`rotate(${a})`} />
                        ))}
                      </g>
                      <g ref={l3} className="ss-layer ss-layer-3">
                        {Array.from({ length: 18 }, (_, i) => i * 20).map((a) => (
                          <circle key={a} cy="0" fill="white" transform={`rotate(${a})`} />
                        ))}
                      </g>
                    </mask>
                  </defs>
                  <image
                    href={bgImage}
                    x="-200"
                    y="-200"
                    width="400"
                    height="400"
                    preserveAspectRatio="xMidYMid slice"
                    mask="url(#ss-dots-mask)"
                  />
                </svg>
              </div>

              <div className="ss-tagline">Craft your story, effortlessly.</div>

              <form className="ss-form" onSubmit={submit}>
                {message && (
                  <div className={`ss-msg ss-msg-${status}`}>{message}</div>
                )}
                <input
                  className="ss-input"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <button className="ss-button" type="submit" disabled={status === "loading"}>
                  {status === "loading" ? <span className="ss-spinner" /> : "Notify Me"}
                </button>
              </form>

              <a className="ss-link" href={url} target="_blank" rel="noopener noreferrer">
                subslate.app →
              </a>

              <div className="ss-sheen" />
            </div>
          </div>
          </div>
        </div>
      </div>
    </>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

.ss-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(10, 10, 15, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  font-family: "Plus Jakarta Sans", "SF Pro Display", "Helvetica Neue", sans-serif;
  animation: ss-fade 0.25s ease-out;
  padding: 20px;
}
.ss-overlay-closing {
  animation: ss-fade-out 0.2s ease-out forwards;
}
.ss-stage-closing .ss-milestone,
.ss-stage-closing .ss-card {
  animation: ss-shrink-out 0.2s ease-out forwards;
}

.ss-stage {
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  perspective: 1400px;
}

.ss-milestone {
  color: rgba(255,255,255,0.92);
  font-size: 13px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase;
  padding: 8px 16px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18);
  animation: ss-pop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.4s backwards;
}

.ss-hit {
  padding: 18px;
  margin: -18px;
  perspective: 1400px;
}

.ss-card {
  --rx: 0deg; --ry: 0deg; --mx: 50%; --my: 30%;
  width: min(360px, 88vw);
  aspect-ratio: 5 / 7;
  border-radius: 24px;
  transform-style: preserve-3d;
  transform: rotateX(var(--rx)) rotateY(var(--ry));
  will-change: transform;
  animation: ss-reveal 0.9s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow:
    0 30px 80px rgba(0,0,0,0.5),
    0 10px 30px rgba(0,0,0,0.35);
  padding: 1.5px;
  background:
    conic-gradient(from calc(var(--ry) * 4) at 50% 50%,
      rgba(0,0,0,0.28),
      rgba(0,0,0,0.06) 25%,
      rgba(0,0,0,0.32) 50%,
      rgba(0,0,0,0.06) 75%,
      rgba(0,0,0,0.28));
}
.ss-card.ss-card-easing {
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.ss-card-inner {
  position: relative;
  width: 100%; height: 100%;
  border-radius: 22px;
  background: #fff;
  overflow: hidden;
  display: flex; flex-direction: column;
  padding: 40px 22px 18px;
}

.ss-bg-dots {
  position: absolute; inset: 0;
  background-color: #fff;
  background-image: radial-gradient(circle, rgba(209,213,219,0.9) 1.5px, transparent 1.5px);
  background-size: 20px 20px;
  pointer-events: none;
}

.ss-close {
  position: absolute;
  top: 12px; right: 12px;
  z-index: 10;
  width: 32px; height: 32px;
  border-radius: 999px;
  border: none;
  background: rgba(0,0,0,0.06);
  color: #000;
  font-size: 20px; line-height: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s ease;
}
.ss-close:hover { background: rgba(0,0,0,0.12); }

.ss-brand-row {
  position: relative; z-index: 2;
  display: flex; flex-direction: column; gap: 4px;
  text-align: center;
}

.ss-brand {
  font-weight: 800;
  font-size: 2.4rem;
  letter-spacing: -0.04em;
  color: #000;
  line-height: 0.9;
  text-shadow: 2px 0 5px #fff, -2px 0 5px #fff, 0 2px 5px #fff, 0 -2px 5px #fff, 0 0 12px #fff;
  user-select: none;
  -webkit-user-select: none;
}
.ss-creator {
  font-size: 0.78rem;
  color: rgba(0,0,0,0.65);
  text-shadow: 1px 0 3px #fff, -1px 0 3px #fff, 0 1px 3px #fff, 0 -1px 3px #fff;
  user-select: none;
  -webkit-user-select: none;
}

.ss-art-wrap {
  position: relative; z-index: 2;
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  margin: 6px 0;
}
.ss-art {
  --l1-radius: 18px; --l1-distance: 50px;
  --l2-radius: 13px; --l2-distance: 100px;
  --l3-radius: 8px;  --l3-distance: 145px;
  width: 90%; height: 90%;
  overflow: visible;
}
.ss-layer { transform-origin: 0 0; }
.ss-layer circle { r: var(--radius); cx: var(--distance); }
.ss-layer-1 { --radius: var(--l1-radius); --distance: var(--l1-distance); }
.ss-layer-2 { --radius: var(--l2-radius); --distance: var(--l2-distance); }
.ss-layer-3 { --radius: var(--l3-radius); --distance: var(--l3-distance); }

.ss-tagline {
  position: relative; z-index: 2;
  font-weight: 500;
  font-size: 1.05rem;
  color: rgba(0,0,0,0.85);
  text-align: center;
  letter-spacing: -0.01em;
  margin-bottom: 12px;
  text-shadow: 1px 0 3px #fff, -1px 0 3px #fff, 0 1px 3px #fff, 0 -1px 3px #fff;
  user-select: none;
  -webkit-user-select: none;
}

.ss-form {
  position: relative; z-index: 2;
  display: flex; align-items: center;
  width: 100%;
  background: rgba(0,0,0,0.92);
  border-radius: 999px;
  padding: 4px 4px 4px 16px;
  gap: 6px;
}
.ss-input {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  color: #fff; font-family: inherit; font-size: 13px; font-weight: 500;
}
.ss-input::placeholder { color: rgba(255,255,255,0.5); }
.ss-button {
  background: #fff; color: #000; border: none;
  border-radius: 999px; padding: 8px 14px;
  font-family: inherit; font-size: 12px; font-weight: 600;
  cursor: pointer; white-space: nowrap;
  min-width: 72px;
  display: inline-flex; align-items: center; justify-content: center;
  transition: opacity 0.2s ease, transform 0.15s ease;
}
.ss-button:hover:not(:disabled) { opacity: 0.85; }
.ss-button:active:not(:disabled) { transform: scale(0.97); }
.ss-button:disabled { opacity: 0.6; cursor: not-allowed; }

.ss-spinner {
  width: 12px; height: 12px;
  border: 2px solid rgba(0,0,0,0.3);
  border-top-color: #000;
  border-radius: 50%;
  animation: ss-spin 0.7s linear infinite;
}

.ss-msg {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%; transform: translateX(-50%);
  font-size: 12px; font-weight: 700;
  padding: 6px 12px; border-radius: 999px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  white-space: nowrap;
}
.ss-msg-success { color: #16a34a; }
.ss-msg-error { color: #dc2626; }

.ss-link {
  position: relative; z-index: 2;
  margin-top: 10px;
  text-align: center;
  font-size: 11px;
  color: rgba(0,0,0,0.55);
  text-decoration: none;
  letter-spacing: 0.02em;
}
.ss-link:hover { color: #000; }

.ss-sheen {
  position: absolute; inset: 0;
  border-radius: 22px;
  background: radial-gradient(
    circle at var(--mx) var(--my),
    rgba(255,255,255,0.55),
    rgba(255,255,255,0) 40%
  );
  mix-blend-mode: overlay;
  pointer-events: none;
  z-index: 3;
}

@keyframes ss-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ss-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes ss-shrink-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.96); }
}
@keyframes ss-pop {
  from { opacity: 0; transform: translateY(8px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes ss-reveal {
  0%   { opacity: 0; transform: rotateY(90deg) scale(0.9); }
  60%  { opacity: 1; transform: rotateY(-8deg) scale(1.02); }
  100% { opacity: 1; transform: rotateY(0) scale(1); }
}
@keyframes ss-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .ss-card, .ss-milestone { animation: none; }
  .ss-card { transition: none; }
}
`;
