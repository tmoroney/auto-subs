import type { TranscriptionOptions } from "../types";

/** A raw pipeline event for reconstructing the normal progress steps view. */
export interface QueueProgressEvent {
  progress: number;
  type?: string;
  label?: string;
}

export type QueueStatus = "pending" | "preparing" | "transcribing" | "exporting"
  | "completed" | "failed" | "cancelled" | "interrupted";

export interface QueueJob {
  id: string;
  sourcePath: string;
  options: TranscriptionOptions;
  status: QueueStatus;
  progress?: number;
  error?: string;
  outputPath?: string;
  outputPaths?: string[];
  backupPaths?: string[];
  resultFilename?: string;
  /** The retained result belongs to earlier settings and must not be reused. */
  resultStale?: boolean;
  progressSteps?: QueueProgressEvent[];
  speakerCount?: number;
}

export const activeStates: QueueStatus[] = ["preparing", "transcribing", "exporting"];

/** Only switch the editor after processing and export have stopped. */
export function queueResultSelectionKey(job: QueueJob | undefined, selectionVersion: number): string | null {
  if (!job || activeStates.includes(job.status)) return null;
  return JSON.stringify([job.id, selectionVersion, job.resultFilename ?? null]);
}

/** Apply a complete ordering only if it still describes the current queue. */
export function reorderQueueJobs(jobs: QueueJob[], ids: string[]): QueueJob[] {
  if (ids.length !== jobs.length || new Set(ids).size !== ids.length) return jobs;
  const byId = new Map(jobs.map((job) => [job.id, job]));
  if (ids.some((id) => !byId.has(id)) || ids.every((id, index) => jobs[index].id === id)) return jobs;
  return ids.map((id) => byId.get(id)!);
}

/** Keyboard reorder: an active job cannot be picked up, but may be crossed. */
export function moveQueueJob(jobs: QueueJob[], id: string, direction: "up" | "down"): QueueJob[] {
  const index = jobs.findIndex((job) => job.id === id && !activeStates.includes(job.status));
  const target = index + (direction === "up" ? -1 : 1);
  if (index < 0 || target < 0 || target >= jobs.length) return jobs;
  const moved = [...jobs];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved;
}

/** Re-run a non-active item with new settings, leaving any saved document intact. */
export function updateJobSettings(job: QueueJob, options: TranscriptionOptions): QueueJob {
  if (activeStates.includes(job.status)) return job;
  return {
    ...job, status: "pending", error: undefined, progress: undefined,
    options: structuredClone({ ...options, audioPath: job.sourcePath }),
    resultStale: !!job.resultFilename, progressSteps: undefined, speakerCount: undefined,
  };
}

/** Keep one latest, monotonic value per labelled progress stage. */
export function recordQueueProgress(steps: QueueProgressEvent[], event: QueueProgressEvent): QueueProgressEvent[] {
  const progress = Math.max(0, Math.min(100, event.progress));
  const key = event.label || event.type || "";
  const index = steps.findIndex((step) => (step.label || step.type || "") === key);
  const next = [...steps];
  if (index < 0) next.push({ ...event, progress });
  else next[index] = { ...event, progress: Math.max(steps[index].progress, progress) };
  return next;
}

/** Never silently resume work interrupted by an application shutdown. */
export function recoverQueueJobs(jobs: QueueJob[]): QueueJob[] {
  return jobs.map((job) => ({
    ...job,
    status: activeStates.includes(job.status) ? "interrupted" : job.status,
    progress: undefined,
  }));
}
