import test from "node:test";
import assert from "node:assert/strict";
import { createLatestRequestGate } from "../src/utils/latest-request.ts";

test("an older file load cannot replace a newer selected transcript", async () => {
  const gate = createLatestRequestGate();
  let finishOld!: () => void;
  const oldWork = new Promise<void>((resolve) => { finishOld = resolve; });
  let visible = "";
  const oldCurrent = gate.start();
  const oldLoad = oldWork.then(() => { if (oldCurrent()) visible = "old"; });
  const newCurrent = gate.start();
  if (newCurrent()) visible = "new";
  finishOld();
  await oldLoad;
  assert.equal(visible, "new");
});

test("queue selection invalidates a running file load", () => {
  const gate = createLatestRequestGate();
  const isCurrent = gate.start();
  gate.invalidate();
  assert.equal(isCurrent(), false);
});

test("queue and history loads share the latest selection", () => {
  const gate = createLatestRequestGate();
  const queueLoad = gate.start();
  const historyLoad = gate.start();
  assert.equal(queueLoad(), false);
  assert.equal(historyLoad(), true);
  const nextQueueLoad = gate.start();
  assert.equal(historyLoad(), false);
  assert.equal(nextQueueLoad(), true);
});
