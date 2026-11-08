import assert from "node:assert/strict";
import { isSafeExternalUrl } from "../../Adobe-Extension/src/js/lib/utils/url-security.ts";

// 1. Safe URLs must be accepted
assert.equal(isSafeExternalUrl("https://github.com/tmoroney/auto-subs"), true);
assert.equal(isSafeExternalUrl("https://subslate.app"), true);
assert.equal(isSafeExternalUrl("http://localhost:8185"), true);
assert.equal(isSafeExternalUrl("http://127.0.0.1:8185"), true);
assert.equal(isSafeExternalUrl("https://buymeacoffee.com/tmoroney"), true);

// 2. Dangerous URI schemes must be rejected
assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
assert.equal(isSafeExternalUrl("file:///etc/passwd"), false);
assert.equal(isSafeExternalUrl("file:///C:/Windows/System32/calc.exe"), false);
assert.equal(isSafeExternalUrl("data:text/html,<script>alert(1)</script>"), false);
assert.equal(isSafeExternalUrl("vbscript:msgbox(1)"), false);
assert.equal(isSafeExternalUrl("shell:open"), false);
assert.equal(isSafeExternalUrl("ms-msdt:id%20PCWDiagnostic"), false);

// 3. Invalid inputs must be rejected
assert.equal(isSafeExternalUrl(""), false);
assert.equal(isSafeExternalUrl("   "), false);
assert.equal(isSafeExternalUrl("not-a-url"), false);
assert.equal(isSafeExternalUrl(undefined), false);
assert.equal(isSafeExternalUrl(null), false);

console.log("adobe-url-security tests passed");
