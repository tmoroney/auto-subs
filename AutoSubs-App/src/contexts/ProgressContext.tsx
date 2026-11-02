import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Subtitle, SegmentStage, DraftSubtitle, Word } from '@/types';
import i18n from '@/i18n';
import { getPipelineOwner } from '@/queue/pipeline-owner';
import { buildProcessingSteps, stepIdFromEvent, type ProcessingStep, type ProgressSettings, type StepState } from '@/queue/progress-steps';

interface ProgressContextType {
  processingSteps: ProcessingStep[];
  /**
   * A run is underway. Deliberately a property of the *run*, not of any
   * individual step: steps hand over with a gap, and anything driven by
   * "is some step active right now" flickers off in between.
   */
  isRunActive: boolean;
  livePreviewSegments: DraftSubtitle[];
  clearProgressSteps: () => void;
  completeAllProgressSteps: () => void;
  cancelAllProgressSteps: () => void;
  updateProgressStep: (event: { progress: number; type?: string; label?: string }) => void;
  setupEventListeners: (settings: Partial<ProgressSettings>) => () => void;
}

const ProgressContext = createContext<ProgressContextType | null>(null);

function defaultSettings(): ProgressSettings {
  return {
    targetLanguage: 'en',
    language: 'auto',
    enableForcedAlignment: false,
    enableDiarize: false,
    audioInputMode: 'file',
  };
}

export function stepTitle(id: string, targetLanguage: string): string {
  const key = `progressSteps.${id}`;
  const translated = i18n.t(key, id === 'translate' ? { language: targetLanguage } : undefined);
  if (translated !== key) return translated;
  // Unknown step: fall back to the coarse group name so we never render a raw key.
  const group = id.split('.')[0];
  const groupTranslated = i18n.t(`progressSteps.${group}`);
  return groupTranslated === `progressSteps.${group}` ? group : groupTranslated;
}

/**
 * Guarantee the frontend `Word` shape.
 *
 * The engine's own word type calls its text field `text`, and only the app layer
 * renames it to `word`. The backend does that conversion before emitting, but a
 * single word arriving in the other shape would throw during render and take the
 * whole live preview down with it, so the boundary re-checks rather than trusts.
 */
function normalizeWords(words: Subtitle['words'] | undefined): Word[] {
  if (!Array.isArray(words)) return [];
  return words.map((word) => ({
    ...word,
    word: word?.word ?? (word as { text?: string } | undefined)?.text ?? '',
    line_number: word?.line_number ?? 0,
  }));
}

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [stepMap, setStepMap] = useState<Record<string, StepState>>({});
  /** Arrival order for steps we did not predict (model downloads, unknown labels). */
  const [seenOrder, setSeenOrder] = useState<string[]>([]);
  const [livePreviewSegments, setLivePreviewSegments] = useState<DraftSubtitle[]>([]);
  const [speakerCount, setSpeakerCount] = useState<number | null>(null);
  /**
   * The run finished. Not derivable from `stepMap`: the last steps are fast
   * enough that the backend can start and finish them between progress emits, so
   * a step can legitimately reach the end of the run without ever having
   * reported. Completion of the run is the authority, not the per-step reports.
   */
  const [runComplete, setRunComplete] = useState(false);
  const [runCancelled, setRunCancelled] = useState(false);
  const [settings, setSettings] = useState<ProgressSettings>(defaultSettings);
  const settingsRef = useRef<ProgressSettings>(defaultSettings());
  const unlistenersRef = useRef<Array<() => void>>([]);
  const listenersSetupRef = useRef(false);

  const updateProgressStep = useCallback((event: { progress: number; type?: string; label?: string }) => {
    const id = stepIdFromEvent(event.label, event.type);
    if (!id) {
      console.log('Ignoring progress event without a label or type:', event);
      return;
    }

    const progress = Math.max(0, Math.min(100, event.progress ?? 0));

    setStepMap((prev) => {
      const current = prev[id];
      // Progress is monotonic per step: a stage that re-reports a lower value
      // (e.g. a retried download) must not appear to go backwards.
      const next = Math.max(current?.progress ?? 0, progress);
      if (current && current.progress === next) return prev;
      return { ...prev, [id]: { ...current, progress: next } };
    });

    setSeenOrder((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const clearProgressSteps = useCallback(() => {
    setStepMap({});
    setSeenOrder([]);
    setLivePreviewSegments([]);
    setSpeakerCount(null);
    setRunComplete(false);
    setRunCancelled(false);
  }, []);

  const completeAllProgressSteps = useCallback(() => {
    setRunComplete(true);
    setStepMap((prev) => {
      const next: Record<string, StepState> = {};
      for (const [id, state] of Object.entries(prev)) {
        next[id] = { ...state, progress: 100 };
      }
      return next;
    });
  }, []);

  const cancelAllProgressSteps = useCallback(() => {
    setRunCancelled(true);
    setStepMap((prev) => {
      const next: Record<string, StepState> = {};
      for (const [id, state] of Object.entries(prev)) {
        next[id] = state.progress >= 100 ? state : { ...state, isCancelled: true };
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (listenersSetupRef.current) return;
    listenersSetupRef.current = true;

    const setup = async () => {
      const unlistenProgress = await listen<{ progress: number; type?: string; label?: string }>('labeled-progress', (event) => {
        if (getPipelineOwner() === 'queue') return;
        updateProgressStep(event.payload);
      });

      const unlistenSegment = await listen<{ index: number; segment: Subtitle; stage: SegmentStage }>('segment-updated', (event) => {
        if (getPipelineOwner() === 'queue') return;
        const { index, segment, stage } = event.payload;
        setLivePreviewSegments((prev) => {
          const updated = [...prev];
          if (updated.length <= index) {
            updated.length = index + 1;
          }
          // The same index is emitted repeatedly as the segment moves through the
          // pipeline: first the transcribed text, then refined word timings.
          // `stage` is retained so the renderer can present each kind of change
          // differently.
          updated[index] = { ...segment, words: normalizeWords(segment.words), stage };
          return updated;
        });
      });

      const unlistenSpeakers = await listen<{ count: number }>('speakers-identified', (event) => {
        if (getPipelineOwner() === 'queue') return;
        setSpeakerCount(event.payload?.count ?? null);
      });

      const unlistenComplete = await listen('transcription-complete', () => {
        if (getPipelineOwner() === 'queue') return;
        completeAllProgressSteps();
      });

      unlistenersRef.current = [unlistenProgress, unlistenSegment, unlistenSpeakers, unlistenComplete];
    };

    setup();

    return () => {
      unlistenersRef.current.forEach((u) => u?.());
      unlistenersRef.current = [];
    };
  }, [updateProgressStep, completeAllProgressSteps]);

  const setupEventListeners = useCallback((incoming: Partial<ProgressSettings>) => {
    const merged: ProgressSettings = { ...defaultSettings(), ...incoming };
    settingsRef.current = merged;
    setSettings(merged);
    return () => {};
  }, []);

  const processingSteps = useMemo((): ProcessingStep[] => buildProcessingSteps({
    settings, stepMap, seenOrder, runComplete, title: stepTitle,
    speakerDetail: speakerCount === null ? undefined : i18n.t('progressSteps.speakersFound', {
      count: speakerCount, defaultValue: `${speakerCount} speakers`,
    }),
  }), [stepMap, seenOrder, settings, speakerCount, runComplete]);

  const isRunActive = seenOrder.length > 0 && !runComplete && !runCancelled;

  return (
    <ProgressContext.Provider value={{
      processingSteps,
      isRunActive,
      livePreviewSegments,
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
