/**
 * A lock that lets only one async run start at a time. A ref rather than
 * React state: state updates don't land until the next render, so two quick
 * clicks would both read "not busy". Pair it with visible busy state so a
 * click it turns away never looks like it should have worked.
 */
export interface RunLock {
  current: boolean;
}

/**
 * Take the lock, returning its release, or null if a run already holds it.
 * The release works once: calling it again later can't free the lock for a
 * newer run that has taken it since.
 */
export function tryClaimRun(lock: RunLock): (() => void) | null {
  if (lock.current) return null;
  lock.current = true;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lock.current = false;
  };
}
