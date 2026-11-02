/** Serialize writes while replacing a waiting snapshot with its latest version. */
export function createLatestSerialWriter<T>(write: (snapshot: T) => Promise<void>) {
  type Waiter = { resolve: () => void; reject: (error: unknown) => void };
  let pending: { snapshot: T; waiters: Waiter[] } | undefined;
  let running = false;

  async function drain() {
    while (pending) {
      const batch = pending;
      pending = undefined;
      try {
        await write(batch.snapshot);
        batch.waiters.forEach(({ resolve }) => resolve());
      } catch (error) {
        batch.waiters.forEach(({ reject }) => reject(error));
      }
    }
    running = false;
  }

  return (snapshot: T): Promise<void> => new Promise((resolve, reject) => {
    if (pending) {
      pending.snapshot = snapshot;
      pending.waiters.push({ resolve, reject });
    } else {
      pending = { snapshot, waiters: [{ resolve, reject }] };
    }
    if (!running) {
      running = true;
      void drain();
    }
  });
}
