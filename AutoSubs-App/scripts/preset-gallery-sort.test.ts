import assert from "node:assert/strict";
import { test } from "node:test";
import type { CaptionPreset } from "../src/types.ts";

function createdMs(preset: CaptionPreset): number {
  const ms = Date.parse(preset.createdAt ?? "");
  return Number.isNaN(ms) ? 0 : ms;
}

function sortPresets(presets: CaptionPreset[]): CaptionPreset[] {
  const len = presets.length;
  const decorated = new Array(len);
  for (let i = 0; i < len; i++) {
    decorated[i] = { preset: presets[i], time: createdMs(presets[i]) };
  }
  decorated.sort((a, b) => {
    if (a.preset.builtIn !== b.preset.builtIn) return a.preset.builtIn ? 1 : -1;
    return b.time - a.time;
  });
  const result = new Array(len);
  for (let i = 0; i < len; i++) {
    result[i] = decorated[i].preset;
  }
  return result;
}

test("preset ordering places custom presets before built-ins", () => {
  const presets: CaptionPreset[] = [
    {
      id: "builtin-1",
      name: "Builtin 1",
      builtIn: true,
      createdAt: "2026-11-01T12:00:00Z",
      macroSettings: {},
    },
    {
      id: "custom-1",
      name: "Custom 1",
      builtIn: false,
      createdAt: "2026-10-01T12:00:00Z",
      macroSettings: {},
    },
  ];

  const sorted = sortPresets(presets);
  assert.equal(sorted[0].id, "custom-1");
  assert.equal(sorted[1].id, "builtin-1");
});

test("preset ordering sorts newest first within each category", () => {
  const presets: CaptionPreset[] = [
    {
      id: "custom-old",
      name: "Custom Old",
      builtIn: false,
      createdAt: "2026-09-01T10:00:00Z",
      macroSettings: {},
    },
    {
      id: "custom-new",
      name: "Custom New",
      builtIn: false,
      createdAt: "2026-11-01T10:00:00Z",
      macroSettings: {},
    },
    {
      id: "builtin-old",
      name: "Builtin Old",
      builtIn: true,
      createdAt: "2026-01-01T10:00:00Z",
      macroSettings: {},
    },
    {
      id: "builtin-new",
      name: "Builtin New",
      builtIn: true,
      createdAt: "2026-05-01T10:00:00Z",
      macroSettings: {},
    },
  ];

  const sorted = sortPresets(presets);
  assert.deepEqual(
    sorted.map((p) => p.id),
    ["custom-new", "custom-old", "builtin-new", "builtin-old"],
  );
});

test("preset ordering handles missing or invalid dates as oldest", () => {
  const presets: CaptionPreset[] = [
    {
      id: "custom-invalid-date",
      name: "Custom Invalid",
      builtIn: false,
      createdAt: "not-a-date",
      macroSettings: {},
    },
    {
      id: "custom-missing-date",
      name: "Custom Missing",
      builtIn: false,
      createdAt: undefined,
      macroSettings: {},
    },
    {
      id: "custom-valid-date",
      name: "Custom Valid",
      builtIn: false,
      createdAt: "2026-10-01T00:00:00Z",
      macroSettings: {},
    },
  ];

  const sorted = sortPresets(presets);
  assert.equal(sorted[0].id, "custom-valid-date");
  // The two invalid/missing date items should both sort after valid date items
  const tailIds = sorted.slice(1).map((p) => p.id);
  assert.ok(tailIds.includes("custom-invalid-date"));
  assert.ok(tailIds.includes("custom-missing-date"));
});

test("preset ordering preserves input array immutability", () => {
  const presets: CaptionPreset[] = [
    {
      id: "p1",
      name: "P1",
      builtIn: false,
      createdAt: "2026-01-01T00:00:00Z",
      macroSettings: {},
    },
    {
      id: "p2",
      name: "P2",
      builtIn: false,
      createdAt: "2026-02-01T00:00:00Z",
      macroSettings: {},
    },
  ];

  const snapshot = JSON.stringify(presets);
  const sorted = sortPresets(presets);
  assert.equal(JSON.stringify(presets), snapshot, "input array was not mutated");
  assert.equal(sorted[0].id, "p2");
});
