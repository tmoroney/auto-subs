# W3 — Fusion manual → lossless, explorable docs + a project-local skill

> **Goal:** Turn the unwieldy `fusion_manual.md` into a **navigable** reference **without losing any information**, and wrap it (plus the W1 macro-registry docs and the repo's API reference) into a fresh, **project-local skill** that ships with the repo so any contributor or agent who clones it gets good Fusion guidance.
>
> **Status:** Spec / handoff. No code written yet.
>
> **Key decisions (locked):**
> - **Lossless restructure**, not a macro-relevant extraction. Keep *everything* (UI, advanced animation, etc.) — only reorganize.
> - **Hybrid pipeline**: deterministic PDF→markdown as a verifiable ground truth + a capable model for structure/tables/diagrams, with a completeness check. **Not** a single multimodal-LLM transcription pass.
> - **Source is the original PDF** (the user will provide it; it is **not** currently in the repo). The existing `fusion_manual.md` is itself a lossy OCR derivative and is treated as legacy, not the source.
> - The existing global `davinci-resolve` and `fusion-animation` skills are **discarded** as source material (deemed not good in practice). Build fresh from the PDF + the real macro code + the repo's `resolve_api_reference.txt`.
>
> **Sequencing:** Can run **in parallel with W2** after W1 lands (the skill's animation cookbook references W1's registry). The doc-restructuring sub-task is highly **subagent-friendly** (read/transform heavy, no Resolve needed).

---

## 1. Current state

- [`Resolve-Integration/fusion_manual.md`](../Resolve-Integration/fusion_manual.md): **269 KB, 9,163 lines**, produced by OCR-scanning the original Fusion scripting PDF. Heading structure is broken — **178 `#` and 97 `##` headings**, many of which are OCR noise (e.g. lines like `# gets the spline output...`, `# Input Name (string, required)`). It's hostile to both humans and agents.
- [`Resolve-Integration/resolve_api_reference.txt`](../Resolve-Integration/resolve_api_reference.txt): 112 KB Resolve scripting API reference (good, authoritative).
- [`Resolve-Integration/fusion_intro.txt`](../Resolve-Integration/fusion_intro.txt): short intro.
- The original **PDF is not in the repo** — the user will add it.

What the manual covers (from heading scan): scripting languages (Lua/Python), the console, script types, **Fusion's object model**, tool/input/output querying, **GUIs / control types** (UI Manager), and the **class reference** (BezierSpline, BinClip, etc.). All of this is useful — hence "keep everything."

---

## 2. Target output

```
.devin/skills/autosubs-fusion/
  SKILL.md                       # entry point: when to use, how the docs are organized
  docs/
    fusion-manual/
      00-index.md                # generated TOC with links + one-line summaries
      01-introduction.md
      02-scripting-languages.md
      03-object-model.md
      04-inputs-outputs.md
      05-guis-control-types.md
      06-class-reference/        # one file per class (BezierSpline.md, …) if large
      ...                        # chaptered, lossless
    resolve-api.md               # cleaned/linked copy of resolve_api_reference.txt
    macro-architecture.md        # how the AutoSubs macro works (graph + W1 registry)
    cookbook/
      add-an-animation.md        # the W1 contributor flow, worked example
      add-a-style-control.md     # the Fusion round-trip + InputKeys checklist
  examples/
    animation-module.lua         # a real animations/*.lua from W1
    keyframe-spline.lua          # a minimal BezierSpline:SetKeyFrames sample
  scripts/
    pdf-to-md.mjs                # deterministic PDF → ground-truth markdown
    restructure.mjs              # split + TOC + anchors (+ optional model assist)
    verify-completeness.mjs      # proves nothing was dropped
    sources/                     # the input PDF lives/symlinks here (gitignore the binary if large)
```

> **Location rationale:** per this environment's conventions, **new** configuration/skills go in `.devin/`. A project-local skill ships with the repo, so contributors and agents who clone AutoSubs get it automatically (unlike the user-global skills that won't be present for them).

---

## 3. The hybrid pipeline (lossless)

The whole point is to **prove** no information was lost. Three stages, each verifiable.

### Stage A — Deterministic PDF → ground-truth markdown (`pdf-to-md.mjs`)

Extract the full text faithfully and deterministically. Candidate tools (pick by fidelity on this specific PDF; spike all three on a few pages first):

- **`pymupdf4llm`** (PyMuPDF) — markdown-aware, good at headings/lists/tables, fast, deterministic. Recommended first try.
- **`marker`** — high-quality PDF→markdown (handles columns/tables/code well); heavier deps.
- **`pdftotext -layout`** (poppler) — rock-solid plain text fallback; least structure but maximal fidelity.

Output: `docs/fusion-manual/_ground-truth.md` — the **canonical complete text**, committed. This is the reference everything else is checked against. It does **not** need to be pretty.

### Stage B — Restructure into navigable files (`restructure.mjs`)

Deterministic-first transformation of the ground truth:
1. **Repair heading hierarchy.** Detect real chapter/section headings (numbered like `2 Scripting Reference`, known titles, font-size hints if the extractor preserved them) vs OCR-noise headings. Demote/neutralize false headings (turn `# gets the spline output...` back into body text / code comments).
2. **Split** into chapter/topic files with stable, slugified anchors.
3. **Generate `00-index.md`** — a TOC linking every section, with a one-line summary per chapter.
4. **Preserve 100% of body text** — restructuring only moves/relabels; it never deletes content.

**Where the model assists (bounded, optional):**
- **Heading reclassification** — for ambiguous lines, ask the **free swe-1.6** model "is this a section heading or body text?" Input is one line + surrounding context; output is a label only. Body text is never sent for rewriting.
- **Tables & diagrams** — this is where a **multimodal model (Gemini)** earns its keep: reconstruct tables that the deterministic extractor mangled, and write alt-text/descriptions for figures/screenshots (the manual has UI screenshots the text extractor can't capture). Feed Gemini the relevant **page images** and ask only for the table markdown / figure description, which is then *inserted alongside* (not replacing) the ground-truth text.

**Hard rule:** the model **organizes and augments**; it never silently rewrites prose. Any model-generated block (table reconstruction, figure description) is clearly marked (e.g. an HTML comment `<!-- figure description (gemini) -->`) so it's auditable.

### Stage C — Completeness verification (`verify-completeness.mjs`)

Prove losslessness mechanically:
- Concatenate all restructured chapter files, strip markdown/whitespace, and compare token/sentence coverage against `_ground-truth.md`.
- Report: % of ground-truth sentences present in the restructured set (target ~100% minus intentionally-dropped OCR-noise headings), plus a diff of anything missing.
- Fail the build if coverage drops below a threshold. This is the artifact that lets the user trust "nothing was lost."

---

## 4. The skill itself

### `SKILL.md`

Front-matter + guidance, mirroring the *shape* of the existing skills but with fresh, trustworthy content:

```md
---
name: autosubs-fusion
description: Writing and modifying the AutoSubs DaVinci Resolve caption macro and
  Fusion .setting files — animations, styling, the macro registry, and Fusion
  scripting. Prefer the curated docs here over web search; Fusion scripting is
  obscure and web results are unreliable. Use docs/fusion-manual for the Fusion
  API, docs/macro-architecture.md for how the AutoSubs macro is built, and
  docs/cookbook for step-by-step recipes.
---
```

Body: when to use it, a map of `docs/`, and pointers — "to add an animation, read `cookbook/add-an-animation.md`; for the BezierSpline API, see `docs/fusion-manual/06-class-reference/BezierSpline.md`."

### `docs/macro-architecture.md`

Authored fresh (not from the manual): the node graph (Template/Text+, Follower1/StyledTextFollower, AnimationKeyframeStretcher, OrderKeyframeStretcher, splines), the **W1 registry + `usesFade` model**, runtime injection, and the preset get/set round-trip. Cross-link to W1's `macro-src/README.md` as the source of truth so they don't drift.

### `docs/cookbook/`

- **`add-an-animation.md`** — the exact W1 flow (§4 of W1): copy a module, set `id`/`controlKey`/`usesFade`, write `apply`/`reset`, `npm run build:macro`, run `test-macro.lua`, eyeball the frame. Include a complete worked example (e.g. a "bounce" animation) end to end.
- **`add-a-style-control.md`** — the Fusion-side checklist for a genuinely new control: add a `UserControl`, add to `InputKeys`, reference it from logic, re-export `caption-bin.drb`. Be explicit that this is the one path still requiring Resolve authoring.

### `examples/`

Real, runnable snippets pulled from the W1 source (an `animations/*.lua` module, a `BezierSpline:SetKeyFrames` keyframe sample) so contributors copy from working code, not prose.

---

## 5. Disposition of the old `fusion_manual.md`

- Keep it in git history but **replace** it (or leave a stub linking to the new skill) so people stop landing on the 9k-line dump.
- The new `_ground-truth.md` + chaptered files supersede it. If the user wants to keep a single-file option, the build can also emit a concatenated `fusion-manual-full.md`.

---

## 6. Awareness / contribution push (cheap, high-leverage)

The user already improved docs but gets no contributions — discoverability is half the battle:
- Add a **"Contribute a caption style / animation"** callout to the top-level [`README.md`](../README.md) and [`CONTRIBUTING.md`](../CONTRIBUTING.md) linking to the cookbook.
- Seed a few **`good first issue`**-labeled animation/preset ideas.
- Link the skill + cookbook from [`Resolve-Integration/README.md`](../Resolve-Integration/README.md).
- Mention the community gallery (W2) so style-makers know their work can be shared.

---

## 7. Files to create / modify

**Create**
- `.devin/skills/autosubs-fusion/**` (SKILL.md, docs, examples, scripts) per §2
- Pipeline scripts: `pdf-to-md.mjs`, `restructure.mjs`, `verify-completeness.mjs`

**Modify**
- `Resolve-Integration/fusion_manual.md` — replace with stub/redirect (content moves into the skill)
- `Resolve-Integration/README.md`, root `README.md`, `CONTRIBUTING.md` — link the skill + cookbook + contribution callout
- `.gitignore` — ignore the large source PDF binary if it shouldn't be committed (decide with the user)

---

## 8. Verification

- [ ] `verify-completeness.mjs` reports ≈100% sentence coverage of `_ground-truth.md` in the restructured set (with an explicit, reviewed list of intentionally-dropped OCR-noise lines).
- [ ] `00-index.md` links resolve to real anchors; spot-check 10 random sections against the PDF.
- [ ] Tables reconstructed by the model match the PDF; figure descriptions are marked and accurate.
- [ ] An agent invoking the skill can answer a non-trivial Fusion question (e.g. "how do BezierSpline keyframe handles work?") **from the docs**, not web search.
- [ ] A contributor can follow `cookbook/add-an-animation.md` end to end and land a working animation.
- [ ] The pipeline is re-runnable: regenerating from the PDF reproduces the structure deterministically (model-assisted blocks may vary but are clearly marked).

---

## 9. Risks & considerations

- **Model omission/hallucination** — mitigated structurally: the model never produces the canonical prose (Stage A does), only structure + tables + figure text, and Stage C proves coverage.
- **PDF extractor quality varies** — spike `pymupdf4llm` / `marker` / `pdftotext` on a few representative pages (object model, a class-reference page, a UI/control-types page with a screenshot) before committing to one.
- **Determinism vs model** — keep the model pass optional and clearly fenced so the docs can be rebuilt without it if needed.
- **PDF licensing** — the Fusion manual is Blackmagic's; confirm it's OK to commit/redistribute the derived markdown, or keep the PDF out of the repo and document how to obtain it. Decide with the user before committing the binary.
- **Drift** — `macro-architecture.md` and `examples/` reference W1 code; link to source-of-truth files and note in W1's PR checklist to update the skill when the macro graph/registry changes.
