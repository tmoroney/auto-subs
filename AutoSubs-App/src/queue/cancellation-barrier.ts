/** Keep ownership until an asynchronous cancellation request has settled. */
export class CancellationBarrier {
  private closing = false;
  private pending: Promise<void> | null = null;

  request(action: () => Promise<unknown>, onError: (error: unknown) => void): boolean {
    if (this.closing || this.pending) return false;
    // Begin asynchronously so synchronous exceptions are handled too.
    this.pending = Promise.resolve().then(action).then(() => {}, (error) => {
      try { onError(error); } catch { /* Reporting must not strand the owner. */ }
    });
    return true;
  }

  async close(): Promise<void> {
    // Synchronously block later requests before awaiting the existing one.
    this.closing = true;
    await this.pending;
  }
}
