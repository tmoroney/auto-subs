/**
 * Sentinel Security: Validates that an incoming file path for SRT import
 * is well-formed, points strictly to an .srt file, and does not contain
 * directory traversal sequences, null bytes, or control characters.
 */
export const isValidSrtFilePath = (filePath: unknown): filePath is string => {
  if (typeof filePath !== "string") {
    return false;
  }
  const trimmed = filePath.trim();
  if (!trimmed || trimmed.length > 4096) {
    return false;
  }
  // Reject null bytes and non-printable control characters
  if (/[\x00-\x1f\x7f]/.test(filePath)) {
    return false;
  }
  // Reject directory traversal sequences
  if (trimmed.includes("..")) {
    return false;
  }
  // Strictly enforce .srt extension (case-insensitive), ensuring there is a filename before .srt
  const base = trimmed.split(/[/\\]/).pop() || "";
  if (!/\.srt$/i.test(base) || base.toLowerCase() === ".srt") {
    return false;
  }
  return true;
};

/**
 * Sentinel Security: Safely constructs an ExtendScript snippet to load a script file,
 * escaping the file path using JSON stringification to prevent string literal breakout
 * and arbitrary ExtendScript injection.
 */
export const buildEvalFileScript = (file: string): string => {
  const fileLiteral = JSON.stringify(file);
  return (
    "typeof $ !== 'undefined' ? $.evalFile(" +
    fileLiteral +
    ") : fl.runScript(FLfile.platformPathToURI(" +
    fileLiteral +
    "));"
  );
};

/**
 * Sentinel Security: Validates that an incoming directory path for audio export
 * is well-formed, does not contain directory traversal sequences, null bytes,
 * or non-printable control characters.
 */
export const isValidExportFolderPath = (folderPath: unknown): folderPath is string => {
  if (typeof folderPath !== "string") {
    return false;
  }
  const trimmed = folderPath.trim();
  if (!trimmed || trimmed.length > 4096) {
    return false;
  }
  // Reject null bytes and non-printable control characters
  if (/[\x00-\x1f\x7f]/.test(folderPath)) {
    return false;
  }
  // Reject directory traversal sequences
  if (trimmed.includes("..")) {
    return false;
  }
  return true;
};

/**
 * Sentinel Security: Validates that an incoming Premiere export preset path
 * is well-formed, points strictly to an .epr file, and does not contain
 * directory traversal sequences, null bytes, or control characters.
 * An empty string or undefined indicates no external preset is specified.
 */
export const isValidPresetFilePath = (presetPath: unknown): presetPath is string => {
  if (typeof presetPath !== "string") {
    return false;
  }
  const trimmed = presetPath.trim();
  if (!trimmed) {
    return true;
  }
  if (trimmed.length > 4096) {
    return false;
  }
  // Reject null bytes and non-printable control characters
  if (/[\x00-\x1f\x7f]/.test(presetPath)) {
    return false;
  }
  // Reject directory traversal sequences
  if (trimmed.includes("..")) {
    return false;
  }
  // Strictly enforce .epr extension (case-insensitive)
  const base = trimmed.split(/[/\\]/).pop() || "";
  if (!/\.epr$/i.test(base) || base.toLowerCase() === ".epr") {
    return false;
  }
  return true;
};
