import * as React from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MediaPlayerProps {
  src: string;
  filePath?: string; // Original file path for peak extraction (not asset URL)
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

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
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
  const seekSurfaceRef = React.useRef<HTMLElement | null>(null);
  const prevVolume = React.useRef(1);
  const waveformOuterRef = React.useRef<HTMLDivElement>(null);

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
  const cachedPeaksRef = React.useRef<{ src: string; peaks: number[] } | null>(null);

  const generateFakeWaveform = React.useCallback((count: number): number[] => {
    const waveform = [];
    for (let i = 0; i < count; i++) {
      const normalizedPosition = i / count;
      const sineWave = Math.sin(normalizedPosition * Math.PI * 6);
      waveform.push(sineWave * 0.45 + 0.55);
    }
    return waveform;
  }, []);

  const resamplePeaks = React.useCallback((sourcePeaks: number[], targetCount: number): number[] => {
    if (sourcePeaks.length === targetCount) {
      return sourcePeaks;
    }
    
    const result = [];
    const ratio = sourcePeaks.length / targetCount;
    
    for (let i = 0; i < targetCount; i++) {
      const sourceIndex = Math.floor(i * ratio);
      result.push(sourcePeaks[sourceIndex]);
    }
    
    return result;
  }, []);

  React.useEffect(() => {
    if (!src || type !== "audio") {
      setPeaks(null);
      cachedPeaksRef.current = null;
      return;
    }

    const cached = cachedPeaksRef.current;
    if (cached && cached.src === src) {
      setPeaks(resamplePeaks(cached.peaks, barCount));
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setPeaks(generateFakeWaveform(barCount));
      }
    }, 2000);

    const pathForPeaks = filePath || src;
    invoke<number[]>("extract_audio_peaks", { 
      input: pathForPeaks, 
      count: barCount 
    })
      .then((result) => {
        if (!cancelled) {
          clearTimeout(timeoutId);
          cachedPeaksRef.current = { src, peaks: result };
          setPeaks(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          clearTimeout(timeoutId);
          console.error("Failed to get audio peaks:", err);
          setPeaks(generateFakeWaveform(barCount));
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [src, barCount, type, filePath, generateFakeWaveform, resamplePeaks]);

  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [duration, setDuration] = React.useState(0);
  const [volume, setVolume] = React.useState(1);
  const [isMuted, setIsMuted] = React.useState(false);
  const [buffered, setBuffered] = React.useState(0);
  const [playbackRate, setPlaybackRate] = React.useState(1);

  const hasCalledOnReadyRef = React.useRef(false);
  const hasClearedLoadingRef = React.useRef(false);
  React.useEffect(() => {
    hasCalledOnReadyRef.current = false;
    hasClearedLoadingRef.current = false;
    setIsLoading(true);
  }, [src]);

  const isVideo = type === "video";

  const waveformBarsRef = React.useRef<HTMLDivElement[]>([]);

  const applyProgress = React.useCallback((pct: number) => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${pct}%`;
    }
    if (progressThumbRef.current) {
      progressThumbRef.current.style.left = `${pct}%`;
    }

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
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatTime(media.currentTime)} / ${formatTime(durationRef.current)}`;
      }
      onTimeUpdate?.(media.currentTime);
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

    const onLoadStart = () => {
      if (!hasClearedLoadingRef.current) {
        setIsLoading(true);
      }
    };

    const onReadyEnough = () => {
      setIsLoading(false);
      setError(null);
      hasClearedLoadingRef.current = true;
      if (!hasCalledOnReadyRef.current) {
        hasCalledOnReadyRef.current = true;
        onReady?.();
      }
    };

    const onLoadedMetadata = () => {
      if (isVideo) {
        media.currentTime = 0;
      }
      onReadyEnough();
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
    media.addEventListener("loadedmetadata", onLoadedMetadata);
    media.addEventListener("canplay", onReadyEnough);
    media.addEventListener("play", onPlay);
    media.addEventListener("pause", onPause);
    media.addEventListener("ended", onEndedEvt);
    media.addEventListener("error", onError);
    media.addEventListener("durationchange", onDuration);
    media.addEventListener("progress", onProgress);

    if (media.readyState >= media.HAVE_METADATA && !media.error) {
      onReadyEnough();
    } else if (media.error) {
      setIsLoading(false);
      setError("Failed to load media");
    }

    rAFRef.current = requestAnimationFrame(updateProgress);

    return () => {
      media.removeEventListener("loadstart", onLoadStart);
      media.removeEventListener("loadedmetadata", onLoadedMetadata);
      media.removeEventListener("canplay", onReadyEnough);
      media.removeEventListener("play", onPlay);
      media.removeEventListener("pause", onPause);
      media.removeEventListener("ended", onEndedEvt);
      media.removeEventListener("error", onError);
      media.removeEventListener("durationchange", onDuration);
      media.removeEventListener("progress", onProgress);
      cancelAnimationFrame(rAFRef.current);
    };
  }, [src, updateProgress, updateBuffered, onReady, onEnded, onDurationChange, isVideo]);

  const togglePlay = React.useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (media.paused) {
      media.play().catch(() => {});
    } else {
      media.pause();
    }
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
    },
    [applyProgress],
  );

  const onSeekStart = React.useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      isDragging.current = true;
      wasPlayingBeforeSeek.current = !mediaRef.current?.paused;
      mediaRef.current?.pause();
      seekRef.current?.classList.add("dragging");

      const element = e.currentTarget as HTMLElement;
      seekSurfaceRef.current = element;

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      handleSeek(clientX, element);
    },
    [handleSeek],
  );

  const onSeekMove = React.useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return;

      const element = seekSurfaceRef.current ?? waveformOuterRef.current ?? seekRef.current;
      if (!element) return;

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      handleSeek(clientX, element);
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

  const toggleMute = React.useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (media.volume === 0 || media.muted) {
      const previousVolume = prevVolume.current;
      media.volume = previousVolume;
      media.muted = false;
      setIsMuted(false);
      setVolume(previousVolume);
    } else {
      prevVolume.current = media.volume;
      media.volume = 0;
      media.muted = true;
      setIsMuted(true);
      setVolume(0);
    }
  }, []);

  const handleSpeedChange = React.useCallback(
    (speed: number) => {
      const media = mediaRef.current;
      if (!media) return;
      media.playbackRate = speed;
      setPlaybackRate(speed);
    },
    [],
  );

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
            const newVolume = Math.min(1, media.volume + 0.1);
            media.volume = newVolume;
            media.muted = false;
            setVolume(newVolume);
            setIsMuted(false);
            prevVolume.current = newVolume;
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          {
            const newVolume = Math.max(0, media.volume - 0.1);
            media.volume = newVolume;
            media.muted = newVolume === 0;
            setVolume(newVolume);
            setIsMuted(newVolume === 0);
            if (newVolume > 0) prevVolume.current = newVolume;
          }
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
      }
    },
    [togglePlay, toggleMute],
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
          {isLoading && (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
            </div>
          )}
          {error && (
            <div className="flex h-full flex-col items-center justify-center gap-1">
              <VolumeX className="size-4 text-destructive/70" />
              <span className="text-xs text-muted-foreground">{error}</span>
            </div>
          )}
          {!isLoading && !error && (
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

      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5",
          isVideo &&
            "absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-8",
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlay}
          className={cn(
            "size-8 focus-visible:ring-0",
            isVideo
              ? "text-white hover:bg-white/20 hover:text-white"
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
        </Button>

        {!isVideo && !isLoading && !error && (
          <>
            <div
              ref={seekRef}
              className="relative flex-1 h-5 flex items-center cursor-pointer group/seek"
              onMouseDown={onSeekStart}
              onMouseMove={onSeekHover}
              onMouseLeave={onSeekLeave}
            >
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

            <span
              ref={timeDisplayRef}
              className="min-w-[70px] text-center tabular-nums text-[11px] text-muted-foreground select-none"
            >
              0:00 / {formatTime(duration)}
            </span>
          </>
        )}

        <div className="flex items-center gap-0.5 ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "h-7 px-1.5 text-[11px] gap-1 focus-visible:ring-0",
                  isVideo
                    ? "text-white/90 hover:bg-white/20 hover:text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {playbackRate}x
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => handleSpeedChange(s)}
                  className="text-xs"
                >
                  {s}x
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className={cn(
              "size-7 focus-visible:ring-0",
              isVideo
                ? "text-white/80 hover:bg-white/20 hover:text-white"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="size-3.5" />
            ) : (
              <Volume2 className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
