import assert from "node:assert/strict";
import { buildEvalFileScript } from "../../Adobe-Extension/src/js/lib/utils/file-security.ts";

// 1. Standard paths are safely wrapped in JSON string literals
{
  const standardScript = buildEvalFileScript("/Library/Application Support/Adobe/CEP/extensions/index.js");
  assert.equal(
    standardScript,
    'typeof $ !== \'undefined\' ? $.evalFile("/Library/Application Support/Adobe/CEP/extensions/index.js") : fl.runScript(FLfile.platformPathToURI("/Library/Application Support/Adobe/CEP/extensions/index.js"));'
  );
}

// 2. Windows paths containing backslashes are properly escaped in JSON literals
{
  const winScript = buildEvalFileScript("C:\\Program Files\\Adobe\\extension\\index.js");
  assert.equal(
    winScript,
    'typeof $ !== \'undefined\' ? $.evalFile("C:\\\\Program Files\\\\Adobe\\\\extension\\\\index.js") : fl.runScript(FLfile.platformPathToURI("C:\\\\Program Files\\\\Adobe\\\\extension\\\\index.js"));'
  );
}

// 3. Paths with double quotes, newlines, and breakout injection payloads cannot break out of string literal
{
  const injectionPayload = '"); alert("pwned"); //';
  const injectionScript = buildEvalFileScript(injectionPayload);

  // Must escape the double quotes and not allow unescaped quotes to terminate the string early
  assert.ok(injectionScript.includes(JSON.stringify(injectionPayload)));
  assert.ok(!injectionScript.includes('$.evalFile(""); alert("pwned"); //")'));
}

// 4. Paths with newlines or control characters are escaped
{
  const newlinePayload = "/path/to/\nmalicious.js";
  const newlineScript = buildEvalFileScript(newlinePayload);
  assert.ok(newlineScript.includes(JSON.stringify(newlinePayload)));
  assert.ok(!newlineScript.includes("\n"));
}

console.log("adobe-bolt-security tests passed");
