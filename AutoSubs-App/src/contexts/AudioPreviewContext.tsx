import * as React from "react";

type SeekerFn = (time: number) => void;

interface AudioPreviewContextType {
  /** Seek the registered audio preview to the given time (seconds). No-op if no preview is available. */
  seekToTime: (time: number) => void;
  /** Register/unregister a seeker function. Pass `null` to unregister (e.g. on unmount). */
  registerSeeker: (seeker: SeekerFn | null) => void;
  /** Whether an audio preview seeker is currently registered. */
  isAvailable: boolean;
}

const AudioPreviewContext = React.createContext<AudioPreviewContextType | null>(null);

export function AudioPreviewProvider({ children }: { children: React.ReactNode }) {
  const seekerRef = React.useRef<SeekerFn | null>(null);
  const [isAvailable, setIsAvailable] = React.useState(false);

  const registerSeeker = React.useCallback((seeker: SeekerFn | null) => {
    seekerRef.current = seeker;
    setIsAvailable(seeker !== null);
  }, []);

  const seekToTime = React.useCallback((time: number) => {
    seekerRef.current?.(time);
  }, []);

  const value = React.useMemo<AudioPreviewContextType>(
    () => ({ seekToTime, registerSeeker, isAvailable }),
    [seekToTime, registerSeeker, isAvailable],
  );

  return (
    <AudioPreviewContext.Provider value={value}>
      {children}
    </AudioPreviewContext.Provider>
  );
}

export function useAudioPreview() {
  const ctx = React.useContext(AudioPreviewContext);
  if (!ctx) {
    throw new Error("useAudioPreview must be used within an AudioPreviewProvider");
  }
  return ctx;
}
