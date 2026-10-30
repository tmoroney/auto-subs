import assert from "node:assert/strict";
import test from "node:test";
import { groupTranscriptSegments } from "../src/utils/group-transcript-segments.ts";

test("groups consecutive segments by speaker and skips empty text", () => {
  const groups = groupTranscriptSegments(
    [
      { text: "Hello", speaker_id: "1" },
      { text: " ", speaker_id: "1" },
      { text: "there", speaker_id: "1" },
      { text: "Hi", speaker_id: "2" },
      { text: "Again", speaker_id: "1" },
    ],
    true,
  );

  assert.deepEqual(
    groups.map(({ speakerId, segments }) => [
      speakerId,
      segments.map((segment) => segment.text),
    ]),
    [
      ["1", ["Hello", "there"]],
      ["2", ["Hi"]],
      ["1", ["Again"]],
    ],
  );
});

test("groups all segments together when diarization is disabled", () => {
  const groups = groupTranscriptSegments(
    [
      { text: "First", speaker_id: "1" },
      { text: "Second", speaker_id: "2" },
    ],
    false,
  );

  assert.deepEqual(groups, [
    {
      speakerId: null,
      segments: [
        { text: "First", speaker_id: "1" },
        { text: "Second", speaker_id: "2" },
      ],
    },
  ]);
});
