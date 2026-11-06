import assert from "node:assert/strict";
import { test } from "node:test";
import { generateSrt, parseSrt } from "../src/utils/srt-utils.ts";
import type { Subtitle } from "../src/types.ts";

const baseSeed = Number(process.env.FUZZ_SEED ?? 20261106) >>> 0;
for (const seed of [baseSeed, (baseSeed + 1) >>> 0, (baseSeed + 2) >>> 0]) {
  test(`bounded SRT roundtrip, line endings and input immutability seed=${seed}`, () => {
    let state = seed;
    const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
    const words = ["Hello", "ääni", "字幕", "😀", "<i>text</i>", "a --> b"];
    for (let run = 0; run < 80; run++) {
      // Ordered, separated cues with whole-second times. No claim about invalid
      // timing recovery, overlapping cues, or arbitrary SRT text escaping.
      const cues: Subtitle[] = Array.from({ length: 1 + next() % 12 }, (_, id) => ({
        id,
        start: id * 4 + next() % 2,
        end: id * 4 + 3,
        text: `${words[next() % words.length]}\n${words[next() % words.length]}`,
        words: [],
      }));
      const before = structuredClone(cues);
      const output = generateSrt(cues);
      const expected = cues.map(({ start, end, text }, id) => ({ id: String(id), start, end, text }));
      for (const newline of ["\n", "\r\n", "\r"]) {
        assert.deepEqual(parseSrt("\uFEFF" + output.replaceAll("\n", newline)), expected,
          `seed=${seed} run=${run} newline=${JSON.stringify(newline)}`);
      }
      assert.deepEqual(cues, before, `input mutated seed=${seed} run=${run}`);
    }
  });
}

test("retained two-cue CRLF and BOM regression fixture", () => {
  const source = "\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\nääni\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n字幕\r\n";
  assert.deepEqual(parseSrt(source).map(cue => cue.text), ["ääni", "字幕"]);
});
