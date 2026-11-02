/** Guard asynchronous UI loads so older results cannot replace newer choices. */
export function createLatestRequestGate() {
  let generation = 0;
  return {
    start() {
      const current = ++generation;
      return () => current === generation;
    },
    invalidate() { generation++; },
  };
}
