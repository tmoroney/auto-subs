/**
 * A lock that lets only one async run start at a time. A ref rather than
 * React state: state updates don't land until the next render, so two quick
 * clicks would both read "not busy".
 */
export interface RunLock {
  current: boolean;
}

/** Take the lock, returning its release, or null if a run already holds it. */
export function tryClaimRun(lock: RunLock): (() => void) | null {
  if (lock.current) return null;
  lock.current = true;
  return () => {
    lock.current = false;
  };
}
