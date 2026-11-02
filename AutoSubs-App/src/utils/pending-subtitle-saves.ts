/** Coalesce edits per document and serialize their writes. */
export function createPendingSubtitleSaves<T>(write: (filename: string, value: T) => Promise<void>) {
  const pending = new Map<string, T>();
  let inFlight: Promise<void> | null = null;

  const enqueue = (filename: string, value: T) => { pending.set(filename, value); };
  const discard = (filename: string) => { pending.delete(filename); };

  const flush = async (): Promise<void> => {
    // A debounced write may already be running when a caller opens a different
    // document. Wait for it and propagate any failure before switching.
    if (inFlight) {
      await inFlight;
      return flush();
    }
    while (pending.size > 0) {
      const [filename, value] = pending.entries().next().value as [string, T];
      pending.delete(filename);
      const operation = Promise.resolve().then(() => write(filename, value)).catch((error: unknown) => {
        // A newer snapshot of the same document supersedes this one. Never
        // replace it with stale edits; otherwise retain this snapshot for retry.
        if (!pending.has(filename)) pending.set(filename, value);
        throw error;
      });
      inFlight = operation;
      try {
        await operation;
      } finally {
        if (inFlight === operation) inFlight = null;
      }
    }
  };

  return { enqueue, discard, flush };
}
