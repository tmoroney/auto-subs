import test from "node:test";
import assert from "node:assert/strict";
import { createSerialTaskQueue } from "../src/utils/serial-task-queue.ts";

test("concurrent index updates execute serially and retain each update", async () => {
  const run = createSerialTaskQueue();
  let index: string[] = [];
  const add = (name: string) => run(async () => {
    const copy = [...index];
    await Promise.resolve();
    copy.push(name);
    index = copy;
  });
  await Promise.all([add("editor"), add("queue")]);
  assert.deepEqual(index, ["editor", "queue"]);
});

test("a failed operation does not block later index operations", async () => {
  const run = createSerialTaskQueue();
  const failed = run(async () => { throw new Error("write failed"); });
  const later = run(async () => "saved");
  await assert.rejects(failed, /write failed/);
  assert.equal(await later, "saved");
});
