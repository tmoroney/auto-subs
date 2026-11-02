/** Shared synchronous guard for the single, process-wide transcription pipeline. */
export type PipelineOwner = "manual" | "queue" | "model-delete";

let owner: PipelineOwner | null = null;
const listeners = new Set<() => void>();

export function tryAcquirePipeline(requester: PipelineOwner): boolean {
  if (owner !== null) return false;
  owner = requester;
  listeners.forEach((listener) => listener());
  return true;
}

export function releasePipeline(requester: PipelineOwner): void {
  if (owner !== requester) return;
  owner = null;
  listeners.forEach((listener) => listener());
}

export function getPipelineOwner(): PipelineOwner | null {
  return owner;
}

export function subscribePipelineOwner(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
