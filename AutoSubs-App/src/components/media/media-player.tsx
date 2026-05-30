import * as React from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAudioPeaks } from "@/utils/audio-peaks";

interface MediaPlayerProps {
  src: string;
  filePath?: string;
  type?: "audio" | "video";
  className?: string;
  preload?: "none" | "metadata" | "auto";
  onTimeUpdate?: (time: number) => void;
  onReady?: () => void;
  onEnded?: () => void;
  onDurationChange?: (duration: number) => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const sec = s % 60;
  const min = m % 60;
  if (h > 0)
    return `${h}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export function MediaPlayer({
  src,
  filePath,
  type = "audio",
  className,
  preload = "metadata",
  onTimeUpdate,
  onReady,
  onEnded,
  onDurationChange,
}: MediaPlayerProps) {
  const mediaRef = React.useRef<HTMLMediaElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const seekRef = React.useRef<HTMLDivElement>(null);
  const rAFRef = React.useRef<number>(0);
  const isDragging = React.useRef(false);
  const wasPlayingBeforeSeek = React.useRef(false);
  const prevVolume = React.useRef(1);
  const waveformOuterRef = React.useRef<HTMLDivElement>(null);

  // Direct DOM refs for progress — bypasses React state for smooth updates
  const progressBarRef = React.useRef<HTMLDivElement>(null);
  const progressThumbRef = React.useRef<HTMLDivElement>(null);
  const timeDisplayRef = React.useRef<HTMLSpanElement>(null);
  const durationRef = React.useRef<number>(0);

  const [barCount, setBarCount] = React.useState(80);
  const barCountRef = React.useRef(80);

  React.useEffect(() => {
    const el = waveformOuterRef.current;
    if (!el) return;
    const resize = () => {
      const w = el.clientWidth;
      const count = Math.max(20, Math.floor(w / 3));
      if (count !== barCountRef.current) {
        barCountRef.current = count;
        setBarCount(count);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [type]);

  const [peaks, setPeaks] = React.useState<number[] | null>(null);
  // Keep a ref to peaks for the rAF loop (avoids stale closure)
  const peaksRef = React.useRef<number[] | null>(null);
  peaksRef.current = peaks;

  React.useEffect(() => {
    if (!src || type !== "audio") {
      setPeaks(null);
      return;
    }
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        const fake = Array.from(
          { length: barCount },
          (_, i) => Math.sin((i / barCount) * Math.PI * 6) * 0.45 + 0.55,
        );
        setPeaks(fake);
      }
    }, 2000);

    getAudioPeaks(src, barCount)
      .then((result) => {
        if (!cancelled) {
          clearTimeout(timeoutId);
          setPeaks(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          clearTimeout(timeoutId);
          console.error("Failed to get audio peaks:", err);
          const fake = Array.from(
            { length: barCount },
            (_, i) => Math.sin((i / barCount) * Math.PI * 6) * 0.45 + 0.55,
          );
          setPeaks(fake);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [src, barCount, type]);

  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [duration, setDuration] = React.useState(0);
  const [volume, setVolume] = React.useState(1);
  const [isMuted, setIsMuted] = React.useState(false);
  const [buffered, setBuffered] = React.useState(0);
  const [showVolumePopover, setShowVolumePopover] = React.useState(false);
  const volumeRef = React.useRef<HTMLDivElement>(null);

  // currentTime is only needed for the seek hover tooltip — progress is DOM-driven
  const [currentTime, setCurrentTime] = React.useState(0);

  const isVideo = type === "video";

  // Waveform bar elements ref — update colours directly without re-rendering
  const waveformBarsRef = React.useRef<HTMLDivElement[]>([]);

  const applyProgress = React.useCallback((pct: number) => {
    // Progress bar fill
    if (progressBarRef.current) progressBarRef.current.style.width = `${pct}%`;
    // Thumb position
    if (progressThumbRef.current)
      progressThumbRef.current.style.left = `${pct}%`;
    // Waveform bar colours
    const bars = waveformBarsRef.current;
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      if (!bar) continue;
      const played = i / bars.length <= pct / 100;
      bar.style.background = played
        ? "hsl(var(--primary))"
        : "hsl(var(--muted-foreground) / 0.2)";
    }
  }, []);

  const updateProgress = React.useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    if (!isDragging.current) {
      const pct =
        durationRef.current > 0
          ? (media.currentTime / durationRef.current) * 100
          : 0;
      applyProgress(pct);
      // Update time display text directly
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatTime(media.currentTime)} / ${formatTime(durationRef.current)}`;
      }
      onTimeUpdate?.(media.currentTime);
      setCurrentTime(media.currentTime); // keep state in sync for hover tooltip
    }
    rAFRef.current = requestAnimationFrame(updateProgress);
  }, [onTimeUpdate, applyProgress]);

  const updateBuffered = React.useCallback(() => {
    const media = mediaRef.current;
    if (!media || !media.buffered.length) return;
    setBuffered(media.buffered.end(media.buffered.length - 1));
  }, []);

  React.useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const onLoadStart = () => setIsLoading(true);
    const onCanPlay = () => {
      setIsLoading(false);
      setError(null);
      onReady?.();
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEndedEvt = () => {
      setIsPlaying(false);
      onEnded?.();
    };
    const onError = () => {
      setIsLoading(false);
      setError("Failed to load media");
    };
    const onDuration = () => {
      durationRef.current = media.duration;
      setDuration(media.duration);
      onDurationChange?.(media.duration);
    };
    const onProgress = () => updateBuffered();

    media.addEventListener("loadstart", onLoadStart);
    media.addEventListener("canplay", onCanPlay);
    media.addEventListener("play", onPlay);
    media.addEventListener("pause", onPause);
    media.addEventListener("ended", onEndedEvt);
    media.addEventListener("error", onError);
    media.addEventListener("durationchange", onDuration);
    media.addEventListener("progress", onProgress);

    rAFRef.current = requestAnimationFrame(updateProgress);

    return () => {
      media.removeEventListener("loadstart", onLoadStart);
      media.removeEventListener("canplay", onCanPlay);
      media.removeEventListener("play", onPlay);
      media.removeEventListener("pause", onPause);
      media.removeEventListener("ended", onEndedEvt);
      media.removeEventListener("error", onError);
      media.removeEventListener("durationchange", onDuration);
      media.removeEventListener("progress", onProgress);
      cancelAnimationFrame(rAFRef.current);
    };
  }, [src, updateProgress, updateBuffered, onReady, onEnded, onDurationChange]);

  const togglePlay = React.useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) media.play().catch(() => {});
    else media.pause();
  }, []);

  const handleSeek = React.useCallback(
    (clientX: number, el: HTMLElement) => {
      const media = mediaRef.current;
      if (!media || !durationRef.current) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      media.currentTime = ratio * durationRef.current;
      applyProgress(ratio * 100);
      setCurrentTime(media.currentTime);
    },
    [applyProgress],
  );

  const onSeekStart = React.useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      isDragging.current = true;
      wasPlayingBeforeSeek.current = !mediaRef.current?.paused;
      mediaRef.current?.pause();
      seekRef.current?.classList.add("dragging");
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      handleSeek(clientX, e.currentTarget as HTMLElement);
    },
    [handleSeek],
  );

  const onSeekMove = React.useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return;
      const el = waveformOuterRef.current ?? seekRef.current;
      if (!el) return;
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      handleSeek(clientX, el);
    },
    [handleSeek],
  );

  const onSeekEnd = React.useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    seekRef.current?.classList.remove("dragging");
    if (wasPlayingBeforeSeek.current) {
      mediaRef.current?.play().catch(() => {});
    }
  }, []);

  React.useEffect(() => {
    window.addEventListener("mousemove", onSeekMove);
    window.addEventListener("mouseup", onSeekEnd);
    window.addEventListener("touchmove", onSeekMove, { passive: true });
    window.addEventListener("touchend", onSeekEnd);
    return () => {
      window.removeEventListener("mousemove", onSeekMove);
      window.removeEventListener("mouseup", onSeekEnd);
      window.removeEventListener("touchmove", onSeekMove);
      window.removeEventListener("touchend", onSeekEnd);
    };
  }, [onSeekMove, onSeekEnd]);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) {
        setShowVolumePopover(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleMute = React.useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.volume === 0 || media.muted) {
      media.volume = prevVolume.current;
      media.muted = false;
      setIsMuted(false);
      setVolume(prevVolume.current);
    } else {
      prevVolume.current = media.volume;
      media.volume = 0;
      media.muted = true;
      setIsMuted(true);
      setVolume(0);
    }
  }, []);

  const handleVolumeChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      const media = mediaRef.current;
      if (!media) return;
      media.volume = val;
      media.muted = val === 0;
      setIsMuted(val === 0);
      setVolume(val);
      if (val > 0) prevVolume.current = val;
    },
    [],
  );

  const handleSpeedChange = React.useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const media = mediaRef.current;
      if (!media) return;
      media.playbackRate = parseFloat(e.target.value);
    },
    [],
  );

  const toggleFullscreen = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      container.requestFullscreen().catch(() => {});
    }
  }, []);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      const media = mediaRef.current;
      if (!media) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          media.currentTime = Math.max(0, media.currentTime - 5);
          break;
        case "ArrowRight":
          e.preventDefault();
          media.currentTime = Math.min(
            durationRef.current || 0,
            media.currentTime + 5,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          {
            const v = Math.min(1, media.volume + 0.1);
            media.volume = v;
            media.muted = false;
            setVolume(v);
            setIsMuted(false);
            prevVolume.current = v;
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          {
            const v = Math.max(0, media.volume - 0.1);
            media.volume = v;
            media.muted = v === 0;
            setVolume(v);
            setIsMuted(v === 0);
            if (v > 0) prevVolume.current = v;
          }
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          if (isVideo) toggleFullscreen();
          break;
      }
    },
    [togglePlay, toggleMute, toggleFullscreen, isVideo],
  );

  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  const [hoverTime, setHoverTime] = React.useState<number | null>(null);
  const [hoverX, setHoverX] = React.useState(0);
  const [isHoveringSeek, setIsHoveringSeek] = React.useState(false);

  const onSeekHover = React.useCallback((e: React.MouseEvent) => {
    const el = seekRef.current;
    const media = mediaRef.current;
    if (!el || !media?.duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    setHoverTime(ratio * media.duration);
    setHoverX(e.clientX - rect.left);
    setIsHoveringSeek(true);
  }, []);

  const onSeekLeave = React.useCallback(() => {
    setIsHoveringSeek(false);
    setHoverTime(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm",
        "[contain:layout]",
        isVideo ? "h-40" : "",
        className,
      )}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="application"
      aria-label={isVideo ? "Video player" : "Audio player"}
    >
      {type === "audio" ? (
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          src={src}
          preload={preload}
          className="hidden"
        />
      ) : (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={src}
          preload={preload}
          className="block h-full w-full object-contain bg-black"
          playsInline
          onClick={togglePlay}
        />
      )}

      {type === "audio" && (
        <div ref={waveformOuterRef} className="relative h-20 bg-muted/20">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-1">
              <VolumeX className="size-4 text-destructive/70" />
              <span className="text-xs text-muted-foreground">{error}</span>
            </div>
          ) : (
            <div
              className="flex h-full w-full cursor-pointer items-end gap-px py-2.5"
              onMouseDown={onSeekStart}
            >
              {peaks ? (
                peaks.map((peak, i) => (
                  <div
                    key={i}
                    ref={(el) => {
                      if (el) waveformBarsRef.current[i] = el;
                    }}
                    className="w-[2px] shrink-0 rounded-[1px]"
                    style={{
                      height: `${Math.max(8, peak * 80)}%`,
                      background: "hsl(var(--muted-foreground) / 0.2)",
                    }}
                  />
                ))
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Controls bar */}
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5",
          isVideo &&
            "absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-8",
        )}
      >
        <button
          type="button"
          onClick={togglePlay}
          className={cn(
            "flex size-8 items-center justify-center rounded-md transition-colors",
            isVideo
              ? "text-white hover:bg-white/20"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4 ml-0.5" />
          )}
        </button>

        {!isVideo && !isLoading && !error && (
          <>
            <div
              ref={seekRef}
              className="relative flex-1 h-5 flex items-center cursor-pointer group/seek"
              onMouseDown={onSeekStart}
              onMouseMove={onSeekHover}
              onMouseLeave={onSeekLeave}
            >
              {/* Hover time tooltip */}
              {isHoveringSeek && hoverTime !== null && (
                <div
                  className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-medium text-background shadow-md whitespace-nowrap pointer-events-none z-10"
                  style={{ left: hoverX }}
                >
                  {formatTime(hoverTime)}
                </div>
              )}
              <div className="relative w-full h-1 rounded-full bg-muted-foreground/10 group-hover/seek:h-[5px] transition-all duration-150">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/15"
                  style={{ width: `${bufferedPct}%` }}
                />
                {/* Progress fill — width driven by DOM ref, not state */}
                <div
                  ref={progressBarRef}
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  style={{ width: "0%" }}
                />
                <div
                  ref={progressThumbRef}
                  className={cn(
                    "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-primary shadow-sm",
                    "opacity-0 group-hover/seek:opacity-100 transition-opacity",
                    "h-2.5 w-2.5",
                  )}
                  style={{ left: "0%" }}
                />
              </div>
            </div>

            {/* Time display — textContent driven by DOM ref, not state */}
            <span
              ref={timeDisplayRef}
              className="min-w-[70px] text-center tabular-nums text-[11px] text-muted-foreground select-none"
            >
              0:00 / {formatTime(duration)}
            </span>
          </>
        )}

        <div className="flex items-center gap-0.5 ml-auto">
          {/* Speed */}
          <div className="relative">
            <select
              onChange={handleSpeedChange}
              defaultValue="1"
              className={cn(
                "flex h-7 items-center rounded-md border-0 bg-transparent pl-1.5 pr-4 text-[11px] cursor-pointer outline-none transition-colors appearance-none",
                isVideo
                  ? "text-white/90 hover:bg-white/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-label="Playback speed"
            >
              {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                <option key={s} value={s}>
                  {s}x
                </option>
              ))}
            </select>
            <svg
              className={cn(
                "pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 size-2.5",
                isVideo ? "text/60" : "text-muted-foreground",
              )}
              viewBox="0 0 10 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 1l4 4 4-4" />
            </svg>
          </div>

          {/* Volume */}
          <div className="relative" ref={volumeRef}>
            <button
              type="button"
              onClick={() => setShowVolumePopover((v) => !v)}
              className={cn(
                "flex size-7 items-center justify-center rounded-md transition-colors",
                isVideo
                  ? "text-white/80 hover:bg-white/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="size-3.5" />
              ) : (
                <Volume2 className="size-3.5" />
              )}
            </button>
            {showVolumePopover && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 flex items-center justify-center w-8 h-24 rounded-lg border bg-background shadow-md z-20">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="h-16 w-1.5 [writing-mode:vertical-lr] [direction:rtl] cursor-pointer accent-primary appearance-none [&::-webkit-slider-runnable-track]:bg-muted [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                  aria-label="Volume"
                />
              </div>
            )}
          </div>

          {/* Fullscreen (video only) */}
          {isVideo && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="flex size-7 items-center justify-center rounded-md text-white/80 hover:bg-white/20 hover:text-white transition-colors"
              aria-label={
                document.fullscreenElement ? "Exit fullscreen" : "Fullscreen"
              }
            >
              {document.fullscreenElement ? (
                <Minimize className="size-3.5" />
              ) : (
                <Maximize className="size-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
