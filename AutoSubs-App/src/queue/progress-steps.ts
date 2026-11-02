/** Shared presentation of pipeline progress for current and queued jobs. */
export interface ProgressSettings {
  targetLanguage: string;
  language: string;
  enableForcedAlignment: boolean;
  enableDiarize: boolean;
  audioInputMode: 'file' | 'timeline';
}

export interface ProcessingStep {
  id: string;
  title: string;
  detail?: string;
  progress: number;
  isActive: boolean;
  isCompleted: boolean;
  isCancelled?: boolean;
}

export interface StepState {
  progress: number;
  isCancelled?: boolean;
}

const STEP_ORDER = [
  'prepare.export', 'prepare.normalize', 'prepare.download', 'prepare.asr',
  'prepare.vad', 'prepare.diarize', 'prepare.aligner', 'analyze.vad',
  'analyze.diarize', 'analyze.loading', 'transcribe', 'translate', 'refine', 'finish',
];

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

export function stepIdFromEvent(label?: string, type?: string): string | null {
  if (label && typeof label === 'string') {
    const trimmed = label.trim();
    if (trimmed.startsWith('progressSteps.')) return trimmed.slice('progressSteps.'.length);
    if (trimmed) return trimmed;
  }
  return type ? type.toLowerCase() : null;
}

/** Prepare steps can overlap, so each is active until its own completion. */
export function buildProcessingSteps({ settings, stepMap, seenOrder, runComplete, title, speakerDetail }: {
  settings: ProgressSettings;
  stepMap: Record<string, StepState>;
  seenOrder: string[];
  runComplete: boolean;
  title: (id: string, targetLanguage: string) => string;
  speakerDetail?: string;
}): ProcessingStep[] {
  const predicted = predictedSteps(settings);
  const ids = STEP_ORDER.filter((id) => predicted.includes(id) || seenOrder.includes(id));
  for (const id of seenOrder) if (!ids.includes(id)) ids.push(id);
  const lastSeenIndex = ids.reduce((acc, id, index) => stepMap[id] ? index : acc, -1);

  return ids.map((id, index): ProcessingStep | null => {
    const state = stepMap[id];
    const seen = Boolean(state);
    if (!seen && index < lastSeenIndex) return null;
    const isCancelled = !runComplete && (state?.isCancelled ?? false);
    const isExportDone = id === 'prepare.export' && seen && lastSeenIndex > index;
    const isCompleted = !isCancelled && (runComplete || (seen && (state?.progress ?? 0) >= 100) || isExportDone);
    return {
      id,
      title: title(id, settings.targetLanguage),
      detail: id === 'analyze.diarize' ? speakerDetail : undefined,
      progress: isCompleted ? 100 : state?.progress ?? 0,
      isActive: seen && !isCompleted && !isCancelled,
      isCompleted,
      isCancelled,
    };
  }).filter((step): step is ProcessingStep => step !== null);
}
