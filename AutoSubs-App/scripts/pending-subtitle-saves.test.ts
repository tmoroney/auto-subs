import test from "node:test";
import assert from "node:assert/strict";
import { createPendingSubtitleSaves } from "../src/utils/pending-subtitle-saves.ts";

test("failed save remains pending and flush reports the failure", async () => {
  let fail = true;
  const written: string[] = [];
  const saves = createPendingSubtitleSaves<string>(async (_filename, value) => {
    if (fail) throw new Error("disk full");
    written.push(value);
  });
  saves.enqueue("first.json", "edits");
  await assert.rejects(saves.flush(), /disk full/);
  fail = false;
  await saves.flush();
  assert.deepEqual(written, ["edits"]);
});

test("flush waits for an in-flight save and preserves newer edits after failure", async () => {
  let rejectFirst!: (error: Error) => void;
  const first = new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
  const written: string[] = [];
  let calls = 0;
  const saves = createPendingSubtitleSaves<string>(async (_filename, value) => {
    if (++calls === 1) return first;
    written.push(value);
  });
  saves.enqueue("first.json", "old");
  const debounceWrite = saves.flush();
  await Promise.resolve();
  saves.enqueue("first.json", "new");
  saves.enqueue("second.json", "other");
  const switchDocument = saves.flush();
  rejectFirst(new Error("save failed"));
  await assert.rejects(debounceWrite, /save failed/);
  await assert.rejects(switchDocument, /save failed/);
  await saves.flush();
  assert.deepEqual(written, ["new", "other"]);
});
