import test from "node:test";
import assert from "node:assert/strict";
import { moveQueueJob, reorderQueueJobs, type QueueJob } from "../src/queue/queue-state.ts";

function jobs(): QueueJob[] {
  return [
    { id: "first", status: "pending" },
    { id: "active", status: "transcribing" },
    { id: "done", status: "completed" },
    { id: "last", status: "pending" },
  ] as QueueJob[];
}

test("a dropped pending item can cross completed and active jobs without changing them", () => {
  const original = jobs();
  const reordered = reorderQueueJobs(original, ["last", "first", "active", "done"]);
  assert.deepEqual(reordered.map((job) => job.id), ["last", "first", "active", "done"]);
  assert.equal(reordered[2], original[1]);
  assert.equal(reordered[2].status, "transcribing");
  assert.deepEqual(original.map((job) => job.id), ["first", "active", "done", "last"]);
});

test("stale, partial or duplicate order snapshots do not alter the queue", () => {
  const original = jobs();
  for (const ids of [["first", "active"], ["first", "active", "done", "deleted"], ["first", "active", "done", "done"]]) {
    assert.equal(reorderQueueJobs(original, ids), original);
  }
});

test("keyboard ordering works at the first position and across nonpending jobs", () => {
  const original = jobs();
  const firstDown = moveQueueJob(original, "first", "down");
  assert.deepEqual(firstDown.map((job) => job.id), ["active", "first", "done", "last"]);
  assert.equal(moveQueueJob(original, "active", "down"), original);
  assert.equal(moveQueueJob(original, "first", "up"), original);
  const lastUp = moveQueueJob(original, "last", "up");
  assert.deepEqual(lastUp.map((job) => job.id), ["first", "active", "last", "done"]);
});
