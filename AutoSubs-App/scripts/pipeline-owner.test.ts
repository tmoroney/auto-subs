import test from "node:test";
import assert from "node:assert/strict";
import { getPipelineOwner, releasePipeline, subscribePipelineOwner, tryAcquirePipeline } from "../src/queue/pipeline-owner.ts";

test("one owner holds the pipeline until it releases it", () => {
  const seen: Array<string | null> = [];
  const unsubscribe = subscribePipelineOwner(() => seen.push(getPipelineOwner()));
  assert.equal(tryAcquirePipeline("queue"), true);
  assert.equal(tryAcquirePipeline("manual"), false);
  releasePipeline("manual");
  assert.equal(getPipelineOwner(), "queue");
  releasePipeline("queue");
  assert.equal(tryAcquirePipeline("manual"), true);
  releasePipeline("manual");
  unsubscribe();
  assert.deepEqual(seen, ["queue", null, "manual", null]);
});

test("model deletion and transcription cannot overlap", () => {
  assert.equal(tryAcquirePipeline("model-delete"), true);
  assert.equal(tryAcquirePipeline("manual"), false);
  assert.equal(tryAcquirePipeline("queue"), false);
  releasePipeline("model-delete");
  assert.equal(tryAcquirePipeline("queue"), true);
  assert.equal(tryAcquirePipeline("model-delete"), false);
  releasePipeline("queue");
});
