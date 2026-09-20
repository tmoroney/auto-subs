# AutoSubs — website

The marketing site for [AutoSubs](https://github.com/tmoroney/auto-subs), built with
[Astro](https://astro.build) and [Tailwind CSS](https://tailwindcss.com).

It lives on the `website-dev` branch and deploys to GitHub Pages automatically on
every push, so the site is served from the `/auto-subs` sub-path.

## Develop

```bash
npm install
npm run dev
```

The dev server runs at **http://localhost:4321/auto-subs/** — note the sub-path, the
bare root will not match production.

```bash
npm run build     # static output into dist/
npm run preview   # serve the built site
npm run check     # type-check .astro files
```

Requires Node 22.12 or newer (Astro 7).

## Structure

```
src/
  components/    One file per page section
  data/          Copy and lists that change often (models, supporters, links)
  layouts/       Base.astro — head tags, fonts, reveal observer
  pages/         index.astro — assembles the sections
  styles/        global.css — theme tokens, marquee, motion preferences
public/          Static assets served at /auto-subs/*
```

The page ships around 2.5 KB of JavaScript. Three small inline scripts do all the
interactive work: platform detection on the download button, the language counter,
and the scroll reveal. Keep it that way — if a change needs a framework, it probably
needs a rethink instead.

## Still to confirm

- `src/data/site.ts` — the Discord invite is a placeholder.
- `src/components/Speed.astro` — confirm the hardware string ("Apple M3 MacBook Air")
  matches the machine the 30-minute benchmark was actually run on.

## Images

Source images live in `src/assets/` and go through Astro's pipeline, which emits
responsive WebP at build time (the screenshot drops 600 kB → 117 kB). Only files
that must keep a fixed URL — favicons and the social card — sit in `public/`.
Regenerate those from the app icon with sharp if the icon ever changes.

## Supporter quotes

Quoted verbatim in `src/data/supporters.ts`. Long ones are shortened by cutting
whole clauses and marking the cut with an ellipsis, never by rewording — each one
carries a real person's name against it. Two unused quotes are kept in a comment
at the bottom of that file.

## Live numbers

Download totals come from the release tracker endpoint and star counts from the
GitHub API. Both are fetched at build time so they render without JavaScript, then
refreshed client-side so they stay current between deploys. Every failure path
degrades to hiding the number rather than breaking the page.
