import assert from "node:assert/strict";
import { parseImportedPreset } from "../src/lib/preset-import.ts";

// 1. Valid preset JSON should parse successfully
{
  const validJson = JSON.stringify({
    name: "Custom Style",
    description: "A nice preset for videos",
    version: 1,
    macroSettings: {
      fontSize: 48,
      fontColor: { r: 1, g: 1, b: 1 },
      enabled: true,
    },
  });

  const preset = parseImportedPreset(validJson);
  assert.equal(preset.name, "Custom Style");
  assert.equal(preset.description, "A nice preset for videos");
  assert.equal(preset.version, 1);
  assert.equal(preset.builtIn, false);
  assert.deepEqual(preset.macroSettings, {
    fontSize: 48,
    fontColor: { r: 1, g: 1, b: 1 },
    enabled: true,
  });
}

// 2. Prototype pollution prevention
{
  const maliciousJson = JSON.stringify({
    name: "Exploit Attempt",
    version: 1,
    macroSettings: {
      fontSize: 10,
      __proto__: { isAdmin: true },
      nested: {
        constructor: { evil: true },
        prototype: { bad: true },
        validProp: "safe",
      },
    },
  });

  const parsed = parseImportedPreset(maliciousJson);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.macroSettings, "__proto__"), false);
  assert.equal((({} as any).isAdmin), undefined);
  const nested = (parsed.macroSettings as any).nested;
  assert.equal(Object.prototype.hasOwnProperty.call(nested, "constructor"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(nested, "prototype"), false);
  assert.equal(nested.validProp, "safe");
}

// 3. Name length bounds and invalid characters
{
  // Empty name
  assert.throws(() => parseImportedPreset(JSON.stringify({
    name: "",
    version: 1,
    macroSettings: {},
  })), /missing a name/);

  // Whitespace-only name
  assert.throws(() => parseImportedPreset(JSON.stringify({
    name: "   ",
    version: 1,
    macroSettings: {},
  })), /missing a name/);

  // Oversized name (> 100 chars)
  assert.throws(() => parseImportedPreset(JSON.stringify({
    name: "a".repeat(101),
    version: 1,
    macroSettings: {},
  })), /exceeds 100 characters/);

  // Control characters / null bytes in name
  assert.throws(() => parseImportedPreset(JSON.stringify({
    name: "preset\0evil",
    version: 1,
    macroSettings: {},
  })), /invalid characters/);

  assert.throws(() => parseImportedPreset(JSON.stringify({
    name: "preset\x07bell",
    version: 1,
    macroSettings: {},
  })), /invalid characters/);
}

// 4. Description length bounds and control characters
{
  // Oversized description (> 500 chars)
  assert.throws(() => parseImportedPreset(JSON.stringify({
    name: "Valid Name",
    description: "x".repeat(501),
    version: 1,
    macroSettings: {},
  })), /exceeds 500 characters/);

  // Dangerous control characters in description
  assert.throws(() => parseImportedPreset(JSON.stringify({
    name: "Valid Name",
    description: "desc\0bad",
    version: 1,
    macroSettings: {},
  })), /invalid or exceeds 500 characters/);
}

// 5. Version validation
{
  // Non-number version
  assert.throws(() => parseImportedPreset(JSON.stringify({
    name: "Valid Name",
    version: "1",
    macroSettings: {},
  })), /invalid version/);

  // Non-positive version
  assert.throws(() => parseImportedPreset(JSON.stringify({
    name: "Valid Name",
    version: 0,
    macroSettings: {},
  })), /invalid version/);

  // Negative version
  assert.throws(() => parseImportedPreset(JSON.stringify({
    name: "Valid Name",
    version: -1,
    macroSettings: {},
  })), /invalid version/);

  // Non-integer version
  assert.throws(() => parseImportedPreset(JSON.stringify({
    name: "Valid Name",
    version: 1.5,
    macroSettings: {},
  })), /invalid version/);
}

// 6. macroSettings shape validation
{
  assert.throws(() => parseImportedPreset(JSON.stringify({
    name: "Valid Name",
    version: 1,
    macroSettings: null,
  })), /missing macroSettings/);

  assert.throws(() => parseImportedPreset(JSON.stringify({
    name: "Valid Name",
    version: 1,
    macroSettings: [1, 2, 3],
  })), /missing macroSettings/);
}

console.log("preset-import security tests passed");
