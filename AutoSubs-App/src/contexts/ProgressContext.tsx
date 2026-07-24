import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Subtitle } from '@/types';
import i18n from '@/i18n';

const PHASES = ['Prepare', 'Analyze', 'Transcribe', 'Refine', 'Finish'] as const;
type Phase = (typeof PHASES)[number];

interface ProcessingStep {
  id: string;
  title: string;
  description: string;
  progress: number;
  isActive: boolean;
  isCompleted: boolean;
  isCancelled?: boolean;
}

interface ProgressSettings {
  targetLanguage: string;
  language: string;
  enableForcedAlignment: boolean;
}

interface ProgressContextType {
  processingSteps: ProcessingStep[];
  livePreviewSegments: Subtitle[];
  currentPhase: string;
  currentPhaseProgress: number;
  clearProgressSteps: () => void;
  completeAllProgressSteps: () => void;
  cancelAllProgressSteps: () => void;
  updateProgressStep: (event: { progress: number; type?: string; label?: string }) => void;
  setupEventListeners: (settings: { targetLanguage: string; language: string; enableForcedAlignment?: boolean }) => () => void;
}

const ProgressContext = createContext<ProgressContextType | null>(null);

interface PhaseState {
  progress: number;
  subProgress: Record<string, number>;
  latestLabel?: string;
  isActive: boolean;
  isCompleted: boolean;
  isCancelled?: boolean;
}

function defaultPhaseState(): PhaseState {
  return { progress: 0, subProgress: {}, isActive: false, isCompleted: false };
}

function phaseTitle(phase: string): string {
  const key = `progressSteps.${phase.toLowerCase()}`;
  const translated = i18n.t(key);
  return translated === key ? phase : translated;
}

function resolveLabel(label?: string, progress?: number, targetLanguage?: string): string {
  if (!label || typeof label !== 'string') {
    return `${Math.round(progress ?? 0)}%`;
  }
  if (label.includes('.')) {
    const translated = i18n.t(label, targetLanguage && label === 'progressSteps.translate'
      ? { language: targetLanguage }
      : undefined);
    return translated === label ? `${Math.round(progress ?? 0)}%` : translated;
  }
  return label.trim() || `${Math.round(progress ?? 0)}%`;
}

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [phaseMap, setPhaseMap] = useState<Record<Phase, PhaseState>>({
    Prepare: defaultPhaseState(),
    Analyze: defaultPhaseState(),
    Transcribe: defaultPhaseState(),
    Refine: defaultPhaseState(),
    Finish: defaultPhaseState(),
  });
  const [livePreviewSegments, setLivePreviewSegments] = useState<Subtitle[]>([]);
  const settingsRef = useRef<ProgressSettings>({ targetLanguage: 'en', language: 'auto', enableForcedAlignment: false });
  const unlistenersRef = useRef<Array<() => void>>([]);
  const listenersSetupRef = useRef(false);

  const getPhasesInOrder = useCallback((): Phase[] => {
    const order: Phase[] = ['Prepare', 'Analyze', 'Transcribe', 'Finish'];
    if (settingsRef.current.enableForcedAlignment) {
      order.splice(3, 0, 'Refine');
    }
    return order;
  }, []);

  const updateProgressStep = useCallback((event: { progress: number; type?: string; label?: string }) => {
    const phase = event.type as Phase;
    if (!phase || !PHASES.includes(phase)) {
      console.log('Ignoring progress event with unknown type:', event.type);
      return;
    }

    const progress = Math.max(0, Math.min(100, event.progress ?? 0));

    setPhaseMap((prev) => {
      const next: Record<Phase, PhaseState> = { ...prev } as Record<Phase, PhaseState>;
      const current = next[phase] ?? defaultPhaseState();

      let overallProgress = progress;
      let subProgress = { ...current.subProgress };

      if (phase === 'Prepare' && event.label) {
        subProgress[event.label] = progress;
        const values = Object.values(subProgress);
        const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        overallProgress = Math.max(current.progress, avg);
      } else {
        overallProgress = Math.max(current.progress, progress);
      }

      next[phase] = {
        ...current,
        progress: overallProgress,
        subProgress,
        latestLabel: event.label || current.latestLabel,
        isActive: overallProgress < 100,
        isCompleted: overallProgress >= 100,
      };

      const order = getPhasesInOrder();
      const currentIndex = order.indexOf(phase);

      // All previous phases are completed once a later phase begins receiving updates.
      for (let i = 0; i < currentIndex; i++) {
        const p = order[i];
        if (next[p]) {
          next[p] = { ...next[p], progress: Math.max(next[p].progress, 100), isActive: false, isCompleted: true };
        }
      }

      // Future phases are still pending.
      for (let i = currentIndex + 1; i < order.length; i++) {
        const p = order[i];
        if (next[p]) {
          next[p] = { ...next[p], isActive: false, isCompleted: false };
        }
      }

      return next;
    });
  }, [getPhasesInOrder]);

  const clearProgressSteps = useCallback(() => {
    setPhaseMap({
      Prepare: defaultPhaseState(),
      Analyze: defaultPhaseState(),
      Transcribe: defaultPhaseState(),
      Refine: defaultPhaseState(),
      Finish: defaultPhaseState(),
    });
    setLivePreviewSegments([]);
  }, []);

  const completeAllProgressSteps = useCallback(() => {
    setPhaseMap((prev) => {
      const next: Record<Phase, PhaseState> = { ...prev } as Record<Phase, PhaseState>;
      for (const p of PHASES) {
        next[p] = { ...next[p], progress: 100, isActive: false, isCompleted: true };
      }
      return next;
    });
  }, []);

  const cancelAllProgressSteps = useCallback(() => {
    setPhaseMap((prev) => {
      const next: Record<Phase, PhaseState> = { ...prev } as Record<Phase, PhaseState>;
      for (const p of PHASES) {
        if (next[p].isActive && !next[p].isCompleted) {
          next[p] = { ...next[p], isActive: false, isCompleted: false, isCancelled: true };
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (listenersSetupRef.current) return;
    listenersSetupRef.current = true;

    const setup = async () => {
      const unlistenProgress = await listen<{ progress: number; type?: string; label?: string }>('labeled-progress', (event) => {
        updateProgressStep(event.payload);
      });

      const unlistenSegment = await listen<{ index: number; segment: Subtitle }>('new-segment', (event) => {
        const { index, segment } = event.payload;
        setLivePreviewSegments((prev) => {
          const updated = [...prev];
          if (updated.length <= index) {
            updated.length = index + 1;
          }
          updated[index] = segment;
          return updated;
        });
      });

      const unlistenComplete = await listen('transcription-complete', () => {
        completeAllProgressSteps();
      });

      unlistenersRef.current = [unlistenProgress, unlistenSegment, unlistenComplete];
    };

    setup();

    return () => {
      unlistenersRef.current.forEach((u) => u?.());
      unlistenersRef.current = [];
    };
  }, [updateProgressStep, completeAllProgressSteps]);

  const setupEventListeners = useCallback((settings: { targetLanguage: string; language: string; enableForcedAlignment?: boolean }) => {
    settingsRef.current = {
      targetLanguage: settings.targetLanguage,
      language: settings.language,
      enableForcedAlignment: settings.enableForcedAlignment ?? false,
    };
    return () => {};
  }, []);

  const processingSteps = useMemo((): ProcessingStep[] => {
    const order = getPhasesInOrder();
    const targetLang = settingsRef.current.targetLanguage;
    return order.map((phase) => {
      const state = phaseMap[phase] ?? defaultPhaseState();
      return {
        id: phase,
        title: phaseTitle(phase),
        description: resolveLabel(
          state.latestLabel ?? `progressSteps.${phase.toLowerCase()}`,
          state.progress,
          targetLang,
        ),
        progress: state.progress,
        isActive: state.isActive,
        isCompleted: state.isCompleted,
        isCancelled: state.isCancelled,
      };
    });
  }, [phaseMap, getPhasesInOrder]);

  const currentPhaseInfo = useMemo(() => {
    const active = processingSteps.find((s) => s.isActive);
    if (active) return active;
    const firstPending = processingSteps.find((s) => !s.isCompleted);
    if (firstPending) return firstPending;
    return processingSteps[processingSteps.length - 1];
  }, [processingSteps]);

  return (
    <ProgressContext.Provider value={{
      processingSteps,
      livePreviewSegments,
      currentPhase: currentPhaseInfo?.id ?? 'Prepare',
      currentPhaseProgress: currentPhaseInfo?.progress ?? 0,
      clearProgressSteps,
      completeAllProgressSteps,
      cancelAllProgressSteps,
      updateProgressStep,
      setupEventListeners,
    }}>
      {children}
    </ProgressContext.Provider>
  );
}

export const useProgress = () => {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
};
