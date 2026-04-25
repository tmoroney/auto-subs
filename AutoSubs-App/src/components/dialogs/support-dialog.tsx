import { useEffect, useRef, useState } from "react";
import { ExternalLink, Coffee, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupportDialog({ open, onOpenChange }: SupportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Support AutoSubs</DialogTitle>
          <DialogDescription>
            Choose how you'd like to support AutoSubs development.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 pt-2">
          {/* SubSlate Promo Card */}
          <SubSlatePromoCard />

          {/* Buy Me a Coffee Card */}
          <Card className="relative overflow-hidden group border-2 border-yellow-200/60 dark:border-yellow-900/60 bg-gradient-to-b from-yellow-50/50 to-white dark:from-yellow-950/10 dark:to-zinc-900 shadow-sm flex flex-col h-full">
            <CardContent className="p-6 flex flex-col h-full justify-between items-center text-center space-y-4">
              <div className="space-y-3 flex-1 flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center mb-1 shadow-sm group-hover:scale-110 transition-transform duration-300 border border-yellow-50 dark:border-yellow-900/30">
                  <Coffee className="h-6 w-6 text-yellow-600 fill-yellow-600" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-yellow-950 dark:text-yellow-50">Buy me a coffee?</h3>
                <p className="text-sm text-yellow-900/70 dark:text-yellow-200/60 leading-relaxed px-4 font-medium">
                  If AutoSubs has saved you time, consider buying me a coffee to support the project!
                </p>
              </div>

              <Button
                asChild
                className="w-full bg-[#FFDD00] hover:bg-[#FFDD00]/90 text-black rounded-full font-bold h-10 text-sm shadow-md shadow-yellow-500/20 dark:shadow-none transition-all active:scale-95 border-none"
              >
                <a
                  href="https://buymeacoffee.com/tmoroney"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2"
                >
                  <Coffee className="h-4 w-4" />
                  Donate
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SubSlatePromoCard() {
  const l1 = useRef<SVGGElement | null>(null);
  const l2 = useRef<SVGGElement | null>(null);
  const l3 = useRef<SVGGElement | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
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
  }, []);

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

  return (
    <>
      <style>{subSlateStyles}</style>
      <div className="ss-promo-card group">
        <div className="ss-promo-inner">
          <div className="ss-bg-dots" />

          <div className="ss-brand-row">
            <div className="ss-brand">SubSlate</div>
            <div className="ss-tagline">Craft your story, effortlessly.</div>
          </div>

          <div className="ss-art-wrap">
            <svg className="ss-art" viewBox="-200 -200 400 400" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <mask id="ss-promo-dots-mask">
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
                href="/bg.webp"
                x="-200"
                y="-200"
                width="400"
                height="400"
                preserveAspectRatio="xMidYMid slice"
                mask="url(#ss-promo-dots-mask)"
              />
            </svg>
          </div>

          <form className="ss-form" onSubmit={submit}>
            {message && (
              <div className={`ss-msg ss-msg-${status}`}>{message}</div>
            )}
            <input
              className="ss-input"
              type="email"
              placeholder="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button className="ss-button" type="submit" disabled={status === "loading"}>
              {status === "loading" ? <Loader2 className="animate-spin w-4 h-4" /> : "Notify Me"}
            </button>
          </form>

          <a className="ss-link" href="https://subslate.app" target="_blank" rel="noopener noreferrer">
            subslate.app <ExternalLink className="h-2 w-2 inline" />
          </a>
        </div>
      </div>
    </>
  );
}

const subSlateStyles = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

.ss-promo-card {
  height: 100%;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  font-family: "Plus Jakarta Sans", sans-serif;
  transition: opacity 0.3s ease;
  border: 2px solid rgba(0, 0, 0, 0.15);
}

.dark .ss-promo-card {
  border-color: rgba(255, 255, 255, 0.2);
}

.ss-promo-inner {
  position: relative;
  width: 100%; height: 100%;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
  display: flex; flex-direction: column;
  padding: 20px 16px 16px;
}

.ss-bg-dots {
  position: absolute; inset: 0;
  background-color: #fff;
  background-image: radial-gradient(circle, rgba(209,213,219,0.4) 1.2px, transparent 1.2px);
  background-size: 16px 16px;
  pointer-events: none;
}

.ss-brand-row {
  position: relative; z-index: 2;
  display: flex; flex-direction: column; gap: 2px;
  text-align: center;
}

.ss-brand {
  font-weight: 800;
  font-size: 1.8rem;
  letter-spacing: -0.04em;
  color: #000;
  line-height: 1;
  text-shadow: 2px 0 5px #fff, -2px 0 5px #fff, 0 2px 5px #fff, 0 -2px 5px #fff;
}
.ss-creator {
  font-size: 0.7rem;
  font-weight: 500;
  color: rgba(0,0,0,0.6);
  text-shadow: 1px 0 3px #fff, -1px 0 3px #fff;
}

.ss-art-wrap {
  position: relative; z-index: 2;
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  margin: 8px 0;
}
.ss-art {
  --l1-radius: 20px; --l1-distance: 58px;
  --l2-radius: 14px; --l2-distance: 115px;
  --l3-radius: 8px; --l3-distance: 165px;
  width: 90%; height: 90%;
  overflow: visible;
}
.ss-layer { transform-origin: 0 0; }
.ss-layer circle { r: var(--radius); cx: var(--distance); }
.ss-layer-1 { --radius: var(--l1-radius); --distance: var(--l1-distance); }
.ss-layer-2 { --radius: var(--l2-radius); --distance: var(--l2-distance); }
.ss-layer-3 { --radius: var(--l3-radius); --distance: var(--l3-distance); }

.ss-tagline {
  font-size: 0.8rem;
  font-weight: 500;
  color: rgba(0,0,0,0.6);
  text-shadow: 1px 0 3px #fff, -1px 0 3px #fff;
  padding-top: 4px;
}

.ss-form {
  position: relative; z-index: 2;
  display: flex; align-items: center;
  width: 100%;
  background: rgba(0,0,0,0.92);
  border-radius: 999px;
  padding: 3px 3px 3px 12px;
  gap: 4px;
  margin-top: 16px;
}
.ss-input {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  color: #fff; font-family: inherit; font-size: 12px; font-weight: 500;
}
.ss-input::placeholder { color: rgba(255,255,255,0.5); }
.ss-button {
  background: #fff; color: #000; border: none;
  border-radius: 999px; padding: 6px 12px;
  font-family: inherit; font-size: 11px; font-weight: 700;
  cursor: pointer; white-space: nowrap;
  transition: opacity 0.2s ease;
}
.ss-button:hover:not(:disabled) { opacity: 0.85; }

.ss-spinner {
  width: 10px; height: 10px;
  border: 2px solid rgba(0,0,0,0.3);
  border-top-color: #000;
  border-radius: 50%;
  animation: ss-spin 0.7s linear infinite;
}

.ss-msg {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%; transform: translateX(-50%);
  font-size: 10px; font-weight: 700;
  padding: 4px 8px; border-radius: 999px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  white-space: nowrap;
}
.ss-msg-success { color: #16a34a; }
.ss-msg-error { color: #dc2626; }

.ss-link {
  position: relative; z-index: 2;
  margin-top: 6px;
  text-align: center;
  font-size: 10px;
  color: rgba(0,0,0,0.5);
  text-decoration: none;
  font-weight: 600;
}
.ss-link:hover { color: #000; }

@keyframes ss-spin { to { transform: rotate(360deg); } }
`;
