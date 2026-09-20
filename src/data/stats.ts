import { site } from "./site";

export type Stats = {
  downloads: string | null;
  stars: string | null;
};

const compact = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/* The badge endpoint returns "579.7k"; Intl returns "4.3K". Match them so the
   proof strip does not mix cases. */
export const normaliseUnit = (value: string) => value.replace(/([km])\b/gi, (m) => m.toUpperCase());

/* Last known good values, committed so a failed fetch degrades to a slightly
   stale number rather than the stat vanishing from the page. The browser
   refreshes both live on load, so a visitor never sees these for long.
   Worth bumping occasionally. */
const FALLBACK: Stats = {
  downloads: "579.7K",
  stars: "4.3K",
};

/* Fetched at build time so the numbers render instantly and survive with JS
   disabled. A client-side refresh keeps them current between deploys.
   Any failure falls back rather than dropping the stat. */
export async function getStats(): Promise<Stats> {
  const [downloads, stars] = await Promise.all([
    fetch(site.downloadsEndpoint)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { message?: string } | null) => (d?.message ? normaliseUnit(d.message) : null))
      .catch(() => null),
    fetch("https://api.github.com/repos/tmoroney/auto-subs", {
      headers: {
        Accept: "application/vnd.github+json",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { stargazers_count?: number } | null) =>
        typeof d?.stargazers_count === "number" ? compact(d.stargazers_count) : null,
      )
      .catch(() => null),
  ]);

  return {
    downloads: downloads ?? FALLBACK.downloads,
    stars: stars ?? FALLBACK.stars,
  };
}
