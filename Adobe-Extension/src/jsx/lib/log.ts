// ==============================================================================
// SHARED LOGGING UTILITY
// ==============================================================================

function _pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

/**
 * Writes a timestamped message to the ExtendScript console.
 * @param prefix  - Short identifier for the host app, e.g. "PPRO" or "AEFT"
 * @param message - The message to log
 */
export function logMessage(prefix: string, message: string): void {
  const now = new Date();
  const timeStr = _pad(now.getHours()) + ":" + _pad(now.getMinutes()) + ":" + _pad(now.getSeconds());
  $.writeln("[AutoSubs " + prefix + " " + timeStr + "] " + message);
}
