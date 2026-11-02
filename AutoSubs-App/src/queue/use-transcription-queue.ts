import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load, type Store } from "@tauri-apps/plugin-store";
import type { TranscriptionOptions } from "@/types";
import { ensureQueueModels, transcribeQueueFile, exportQueueTranscript, type QueueOutputFormat } from "./job-service";
import { loadQueueResult, saveQueueResult } from "./result-store";
import { tryAcquirePipeline, releasePipeline } from "./pipeline-owner";
import { activeStates, recoverQueueJobs, recordQueueProgress, reorderQueueJobs, moveQueueJob, updateJobSettings, type QueueJob, type QueueProgressEvent } from "./queue-state";
import { CancellationBarrier } from "./cancellation-barrier";
import { createLatestSerialWriter } from "@/utils/latest-serial-writer";
export type { QueueJob, QueueStatus } from "./queue-state";

interface QueueState {
  jobs: QueueJob[];
  outputFolder: string | null;
  saveFormats: QueueOutputFormat[];
  running: boolean;
  paused: boolean;
}

interface PersistedQueue {
  version: 1;
  jobs: QueueJob[];
  saveFormats?: QueueOutputFormat[];
}

const STORE_FILE = "autosubs-queue.json";
const STORE_KEY = "queue";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Owns one serial queue. This hook should be mounted once for the workspace.
 * The caller obtains and re-grants source/output filesystem access as needed.
 */
export function useTranscriptionQueue(validateOptions?: (options: TranscriptionOptions) => string | null) {
  const validateOptionsRef = React.useRef(validateOptions);
  validateOptionsRef.current = validateOptions;
  const [state, setState] = React.useState<QueueState>({ jobs: [], outputFolder: null, saveFormats: ["srt"], running: false, paused: false });
  const stateRef = React.useRef(state);
  const [hydrated, setHydrated] = React.useState(false);
  const [storageError, setStorageError] = React.useState<string | null>(null);
  const storeRef = React.useRef<Store | null>(null);
  const persistRef = React.useRef<Promise<void>>(Promise.resolve());
  const storageFailureRef = React.useRef(false);
  const storageFailureMessageRef = React.useRef<string | null>(null);
  const writerRef = React.useRef<((snapshot: PersistedQueue) => Promise<void>) | null>(null);
  if (!writerRef.current) {
    writerRef.current = createLatestSerialWriter(async (snapshot: PersistedQueue) => {
      try {
        const store = storeRef.current;
        if (!store) throw new Error("Queue storage is not available");
        await store.set(STORE_KEY, snapshot);
        await store.save();
      } catch (error) {
        storageFailureRef.current = true;
        storageFailureMessageRef.current = errorMessage(error);
        setStorageError(storageFailureMessageRef.current);
        throw error;
      }
    });
  }
  const cancelRef = React.useRef(false);
  const stopReasonRef = React.useRef<"pause" | "cancel" | null>(null);
  const pauseRef = React.useRef(false);
  const runningRef = React.useRef(false);
  const activeIdRef = React.useRef<string | null>(null);
  const cancelBarrierRef = React.useRef<CancellationBarrier | null>(null);
  const progressListenerReadyRef = React.useRef<Promise<string | null>>(Promise.resolve(null));

  // Serialise disk writes to preserve transition order; never write resolved
  // model paths or output-folder grants (those do not survive a restart).
  const persist = React.useCallback((jobs: QueueJob[], saveFormats: QueueOutputFormat[]) => {
    const snapshot: PersistedQueue = { version: 1, jobs: jobs.map((job) => ({ ...job, progress: undefined })), saveFormats: [...saveFormats] };
    persistRef.current = writerRef.current!(snapshot).then(() => {
      // A later successful write must not let a running queue proceed after
      // any earlier storage failure in this session.
      if (storageFailureRef.current) throw new Error(storageFailureMessageRef.current ?? "Queue storage is not available");
    });
    // Mark this promise handled even for synchronous UI actions. The runner
    // awaits it before executing the next stage.
    void persistRef.current.catch(() => {});
    return persistRef.current;
  }, []);

  const commit = React.useCallback((update: (current: QueueState) => QueueState, save = true) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (save) void persist(next.jobs, next.saveFormats);
    return next;
  }, [persist]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const store = await load(STORE_FILE, { autoSave: false });
        const saved = await store.get<PersistedQueue>(STORE_KEY);
        if (!alive) return;
        storeRef.current = store;
        if (saved && saved.version !== 1) throw new Error("Unsupported queue storage version");
        const jobs = Array.isArray(saved?.jobs) ? recoverQueueJobs(saved.jobs) : [];
        const saveFormats = Array.isArray(saved?.saveFormats)
          ? saved.saveFormats.filter((format): format is QueueOutputFormat => format === "srt" || format === "txt")
          : ["srt"] as QueueOutputFormat[];
        commit((current) => ({ ...current, jobs, saveFormats, paused: jobs.some((job) => job.status === "interrupted") }), false);
        setHydrated(true);
        if (jobs.some((job) => job.status === "interrupted")) void persist(jobs, saveFormats);
      } catch (error) {
        if (alive) {
          storageFailureRef.current = true;
          setStorageError(errorMessage(error));
        }
      }
    })();
    return () => { alive = false; };
  }, [commit, persist]);

  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unlistenSpeakers: (() => void) | undefined;
    let alive = true;
    const progressReady = listen<QueueProgressEvent>("labeled-progress", (event) => {
      const id = activeIdRef.current;
      if (!id || !Number.isFinite(event.payload.progress)) return;
      const progress = Math.max(0, Math.min(100, event.payload.progress));
      commit((current) => ({
        ...current,
        jobs: current.jobs.map((job) => {
          if (job.id !== id) return job;
          return { ...job, progress, progressSteps: recordQueueProgress(job.progressSteps ?? [], event.payload) };
        }),
      }), false);
    }).then((off) => {
      if (alive) unlisten = off; else off();
      return null;
    }).catch((error) => errorMessage(error));
    const speakersReady = listen<{ count: number }>("speakers-identified", (event) => {
      const id = activeIdRef.current;
      if (!id || !Number.isFinite(event.payload.count)) return;
      commit((current) => ({ ...current, jobs: current.jobs.map((job) =>
        job.id === id ? { ...job, speakerCount: event.payload.count } : job) }), false);
    }).then((off) => { if (alive) unlistenSpeakers = off; else off(); return null; })
      .catch((error) => errorMessage(error));
    progressListenerReadyRef.current = Promise.all([progressReady, speakersReady]).then(([a, b]) => a || b);
    return () => { alive = false; unlisten?.(); unlistenSpeakers?.(); };
  }, [commit]);

  const setOutputFolder = React.useCallback((folder: string | null) => {
    if (runningRef.current) return;
    commit((current) => ({ ...current, outputFolder: folder }), false);
  }, [commit]);

  const setSaveFormats = React.useCallback((formats: QueueOutputFormat[]) => {
    if (runningRef.current) return;
    commit((current) => ({ ...current, saveFormats: [...new Set(formats.filter((format) => format === "srt" || format === "txt"))] }));
  }, [commit]);

  const addItems = React.useCallback((options: TranscriptionOptions[]) => {
    if (!hydrated || storageError) return;
    const jobs = options.map((option) => ({
      id: newId(), sourcePath: option.audioPath,
      options: structuredClone(option), status: "pending" as const,
    }));
    commit((current) => ({ ...current, jobs: [...current.jobs, ...jobs] }));
  }, [commit, hydrated, storageError]);

  const patchJob = React.useCallback((id: string, patch: Partial<QueueJob>) => {
    commit((current) => ({
      ...current,
      jobs: current.jobs.map((job) => job.id === id ? { ...job, ...patch } : job),
    }));
  }, [commit]);

  const start = React.useCallback((): boolean => {
    if (!hydrated || storageFailureRef.current || runningRef.current ||
        !stateRef.current.jobs.some((job) => job.status === "pending") || !tryAcquirePipeline("queue")) return false;
    runningRef.current = true;
    pauseRef.current = false;
    cancelRef.current = false;
    stopReasonRef.current = null;
    const cancelBarrier = new CancellationBarrier();
    cancelBarrierRef.current = cancelBarrier;
    commit((current) => ({ ...current, running: true, paused: false }), false);

    void (async () => {
      try {
        while (!pauseRef.current) {
          const job = stateRef.current.jobs.find((item) => item.status === "pending");
          const outputFolder = stateRef.current.outputFolder;
          if (!job) break;
          // Pending settings can be edited after the queue-wide preflight.
          // Recheck immediately before starting so invalid edits cannot run.
          const validationError = validateOptionsRef.current?.(job.options);
          if (validationError) {
            patchJob(job.id, { status: "failed", error: validationError });
            continue;
          }
          activeIdRef.current = job.id;
          cancelRef.current = false;
          stopReasonRef.current = null;
          patchJob(job.id, { status: "preparing", progress: 0, error: undefined, progressSteps: [] });
          try {
            // Model downloads can emit progress immediately. Register the
            // listener before starting preparation so the first steps are not lost.
            const listenerError = await progressListenerReadyRef.current;
            if (listenerError) throw new Error(listenerError);
            // Do not launch work if we cannot durably record its transition.
            await persistRef.current;
            await invoke("queue_reset_cancellation");
            if (cancelRef.current) throw new Error("Cancelled");
            let transcript = job.resultFilename && !job.resultStale ? await loadQueueResult(job.resultFilename) : null;
            if (!transcript) {
              patchJob(job.id, { speakerCount: undefined });
              const options = await ensureQueueModels(job.options);
              if (cancelRef.current) throw new Error("Cancelled");
              patchJob(job.id, { status: "transcribing", progress: 0 });
              await persistRef.current;
              if (cancelRef.current) throw new Error("Cancelled");
              transcript = await transcribeQueueFile(options);
              if (cancelRef.current) throw new Error("Cancelled");
              const resultFilename = await saveQueueResult(job.id, job.sourcePath, transcript);
              patchJob(job.id, { resultFilename, resultStale: false });
              await persistRef.current;
            }
            if (cancelRef.current) throw new Error("Cancelled");
            patchJob(job.id, { status: "exporting", progress: undefined });
            await persistRef.current;
            if (cancelRef.current) throw new Error("Cancelled");
            const result = stateRef.current.saveFormats.length
              ? await exportQueueTranscript(transcript, job.sourcePath, stateRef.current.saveFormats, outputFolder)
              : { outputPaths: [], backupPaths: [] };
            // Export is not interruptible. If it succeeded, retain the output
            // even when cancellation was requested while the write was running.
            patchJob(job.id, { status: "completed", progress: 100, outputPath: result.outputPaths[0], outputPaths: result.outputPaths, backupPaths: result.backupPaths });
            await persistRef.current;
          } catch (error) {
            const cancelled = cancelRef.current;
            const pausedCurrent = stopReasonRef.current === "pause";
            // A successful output remains successful even if persisting that
            // success fails. Do not lose the output path or invite a retry.
            const currentJob = stateRef.current.jobs.find((item) => item.id === job.id);
            if (currentJob?.status !== "completed") {
              patchJob(job.id, {
                status: pausedCurrent ? "pending" : cancelled ? "cancelled" : "failed",
                error: cancelled ? undefined : errorMessage(error), progress: undefined,
              });
            }
            // An export error can affect every remaining output (lost folder
            // grant, full disk, etc.). Pause so the user can correct it first.
            if (cancelled || storageFailureRef.current || currentJob?.status === "exporting") pauseRef.current = true;
          } finally {
            activeIdRef.current = null;
          }
        }
      } finally {
        // A late cancellation must not affect a subsequent pipeline owner.
        // close() rejects new requests before waiting for the IPC to settle.
        await cancelBarrier.close();
        cancelBarrierRef.current = null;
        runningRef.current = false;
        releasePipeline("queue");
        commit((current) => ({ ...current, running: false, paused: pauseRef.current }), false);
      }
    })();
    return true;
  }, [commit, hydrated, patchJob, storageError]);

  const pause = React.useCallback(() => {
    if (!runningRef.current) return;
    pauseRef.current = true;
    commit((current) => ({ ...current, paused: true }), false);
    // Cancellation is cooperative: a native inference or FFmpeg operation may
    // finish before stopping. Export is allowed to complete to protect files.
    const active = stateRef.current.jobs.find((job) => job.id === activeIdRef.current);
    if (active && (active.status === "preparing" || active.status === "transcribing")) {
      stopReasonRef.current = "pause";
      cancelRef.current = true;
      cancelBarrierRef.current?.request(() => invoke("cancel_transcription"), console.error);
    }
  }, [commit]);
  const resume = start;
  const cancelCurrent = React.useCallback(() => {
    if (!runningRef.current || !activeIdRef.current) return;
    const active = stateRef.current.jobs.find((job) => job.id === activeIdRef.current);
    if (active?.status === "exporting") {
      pauseRef.current = true;
      commit((current) => ({ ...current, paused: true }), false);
      return;
    }
    stopReasonRef.current = "cancel";
    const requested = cancelBarrierRef.current?.request(
      () => invoke("cancel_transcription"),
      (error) => console.error("Queue cancellation failed:", error),
    );
    // Pause may already have a cancellation request in flight. In that case
    // upgrading the stop reason to cancel is enough.
    if (!requested && !cancelRef.current) return;
    pauseRef.current = true;
    cancelRef.current = true;
    commit((current) => ({ ...current, paused: true }), false);
  }, [commit]);

  const retry = React.useCallback((id: string) => {
    commit((current) => ({ ...current, jobs: current.jobs.map((job) =>
      job.id === id && ["failed", "cancelled", "interrupted"].includes(job.status)
        ? { ...job, status: "pending", error: undefined, progress: undefined }
        : job) }));
  }, [commit]);
  const failUnavailableSources = React.useCallback((paths: string[], error: string) => {
    const unavailable = new Set(paths);
    commit((current) => ({ ...current, jobs: current.jobs.map((job) =>
      job.status === "pending" && unavailable.has(job.sourcePath)
        ? { ...job, status: "failed", error, progress: undefined }
        : job) }));
  }, [commit]);
  const getItems = React.useCallback(() => stateRef.current.jobs, []);
  const getOutputFolder = React.useCallback(() => stateRef.current.outputFolder, []);
  const getSaveFormats = React.useCallback(() => stateRef.current.saveFormats, []);
  const remove = React.useCallback((id: string) => {
    commit((current) => {
      const jobs = current.jobs.filter((job) => job.id !== id || activeStates.includes(job.status));
      return { ...current, jobs, paused: jobs.length ? current.paused : false };
    });
  }, [commit]);
  const duplicate = React.useCallback((id: string) => {
    commit((current) => {
      const job = current.jobs.find((item) => item.id === id);
      return job ? { ...current, jobs: [...current.jobs, { ...structuredClone(job), id: newId(), status: "pending", error: undefined, outputPath: undefined, outputPaths: undefined, backupPaths: undefined, resultFilename: undefined, resultStale: undefined, progressSteps: undefined, progress: undefined, speakerCount: undefined }] } : current;
    });
  }, [commit]);
  const move = React.useCallback((id: string, direction: "up" | "down") => {
    commit((current) => {
      const jobs = moveQueueJob(current.jobs, id, direction);
      return jobs === current.jobs ? current : { ...current, jobs };
    });
  }, [commit]);
  const reorder = React.useCallback((ids: string[]) => {
    commit((current) => {
      const jobs = reorderQueueJobs(current.jobs, ids);
      return jobs === current.jobs ? current : { ...current, jobs };
    });
  }, [commit]);
  const updateOptions = React.useCallback((id: string, options: TranscriptionOptions) => {
    commit((current) => ({ ...current, jobs: current.jobs.map((job) =>
      job.id === id ? updateJobSettings(job, options) : job) }));
  }, [commit]);
  const clearQueue = React.useCallback((): boolean => {
    // Keep an in-flight job and its export transaction intact.
    if (runningRef.current) return false;
    commit((current) => ({ ...current, jobs: [], paused: false }));
    return true;
  }, [commit]);
  return { items: state.jobs, activeJobId: state.jobs.find((job) => activeStates.includes(job.status))?.id ?? null,
    running: state.running, paused: state.paused, outputFolder: state.outputFolder, saveFormats: state.saveFormats,
    hydrated, storageError, setOutputFolder, setSaveFormats, addItems, start, pause, resume, cancelCurrent,
    retry, failUnavailableSources, getItems, getOutputFolder, getSaveFormats, remove, duplicate, move, reorder, updateOptions, clearQueue };
}
