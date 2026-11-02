import test from "node:test";
import assert from "node:assert/strict";
import { CancellationBarrier } from "../src/queue/cancellation-barrier.ts";

test("ownership release waits for cancellation and rejects late requests", async () => {
  const barrier = new CancellationBarrier();
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  assert.equal(barrier.request(() => pending, () => assert.fail("unexpected rejection")), true);
  assert.equal(barrier.request(() => pending, () => {}), false);
  let closed = false;
  const closing = barrier.close().then(() => { closed = true; });
  assert.equal(barrier.request(() => pending, () => {}), false);
  await Promise.resolve();
  assert.equal(closed, false);
  finish();
  await closing;
  assert.equal(closed, true);
});

test("rejected cancellation is handled before ownership release", async () => {
  const barrier = new CancellationBarrier();
  let reported: unknown;
  barrier.request(() => Promise.reject("failed"), (error) => { reported = error; });
  await barrier.close();
  assert.equal(reported, "failed");
});
