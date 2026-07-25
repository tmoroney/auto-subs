import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Subtitle, SegmentStage, DraftSubtitle, Word } from '@/types';
import i18n from '@/i18n';

/**
 * Canonical order of the granular pipeline steps.
 *
 * These are keyed on the `label` the backend already emits (minus the
 * `progressSteps.` prefix), not on `ProgressType`. `ProgressType` only has five
 * variants and is far too coarse to describe what is actually happening, so the
 * label is the source of truth for step identity.
 *
 * Steps in `Prepare` run concurrently with each other (audio normalisation and
 * model downloads overlap), so completion is tracked per step and is never
 * inferred from a sibling starting.
 */
const STEP_ORDER = [
  'prepare.export',
  'prepare.normalize',
  'prepare.download',
  'prepare.asr',
  'prepare.vad',
  'prepare.diarize',
  'prepare.aligner',
  'analyze.vad',
  'analyze.diarize',
  'analyze.loading',
  'transcribe',
  'translate',
  'refine',
  'finish',
] as const;

/**
 * Steps we can predict before the run starts, so the stepper shows the whole
 * spine up front rather than growing one row at a time. Model downloads are
 * deliberately excluded — whether they happen depends on what is already
 * cached, so they appear dynamically only if they actually occur.
 */
function predictedSteps(settings: ProgressSettings): string[] {
  const steps: string[] = [];
  if (settings.audioInputMode === 'timeline') steps.push('prepare.export');
  steps.push('prepare.normalize', 'analyze.vad');
  if (settings.enableDiarize) steps.push('analyze.diarize');
  steps.push('analyze.loading', 'transcribe');
  if (settings.enableForcedAlignment) steps.push('refine');
  steps.push('finish');
  return steps;
}

interface ProcessingStep {
  id: string;
  title: string;
  /** Extra real-world detail, e.g. "3 speakers". Only set when we actually know something. */
  detail?: string;
  progress: number;
  isActive: boolean;
  isCompleted: boolean;
  isCancelled?: boolean;
}

interface ProgressSettings {
  targetLanguage: string;
  language: string;
  enableForcedAlignment: boolean;
  enableDiarize: boolean;
  audioInputMode: 'file' | 'timeline';
}

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

interface StepState {
  progress: number;
  isCancelled?: boolean;
}

function defaultSettings(): ProgressSettings {
  return {
    targetLanguage: 'en',
    language: 'auto',
    enableForcedAlignment: false,
    enableDiarize: false,
    audioInputMode: 'file',
  };
}

/** Turn a backend label (`progressSteps.analyze.vad`) into a step id (`analyze.vad`). */
function stepIdFromEvent(label?: string, type?: string): string | null {
  if (label && typeof label === 'string') {
    const trimmed = label.trim();
    if (trimmed.startsWith('progressSteps.')) {
      return trimmed.slice('progressSteps.'.length);
    }
    if (trimmed) return trimmed;
  }
  // Fall back to the coarse ProgressType so an unlabelled event still lands somewhere.
  return type ? type.toLowerCase() : null;
}

function stepTitle(id: string, targetLanguage: string): string {
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
        updateProgressStep(event.payload);
      });

      const unlistenSegment = await listen<{ index: number; segment: Subtitle; stage: SegmentStage }>('segment-updated', (event) => {
        const { index, segment, stage } = event.payload;
        if (stage === 'translate') return;
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
        setSpeakerCount(event.payload?.count ?? null);
      });

      const unlistenComplete = await listen('transcription-complete', () => {
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

  const processingSteps = useMemo((): ProcessingStep[] => {
    const predicted = predictedSteps(settings);
    // Union of predicted and actually-seen steps, ordered canonically. Anything
    // unrecognised falls to the end in arrival order rather than being dropped.
    const ids: string[] = [];
    for (const id of STEP_ORDER) {
      if (predicted.includes(id) || seenOrder.includes(id)) ids.push(id);
    }
    for (const id of seenOrder) {
      if (!ids.includes(id)) ids.push(id);
    }

    const lastSeenIndex = ids.reduce(
      (acc, id, index) => (stepMap[id] ? index : acc),
      -1,
    );

    return ids
      .map((id, index): ProcessingStep | null => {
        const state = stepMap[id];
        const seen = Boolean(state);
        // A step that never emitted but sits before a step that has is one the
        // backend skipped (e.g. a model that was already cached). Hide it rather
        // than showing a fake 100% or a row stuck at 0%.
        if (!seen && index < lastSeenIndex) return null;

        const isCancelled = !runComplete && (state?.isCancelled ?? false);
        const isCompleted = !isCancelled && (runComplete || (seen && (state?.progress ?? 0) >= 100));
        const progress = isCompleted ? 100 : state?.progress ?? 0;

        return {
          id,
          title: stepTitle(id, settings.targetLanguage),
          detail:
            id === 'analyze.diarize' && speakerCount !== null
              ? i18n.t('progressSteps.speakersFound', {
                  count: speakerCount,
                  defaultValue: `${speakerCount} speakers`,
                })
              : undefined,
          progress,
          isActive: seen && !isCompleted && !isCancelled,
          isCompleted,
          isCancelled,
        };
      })
      .filter((step): step is ProcessingStep => step !== null);
  }, [stepMap, seenOrder, settings, speakerCount, runComplete]);

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
