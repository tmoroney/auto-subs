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
