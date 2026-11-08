/**
 * Sentinel Security: Validates that an external URL strictly uses a safe web scheme
 * (http: or https:). Rejects dangerous schemes like javascript:, file:, data:, or shell:.
 */
export const isSafeExternalUrl = (url: string | null | undefined): boolean => {
  if (!url || typeof url !== "string") {
    return false;
  }
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};
