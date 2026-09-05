# Community caption style store

> **Status:** P0 + P1 implemented (this PR). P2–P5 pending.
>
> **Decisions (2026-09-05):** presets live in a `community-presets/` folder in this repo (not a separate repo); the app fetches `index.json` from jsDelivr pinned to `@main`; submissions go through a GitHub issue form that a bot converts to a PR; **built-in presets move into `community-presets/` too** so they are rendered, validated and indexed the same way as community ones (the app ships a snapshot of the index for offline first-run).

Revised 2026-09-05 from the original 2026-06-13 spec. The core approach is unchanged (GitHub-repo-backed, no server, PR/issue moderation, jsDelivr CDN, reuse `importPreset`). Section 1 records what had drifted in the codebase since the original spec.

## 1. What the original plan got wrong / what changed

| Old plan says | Reality today |
|---|---|
| UI wired in `add-to-timeline-dialog.tsx` | File is gone. Picker is mounted from `caption-style/template-selection.tsx:175-190`; creation flow is `caption-style/create-preset-flow.tsx`. |
| Picker has `onRequestPreview` / preview per card | Prop still exists on `AnimatedPresetPicker` but `template-selection.tsx` doesn't pass it. `generatePreview()` (`resolve-api.ts:234`) has **zero call sites**. |
| `CaptionPreset` needs `previewUrl` etc. | `previewImage?: string` already exists (`types.ts:195`) and `PresetThumbnail` renders it from `appData/caption-previews/<file>` — but **nothing ever writes it**. Local presets show a placeholder icon today. |
| "Add `GetMacroVersion`" | Still absent. But `modules/caption_template_version.lua` (date string, used in `autosubs_core.lua:169`) already exists and can be the compat version. |
| `SetInputValues` should ignore unknown keys | Still calls `tool:SetInput(key, value)` unguarded (`autosubs-macro.setting:61-70`). |
| "Confirm CSP allowlist" | CSP is `null`. The real gate is `src-tauri/capabilities/default.json`: `http:default` scope (`:14-44`) allows HF, tauri.app, Google Docs only; `opener` scope (`:165-170`) allows only `github.com/tmoroney/auto-subs/**`. |
| Preview: "mid-animation frame, 640×360" | `GeneratePreview` (`autosubs_core.lua:1662-1711`) already renders a single PNG at `floor(GlobalEnd/2)` via a Fusion Saver, at comp native size. **It ignores `presetSettings`** (never calls `SetInputValues`, only font fallback + speaker style) so it can't produce a preset-specific thumbnail yet. |
| Implicit: works everywhere | Adobe extension has no animated caption presets at all (AE creates plain text layers). Store is **Resolve-only**; hide it when `selectedIntegration !== "davinci"`. |

## 2. Recommended architecture (unchanged core, refined)

```
Contributor ──(in-app "Share")──▶ GitHub issue form (prefilled JSON + drag-in PNG)
      └─ GitHub Action parses issue ──▶ opens PR into community-presets/presets/<slug>/
Maintainer merges ──▶ Action rebuilds community-presets/index.json
App ──▶ https://cdn.jsdelivr.net/gh/tmoroney/auto-subs@main/community-presets/index.json
```

**Keep option A (folder in this repo)** — it means the existing `opener` allowlist already covers the submission URL and there's one CI surface. Move to a dedicated repo only if images bloat history.

Layout (same as old plan): `community-presets/presets/<slug>/{preset.json,meta.json,preview.png}`, generated `index.json`, `scripts/build-index.mjs`.

## 3. Work breakdown (ordered by dependency)

### P0 — prerequisites in the Resolve layer (needed for thumbnails + safety) — DONE
1. **`GeneratePreview` honours `presetSettings`**: for the animated template it applies the macro's `SetInputValues(presetSettings)` (after font fallback) before rendering. `speaker` is optional.
2. **Uniform thumbnails**: `extract_frame` inserts a `Resize` (640 px wide, height keeps the comp aspect) between `MediaOut` and the `Saver`, and renders the midpoint frame `(GlobalStart+GlobalEnd)/2`.
3. **`SetInputValues` ignores unknown keys**: only keys present in `InputKeys` are applied, so a preset from a newer macro degrades gracefully. (Macro change ⇒ `caption-bin.drb` must be regenerated in Resolve via *AutoSubs - Update Caption Template*.)
4. **Compat version**: `GetVersion` now also returns `captionTemplateVersion` (the `caption_template_version.lua` date string, lexically comparable). Community presets will carry `minTemplateVersion`.

### P1 — capture previews for *local* presets — DONE
- `CapturePresetSettings(exportDir)` renders the preview from the live edit session **before** tearing it down, so the thumbnail is exactly what the user saw in Fusion. Returns `{ settings, previewPath }`.
- Preview PNGs live in `$APPLOCALDATA/caption-previews/<presetId>.png` (created by the Rust command `ensure_caption_preview_dir`; `$APPLOCALDATA/**` is added to the asset-protocol scope). Filenames are tracked in the presets store under `previewImages: Record<presetId, filename>` so built-ins and imported presets can have thumbnails too.
- Picker overflow menu gains **Generate preview** (calls `GeneratePreview` with the preset's `macroSettings`) for presets without one, e.g. built-ins and imports. Deleting a preset removes its PNG.

### P2 — store data layer (`src/api/community-presets.ts`)
- `fetchCommunityIndex()` via `@tauri-apps/plugin-http` `fetch` (pattern: `whats-new-dialog.tsx:98-117` already fetches GitHub from the frontend). Cache to Tauri store `autosubs-community-cache.json` with TTL (e.g. 6h); serve cache first, refresh in background.
- `installCommunityPreset(entry)` → GET `presetUrl` → existing `importPreset(json)` → then download `preview.png` into `caption-previews/<newId>.png` and set `previewImage` so installed presets keep their thumbnail.
- Add `https://cdn.jsdelivr.net/**` to `http:default` scope in `capabilities/default.json`.
- Extend `CaptionPreset` with optional `author`, `tags`, `source: 'community'`, `minTemplateVersion`, `communitySlug` (for "already installed" detection + future update checks). Export `parseImportedPreset` pass-through for these.

### P3 — store UI
- `caption-style/community-preset-gallery.tsx` (Dialog): grid of cards (preview, name, author, tags), search + tag chips, Install / Installed state, gated "Requires newer AutoSubs" when `minTemplateVersion > current`, offline/empty states.
- "Browse Community" button in `AnimatedPresetActions`; mount dialog from `template-selection.tsx`; only when integration is DaVinci.
- i18n: all 8 locales, ≤25/≤60 char budgets (AGENTS.md).

### P4 — "Share to community" (submission)
- Overflow-menu item on user `PresetCard`s. Flow: ensure preview exists (P1) → build `preset.json` + `meta.json` → open `https://github.com/tmoroney/auto-subs/issues/new?template=community-preset.yml&title=...&preset=<urlencoded json>` via opener (already allowlisted). Issue forms accept prefilled field values via query params; the user drags the PNG into the body (images can't be prefilled). Copy the PNG path to clipboard / reveal it in Finder to make that one step easy.
- Fallback: "Save bundle to folder".

### P5 — repo + CI
- `.github/ISSUE_TEMPLATE/community-preset.yml` (fields: name, description, tags, preset JSON, preview image).
- Action `community-preset-submission.yml`: on issue labelled `preset-submission`, parse body, download image, validate (JSON schema, PNG ≤ 300 KB, 640×360), open PR with the folder. Maintainer review = merge.
- Action `community-index.yml`: on push to `main` touching `community-presets/presets/**`, run `build-index.mjs`, commit `index.json`. jsDelivr serves within minutes; purge URL `https://purge.jsdelivr.net/gh/...` can be hit from CI for instant refresh.
- `community-presets/CONTRIBUTING.md`, JSON schema for `preset.json` (validated in CI and reused client-side).

## 4. Safety / moderation
Presets are inert input values — the macro only does `tool:SetInput`. With P0.2 in place a malformed key can't error out. Review is about taste + preview honesty. Font names are strings; `font_fallback.lua` already substitutes missing fonts and `ResolveContext.tsx:145-158` surfaces the warning, so nothing new is needed there beyond showing `fonts: [...]` on the card.

## 5. Effort estimate
- P0+P1: ~1 session (Lua + one React flow). Independently valuable (local thumbnails).
- P2+P3: ~1 session.
- P4+P5: ~1 session (mostly YAML/Node scripting, testable without Resolve).

## 6. Decisions (settled)
1. Folder in `auto-subs` — yes.
2. CDN ref — `@main` (presets are data; no need to wait for a release).
3. Submission — issue form → bot PR.
4. Built-in presets — move into `community-presets/` (with `builtIn: true` in `meta.json`); the app bundles a generated snapshot of `index.json` + previews so first run works offline, and `built-in-presets.ts` becomes generated from that folder.
