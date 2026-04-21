/**
 * Lazy font loading for non-Latin scripts.
 *
 * Open Sans (loaded eagerly in main.tsx) covers Latin, Cyrillic, Greek and
 * Hebrew. For other scripts produced by Whisper transcription we ship Noto
 * Sans subsets in the installer but only register their @font-face rules on
 * demand, when the user selects a language (or a transcript is loaded) that
 * needs them.
 *
 * Once a font is registered, Chromium performs per-glyph font matching across
 * the list declared in `--font-sans` (see App.css), so subtitle text in any
 * script will automatically pick up the matching Noto Sans font.
 */

// Map of Whisper/ISO language codes -> async loader that imports the
// appropriate fontsource CSS (which registers @font-face rules). We use
// dynamic import() so Vite code-splits each font into its own chunk.
const LANGUAGE_FONT_LOADERS: Record<string, () => Promise<unknown>> = {
  // CJK
  zh: () => import("@fontsource/noto-sans-sc/400.css"),
  yue: () => import("@fontsource/noto-sans-tc/400.css"),
  ja: () => import("@fontsource/noto-sans-jp/400.css"),
  ko: () => import("@fontsource/noto-sans-kr/400.css"),

  // Arabic script (Arabic, Persian, Pashto, Sindhi, Urdu, Uighur)
  ar: () => import("@fontsource/noto-sans-arabic/400.css"),
  fa: () => import("@fontsource/noto-sans-arabic/400.css"),
  ps: () => import("@fontsource/noto-sans-arabic/400.css"),
  sd: () => import("@fontsource/noto-sans-arabic/400.css"),
  ur: () => import("@fontsource/noto-sans-arabic/400.css"),
  ug: () => import("@fontsource/noto-sans-arabic/400.css"),

  // Hebrew (Open Sans has it, but load Noto as an explicit fallback too)
  he: () => import("@fontsource/noto-sans-hebrew/400.css"),
  yi: () => import("@fontsource/noto-sans-hebrew/400.css"),

  // Devanagari
  hi: () => import("@fontsource/noto-sans-devanagari/400.css"),
  mr: () => import("@fontsource/noto-sans-devanagari/400.css"),
  ne: () => import("@fontsource/noto-sans-devanagari/400.css"),
  sa: () => import("@fontsource/noto-sans-devanagari/400.css"),

  // Bengali / Assamese
  bn: () => import("@fontsource/noto-sans-bengali/400.css"),
  as: () => import("@fontsource/noto-sans-bengali/400.css"),

  // Other Indic scripts
  ta: () => import("@fontsource/noto-sans-tamil/400.css"),
  te: () => import("@fontsource/noto-sans-telugu/400.css"),
  gu: () => import("@fontsource/noto-sans-gujarati/400.css"),
  kn: () => import("@fontsource/noto-sans-kannada/400.css"),
  ml: () => import("@fontsource/noto-sans-malayalam/400.css"),
  pa: () => import("@fontsource/noto-sans-gurmukhi/400.css"),
  si: () => import("@fontsource/noto-sans-sinhala/400.css"),

  // South-East Asian
  th: () => import("@fontsource/noto-sans-thai/400.css"),
  lo: () => import("@fontsource/noto-sans-lao/400.css"),
  km: () => import("@fontsource/noto-sans-khmer/400.css"),
  my: () => import("@fontsource/noto-sans-myanmar/400.css"),

  // Caucasus
  ka: () => import("@fontsource/noto-sans-georgian/400.css"),
  hy: () => import("@fontsource/noto-sans-armenian/400.css"),

  // Horn of Africa
  am: () => import("@fontsource/noto-sans-ethiopic/400.css"),

  // Tibetan (only ships as Noto Serif on fontsource)
  bo: () => import("@fontsource/noto-serif-tibetan/400.css"),
};

// Remember which fonts we've already asked the bundler for so we don't
// repeatedly kick off dynamic imports on every settings change.
const loaded = new Set<string>();
const inflight = new Map<string, Promise<unknown>>();

function normalizeLang(lang: string | undefined | null): string | null {
  if (!lang) return null;
  // Strip region subtags ("zh-CN" -> "zh") and lower-case.
  const primary = lang.toLowerCase().split(/[-_]/)[0];
  if (!primary || primary === "auto") return null;
  return primary;
}

/**
 * Ensure the font needed to render `lang` is registered. Idempotent and
 * safe to call from any render pass / effect.
 */
export function loadFontForLanguage(lang: string | undefined | null): Promise<void> {
  const key = normalizeLang(lang);
  if (!key) return Promise.resolve();
  if (loaded.has(key)) return Promise.resolve();

  const loader = LANGUAGE_FONT_LOADERS[key];
  if (!loader) {
    // Latin / Cyrillic / Greek — covered by Open Sans, nothing to do.
    loaded.add(key);
    return Promise.resolve();
  }

  const existing = inflight.get(key);
  if (existing) return existing.then(() => undefined);

  const promise = loader()
    .then(() => {
      loaded.add(key);
    })
    .catch((err) => {
      console.warn(`[font-loader] Failed to load font for language "${key}":`, err);
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise.then(() => undefined);
}
