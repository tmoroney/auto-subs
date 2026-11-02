import test from "node:test";
import assert from "node:assert/strict";
import { recoverQueueJobs, recordQueueProgress, updateJobSettings, queueResultSelectionKey } from "../src/queue/queue-state.ts";
import type { QueueJob, QueueStatus } from "../src/queue/queue-state.ts";
import type { TranscriptionOptions } from "../src/types.ts";

test("recovery marks every in-flight phase interrupted and preserves finished results", () => {
  const statuses: QueueStatus[] = ["pending", "preparing", "transcribing", "exporting", "completed", "failed", "cancelled"];
  const jobs = statuses.map((status, index) => ({
    id: String(index), sourcePath: "clip.mp4", options: {}, status, progress: 40,
    ...(status === "completed" ? { outputPath: "clip.en.srt" } : {}),
  })) as QueueJob[];
  const restored = recoverQueueJobs(jobs);
  assert.deepEqual(restored.map((job) => job.status), ["pending", "interrupted", "interrupted", "interrupted", "completed", "failed", "cancelled"]);
  assert.equal(restored[4].outputPath, "clip.en.srt");
  assert.ok(restored.every((job) => job.progress === undefined));
  assert.equal(jobs[1].status, "preparing");
});

test("updating a completed queue item makes it pending without altering the source or saved document", () => {
  const job = { id: "1", sourcePath: "source.mp4", status: "completed", options: { audioPath: "source.mp4" }, resultFilename: "original.json", outputPaths: ["source.srt"] } as QueueJob;
  const updated = updateJobSettings(job, { audioPath: "other.mp4", censoredWords: ["one"] } as TranscriptionOptions);
  assert.equal(updated.status, "pending");
  assert.equal(updated.options.audioPath, "source.mp4");
  assert.equal(updated.resultFilename, "original.json");
  assert.equal(updated.resultStale, true);
  assert.deepEqual(updated.outputPaths, ["source.srt"]);
  assert.equal(job.resultFilename, "original.json");
  assert.deepEqual(updateJobSettings({ ...job, status: "transcribing" }, updated.options).status, "transcribing");
});

test("result selection waits until work stops and identifies a fresh result", () => {
  const job = { id: "1", sourcePath: "source.mp4", status: "completed", options: {}, resultFilename: "old.json" } as QueueJob;
  const original = queueResultSelectionKey(job, 1);
  assert.ok(original);
  assert.equal(queueResultSelectionKey({ ...job, status: "transcribing" }, 1), null);
  assert.equal(queueResultSelectionKey({ ...job, status: "exporting", resultFilename: "new.json" }, 1), null);
  // The old result remains selectable when a changed job is awaiting retry.
  assert.equal(queueResultSelectionKey({ ...job, status: "pending", resultStale: true }, 1), original);
  assert.notEqual(queueResultSelectionKey({ ...job, resultFilename: "new.json" }, 1), original);
  assert.notEqual(queueResultSelectionKey(job, 2), original);
});

test("queue progress retains separate stages and prevents regressions within each stage", () => {
  let steps = recordQueueProgress([], { label: "progressSteps.prepare.asr", progress: 80 });
  steps = recordQueueProgress(steps, { label: "progressSteps.prepare.asr", progress: 20 });
  steps = recordQueueProgress(steps, { label: "progressSteps.transcribe", progress: 25 });
  assert.deepEqual(steps.map((step) => step.progress), [80, 25]);
});
