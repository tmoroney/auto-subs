/** Serialize asynchronous operations while allowing later work after failures. */
export function createSerialTaskQueue() {
  let tail: Promise<void> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}
