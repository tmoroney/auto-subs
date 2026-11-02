import test from "node:test";
import assert from "node:assert/strict";
import { createLatestSerialWriter } from "../src/utils/latest-serial-writer.ts";

test("coalesces waiting snapshots and resolves only after the latest is written", async () => {
  const written: number[] = [];
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const write = createLatestSerialWriter(async (snapshot: number) => {
    written.push(snapshot);
    if (snapshot === 1) await gate;
  });
  const first = write(1);
  const second = write(2);
  let latestFinished = false;
  const third = write(3).then(() => { latestFinished = true; });
  assert.deepEqual(written, [1]);
  assert.equal(latestFinished, false);
  releaseFirst();
  await Promise.all([first, second, third]);
  assert.deepEqual(written, [1, 3]);
});

test("a failed write rejects its callers but does not discard a later snapshot", async () => {
  let rejectFirst!: (error: Error) => void;
  const gate = new Promise<void>((_, reject) => { rejectFirst = reject; });
  const written: number[] = [];
  const write = createLatestSerialWriter(async (snapshot: number) => {
    written.push(snapshot);
    if (snapshot === 1) await gate;
  });
  const first = write(1);
  const later = write(2);
  rejectFirst(new Error("write failed"));
  await assert.rejects(first, /write failed/);
  await later;
  assert.deepEqual(written, [1, 2]);
});

test("all callers whose snapshots coalesce receive a write failure", async () => {
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const write = createLatestSerialWriter(async (snapshot: number) => {
    if (snapshot === 1) await gate;
    else throw new Error("write failed");
  });
  const first = write(1);
  const second = write(2);
  const third = write(3);
  const failures = Promise.all([assert.rejects(second, /write failed/), assert.rejects(third, /write failed/)]);
  releaseFirst();
  await first;
  await failures;
});
