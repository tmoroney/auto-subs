export function languageDisplayName(
  code: string | null | undefined,
  uiLang: string,
): string {
  const normalizedCode = code?.trim();
  if (!normalizedCode || normalizedCode.toLowerCase() === "auto") return "";
  const fallback = code ?? "";

  try {
    return new Intl.DisplayNames([uiLang], { type: "language" }).of(
      normalizedCode,
    ) ?? fallback;
  } catch {
    return fallback;
  }
}
