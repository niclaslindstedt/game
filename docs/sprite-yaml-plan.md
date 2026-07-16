# Sprite YAML pipeline — design plan

The working plan for moving hand-authored sprites from the current bundled
`.mjs` grid modules to **one self-describing YAML file per sprite**, with a
machine-checkable `description` that turns art authoring into a closed
**generate → render → compare → refine** loop — driven either by a text
description or by a reference image an art LLM produced.

Status legend: `[ ]` not started · `[x]` done.

This is a design proposal to react to, not shipped behavior. No code lands
until the schema and migration guarantee below are agreed.

---

## Why

Today every sprite is a char grid bundled into a per-family `.mjs` module
(`website/scripts/sprite-data/*.mjs`) with a **family-scoped** palette, merged
by `index.mjs` into `SPRITES` / `SPRITE_PALETTES`, then packed by
`generate-assets.mjs` into one deterministic `atlas.png` + `atlas.json`. Intent
lives in loose comments, if at all. The authoring loop (`pixel-assets`,
`art-improvement` skills) is "edit grid → regenerate → **LOOK at it** → judge →
loop" — entirely manual, with a human eye as the only acceptance test.

Three problems this plan targets:

1. **No machine-checkable target.** Nothing states what a sprite is _supposed_
   to look like, so the refine loop can't be closed automatically.
2. **Bundled files** are harder to find, diff, and merge than one file per
   sprite (the same rationale the repo already uses for `.lessons/` fragments).
3. **No image ingestion path.** An art LLM can produce a reference image, but
   there's no tool to turn that image into a palette + grid, and no loop to
   drive the grid toward the image.

## Goals

- **`description` is the acceptance criterion**, not documentation. A sprite is
  "done" when its render meaningfully matches its description (and, when
  present, its reference image).
- **One YAML file per atlas entry** — findable, diff-able, merge-safe,
  self-contained.
- **Per-sprite palette, single-char `A-Za-z0-9` keys** (decided). Each pixel
  stays one column wide, so the grid reads as the sprite in the file and the
  loop can make surgical edits without losing coordinates. `.` is reserved for
  transparent. Up to 62 colors/sprite — far more than any sprite needs.
- **Global damage palettes**; per-sprite damage overlays are optional and
  reference a global palette. Auto-derivation stays the floor so wound coverage
  is never lost.
- **Two ingestion paths, one format:** author-from-description, and
  analyze-an-image (a tool quantizes an LLM image into palette + grid).
- **Byte-identical migration.** Converting the existing `.mjs` grids to YAML
  must regenerate the _exact same_ `atlas.png` / `atlas.json`. The atlas is the
  invariant that proves the migration is lossless.

## Non-goals

- Changing the runtime renderer. `assets.ts`, `render.ts`, `paper-doll.ts`,
  `pixel-font.ts` are untouched — they consume the same atlas + rect map. This
  is an **authoring-format** change, build-time only.
- Replacing auto-derived worn-armor overlays or the deterministic wound
  generator wholesale — they keep working, sourced from the content defs.
- Integer palette indices (rejected — kills grid readability and surgical
  edits; single chars already give an ordered, indexable palette internally).

---

## The tier model

Art gets the same downward-flowing tier chain the story already uses
(`story.md` → `manuscript.md` → data). Higher tier wins; when two disagree, fix
the lower one:

1. **`description`** — the intent, ground truth. What the sprite _is_.
2. **reference image** _(optional)_ — a concrete but **fallible** realization of
   the intent, produced by an art LLM and used to bootstrap the grid. A strong
   hint, not truth: if it conflicts with the description, the description wins.
3. **palette + grid** — the YAML; what actually ships.
4. **atlas** — a build output (`atlas.png` / `atlas.json`), never edited.

"Match meaningfully" is judged against tiers 1 and 2 together: does the render
realize the description, and does it resemble the reference image.

---

## The YAML schema

One file per atlas entry (one named sprite/frame). Proposed shape:

```yaml
# website/scripts/sprites/hero/knight_0.yaml
name: knight_0 # atlas key (unique across all sprites)
family: hero # organizational + optional shared-palette source
size: [16, 16] # [w, h] — validator hard-fails mismatched rows
description: > # the acceptance target (tier 1)
  Front-facing knight in silver plate with a gold crest and a blue tabard.
  Heavy melee silhouette, stance square, reads clearly at phone distance.
reference:
  knight_0.ref.png # optional (tier 2) — path to the LLM image used
  # to bootstrap this grid; committed next to the yaml
palette: # per-sprite, single-char A-Za-z0-9 keys
  s: "#c8ccd4" # steel
  d: "#8a8f9c" # steel shadow
  g: "#f4c430" # gold crest
  b: "#2a4d8f" # tabard
  # '.' is implicit = transparent (reserved, never redefined)
uses: [] # optional: shared palette(s) to import, e.g. [moon]
grid: |
  ......ss......
  .....sdds.....
  ...           # exactly `size` rows, each exactly `size[0]` columns
damage: # optional; omit → auto-derived wound is the floor
  palette: blood # references a GLOBAL damage palette (blood|ecto|sparks|…)
  stages: # override art per wound stage the content def enables
    hurt: |
      ...
    wrecked: |
      ...
```

Notes / decisions baked in:

- **`.` is a reserved transparent key**, never appears in a `palette:` block.
- **`size` is mandatory** and the validator enforces every row's width/height
  against it — this is the guard against the YAML block-scalar trailing-space
  footgun (editors that strip trailing whitespace would otherwise silently
  narrow a sprite). Transparent trailing pixels are `.`, never spaces.
- **`uses:` (shared palette import)** is the base-palette escape hatch: a sprite
  is fully local by default, but may pull a family palette (moon-grey,
  mars-rust) and override/extend with local keys, so re-theming a family doesn't
  mean editing every file. _(Open question — see below.)_
- **Animation is a naming convention, not a field.** `knight_0` / `knight_1` /
  `knight_jump` are separate files; which frames form a walk cycle stays in the
  animation manifest (as `ANIMATIONS` does today). Keeps each file single-purpose.

## Global damage palettes

The gore/ecto/sparks styles currently living inside `asset-tools/damage.mjs`
move to named, shared palettes (`website/scripts/sprites/_damage/*.yaml` or a
single manifest). A per-sprite `damage.palette: blood` references one. This
centralizes the look of damage across the whole roster and lets one sprite opt
into a bespoke overlay while everything else keeps the auto-derived floor.

**Wound _stages_ stay owned by the content defs.** Which stages a sprite gets
(minion → `hurt`; elite → `+wrecked`; boss → `+dying`) and the gore style keep
coming from `ENEMY_DEFS` (`role`, `gore`) via `index.mjs`, exactly as now — so
art still can't drift from content. The YAML `damage` block is an _override_ of
the generated art for a stage the content def already enables, not a new source
of truth for which stages exist.

## Worn-armor overlays — unchanged

`asset-tools/worn.mjs` keeps deriving on-body overlays from `GEAR_DEFS` icons.
Those icons simply become YAML sprites like everything else; the derivation
reads them the same way. No change.

---

## Validator rules (`make assets` fails on any)

1. `name` unique across all sprite files (replaces `register()`'s duplicate
   check in `index.mjs`).
2. `grid` has exactly `size[1]` rows, each exactly `size[0]` columns.
3. Every non-`.` char in `grid` (and in each `damage.stages` grid) is defined in
   the effective palette (`palette` + any `uses:` imports).
4. Palette keys match `[A-Za-z0-9]`; `.` never appears as a key.
5. Every color is a valid hex (or the literal `transparent`).
6. `damage.palette` names an existing global damage palette.
7. `description` is non-empty (it's the acceptance target — an empty one is a
   TODO, and CI can warn).
8. Existing `woundVisibility` lint still runs on the final wound frames.

---

## Generator integration

Minimal blast radius — the atlas format and everything downstream stay identical:

- **New loader** replaces `sprite-data/index.mjs`'s module merge: glob the YAML
  tree, parse, resolve `uses:` imports, and produce the same in-memory
  `SPRITES` / `SPRITE_PALETTES` / `SPRITE_FAMILY` maps the rest of
  `generate-assets.mjs` already consumes. Everything after that
  (`gridToSurface`, `packAtlas`, wound/worn derivation, atlas + preview
  emission) is unchanged.
- Determinism preserved: atlas packing is already deterministic (shelf packer,
  name tiebreak); YAML load order is sorted by `name`, so the atlas stays
  byte-identical.

## Migration path (`.mjs` → YAML), with a lossless guarantee

1. **Converter script** (`website/scripts/migrate-sprites.mjs`, one-shot):
   for each entry in the current `SPRITES`, resolve its family palette, emit a
   YAML file carrying **only the palette keys that sprite actually uses**,
   `size` from the grid, `family`, the grid verbatim, and a stubbed
   `description` (seeded from any nearby comment, else empty TODO).
2. **Regenerate and assert invariance:** run `make assets` on the YAML tree and
   diff the resulting `atlas.png` / `atlas.json` against the pre-migration
   build. **They must be byte-identical.** That diff is the migration's proof of
   correctness — the human-facing format changed, the shipped pixels did not.
3. **Backfill descriptions** with the description loop (below), sprite by
   sprite, as a follow-up — not blocking the format switch.
4. Delete `sprite-data/*.mjs` once the YAML tree is authoritative.

---

## Phase 2 — the authoring loops

### 2a. Description-driven refine loop

1. LLM authors/edits the `grid` toward the `description`.
2. `make assets` renders it; the pipeline already emits 8× previews and
   per-family contact sheets to `website/assets-preview/`.
3. **Evaluate on the real background** — pose the sprite frozen on its actual
   level ground via `?scenario=` (as `art-improvement` already does), because a
   sprite that reads on transparency can vanish on its own tiles.
4. A **separate** vision evaluator (not the generator — avoid rubber-stamping)
   critiques render vs. `description`: what's wrong, what's missing.
5. Apply grid edits; loop.
6. Stop on: evaluator "meaningful match", a max-iteration cap, or the **human
   final vote** (`art-improvement` already mandates a before/after vote before a
   PR ships). The loop proposes; the human disposes.

### 2b. Image-driven: the analyze tool

An art LLM produces a reference **image**; a tool replicates it as a sprite,
then the loop drives the sprite toward the image.

**Analyze (`image → palette + grid`):**

1. Resample the source image to the target `size` — per-cell dominant/median
   color, not naive area-average, so pixel-art edges survive.
2. Quantize to a small palette (median-cut or fixed-seed k-means in a
   perceptual space — OKLab), snapping near-transparent alpha to `.`.
3. **Assign single-char keys deterministically** — sort the palette by OKLab
   lightness then hue, then map to `A-Za-z0-9`. Determinism here is what makes
   the emitted YAML stable and re-runs byte-identical.
4. Map each cell to its nearest palette color → char grid. Emit the YAML
   (`palette`, `grid`, carried-over `description`, `reference:` = the image
   path).

**Compare-and-refine (`sprite → image`):**

1. Render the sprite, nearest-upscale to the reference's size.
2. Compare with a cheap numeric gate (SSIM / perceptual hash) **and** a vision
   critique ("crest hue off", "lost the left-edge pixel").
3. **"Meaningfully match," not pixel-exact** — the LLM image is itself an
   imperfect, lossy realization, and the quantization is lossy. Exact match is
   the wrong target.
4. Edit palette/grid; loop until the gate + critique pass, max-iters, or the
   human vote.
5. **When the image and the description conflict, the description wins**
   (tier 1 > tier 2). The image bootstraps and tightens; the description is
   still the authority on intent.

The `reference` image is committed next to its YAML so the loop is
reproducible; it is _not_ shipped in the atlas (it's a source, like the grid).

---

## Phased checklist

- [ ] **Phase 0 — agree the schema.** This doc. Resolve the open questions.
- [ ] **Phase 1 — format switch.** YAML loader, validator, converter script,
      byte-identical atlas assertion, delete `.mjs` modules.
- [ ] **Phase 1.1 — global damage palettes** extracted from `damage.mjs`;
      optional per-sprite `damage` override wired in.
- [ ] **Phase 2a — description refine loop** (separate evaluator, real-ground
      pose, human vote, stop guards).
- [ ] **Phase 2b — image analyze tool** (deterministic quantize → YAML) and the
      compare-to-image loop.
- [ ] **Phase 3 — backfill `description` (and reference images)** across the
      existing roster.

---

## Open questions

1. **Base-palette drift vs. cohesion.** Fully per-sprite palettes are simplest
   but re-theming a whole family means editing every file. Recommendation:
   **local by default, `uses:` may import a shared family palette.** Agree?
2. **Wound-stage ownership.** Confirm stages stay owned by `ENEMY_DEFS`
   (`role`/`gore`) and the YAML `damage` block is only an art _override_ for an
   already-enabled stage — never a new declaration of which stages exist.
3. **Reference-image storage.** Commit alongside the YAML (reproducible, but
   grows the repo) vs. keep transient/gitignored (smaller, but the loop can't be
   re-run from a clean checkout). Recommendation: commit, they're small at
   sprite resolutions.
4. **YAML vs. a whitespace-safe wrapper.** `size` + validator neutralizes the
   trailing-space footgun, but is YAML the right host at all, or would a thin
   custom format (or TOML) be safer? Recommendation: YAML with the guard — the
   ecosystem/tooling win outweighs the footgun once the validator is strict.
