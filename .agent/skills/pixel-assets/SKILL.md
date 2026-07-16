---
name: pixel-assets
description: "Use when creating or changing pixel-art sprites for the game. Drives the iterative asset cycle: edit the pixel grid, regenerate PNGs, LOOK at the rendered preview, evaluate against the quality checklist, and loop until the asset passes."
---

# Creating Pixel Art Assets

All in-game pixel graphics — sprites, tiles, the palette, even the UI font —
are **generated, never hand-drawn binaries**. The source of truth is a tree
of **one self-describing YAML file per base sprite** under
`website/scripts/sprites/` (a `grid` block scalar — one line per pixel row,
one character per pixel — plus a concrete-hex `palette`; `.` is transparent).
The YAML tree is the committed source of truth; the asset pipeline renders it
into ONE sprite atlas (PNG + JSON source rects) that the app slices at load
time — a **gitignored build output**, regenerated on every build (never
committed). This keeps the assets diffable, reviewable, and editable by agents.

Each sprite's YAML also carries a `description` — the **acceptance target**:
what the sprite is _supposed_ to look like, in words. It outranks any
reference image (one fallible realization of it) and the pixels are always
re-derivable from it; when a reference image and the description disagree, the
description wins — fix the grid, not the description.

## Files

| File | Role |
| --- | --- |
| `website/scripts/sprites/<family>/<name>.yaml` | Source of truth: one file per base sprite — `name`, `family`, `size` `[w,h]`, `description`, the `palette` keys it uses (concrete hex), and its `grid`. Discover the families dynamically — `ls website/scripts/sprites/` — rather than assuming a fixed roster; this game's families and per-family learnings are in [`GAME_NOTES.md`](./GAME_NOTES.md) |
| `website/scripts/sprites/<family>/_family.yaml` | Family orchestration: `ground` tile, LOCAL `palette` chars, `animations`, wound-style overrides, and lint `contrastExempt` names |
| `website/scripts/sprites/_core.yaml` | The shared palette core (outline, gore chars, common materials) every family merges under its local scope |
| `website/scripts/sprite-data/load-yaml.mjs` | Globs the `sprites/` tree into the in-memory sprite maps; validates each file against the schema (`asset-tools/sprite-schema.mjs`) |
| `website/scripts/sprite-data/index.mjs` | Loads the base sprites, then derives battle-damage + worn-gear variants from the enemy/gear catalogs |
| `website/scripts/generate-assets.mjs` | The pipeline: grids + font → `website/src/game/assets/` (`atlas.png` + `atlas.json`, font atlas + metrics) + previews + contrast lint |
| `website/scripts/asset-tools/` | The utility pool the pipeline composes (see below) |
| `website/src/game/assets/` | Generated, **gitignored** — rebuilt on every build (`npm run assets` runs ahead of `vite`/`tsc`/`vitest`), loaded by `assets.ts`; **never edit by hand, never commit** |
| `website/assets-preview/` | Generated previews for evaluation — gitignored |

## Palette scoping

The single-character namespace is **per family, not global**. Each base
sprite's YAML carries a self-contained `palette` (only the keys it paints
with, as concrete hex). The shared core (`sprites/_core.yaml`) and the
family-local scope (`_family.yaml` `palette`) back the derived wound/worn
variants and the palette preview sheet; a family may not redefine a core
char (the loader throws). Two families may map the same char to different
colors — the namespace is scoped, not global. Check char availability per
scope on `assets-preview/palette.png` (one labeled section per scope).

## The asset-tools utility pool

Programmatic building blocks for creating and iterating on assets
(`website/scripts/asset-tools/`):

| Module | What it gives you |
| --- | --- |
| `surface.mjs` | Raw RGBA surfaces: create/fill/blit/tile, nearest-neighbor `upscale`, `checkerboard`, `mirrorX` |
| `grid.mjs` | Char-grid parsing with strict validation, `gridStats` (color counts, orphan pixels), `mirrorGridX` |
| `palette.mjs` | Color ramps (`ramp`, `shade`, `tint`), `buildPalette` (duplicate-char safe), `swapPalette` for recolor variants |
| `font.mjs` | The programmatic 3×5 pixel font: glyph grids, `renderText`/`measureText`, `buildFontAtlas` |
| `animation.mjs` | `buildFilmStrip` (frames + onion-skin anchor check), `writeAnimatedWebp` motion previews |
| `preview.mjs` | `writePng`, `buildContactSheet` (sprites over ground + light/dark checkers + tiling strip) |
| `damage.mjs` | `woundedFrames`: battle-damage variants (`hurt`/`wrecked`/`dying`) overlaid on an enemy's base frames — seeded, frame-stable, progressive |
| `atlas.mjs` | `packAtlas`: deterministic shelf-pack of every sprite surface into one texture + source rects |
| `lint.mjs` | Generation-time contrast lint: `groundContrast` (silhouette vs family ground) and `woundVisibility` (does the wound overlay visibly change the body) |
| `oklab.mjs` | sRGB↔OKLab conversion, perceptual ΔE, and the lightness→hue sort key — the shared color metric for tracing and comparing |
| `image.mjs` | `loadImage` (PNG → surface via sharp) and `resampleToCells` (per-cell DOMINANT color down to the target grid — no edge-smearing average) |
| `quantize.mjs` | `quantizeGrid`: a resampled cell grid → `{ palette, grid }`, deterministic median-cut in OKLab with stable single-char keys |
| `compare.mjs` | `compareSurfaces`: SSIM + mean OKLab ΔE + coverage between a rendered sprite and a reference — the numeric triage gate |

Rules of the pool:

- **A sprite's palette is concrete hex, one entry per key it paints.** The
  build-time derivations still lean on `ramp`/`shade`/`tint` (worn-gear ramps,
  wound shading) and `swapPalette` for recolor variants, but an authored base
  sprite carries resolved colors in its own `palette` block — keep a subject's
  shade/highlight in sensible steps by eye (or paste values a ramp produced).
- **Text is an asset too.** UI text uses the generated pixel font (atlas +
  metrics in `website/src/game/assets/`, runtime renderer in
  `website/src/lib/pixel-font.ts`). New glyphs are added to `GLYPHS` in
  `font.mjs` and evaluated via `assets-preview/font-specimen.png`.
- **Animations are frame lists** in each family's `_family.yaml` `animations` map.
  Evaluate frames on the film strip (`<name>_strip.png` — the last cell is
  an onion-skin: a double image there means the anchor drifts) and motion
  in the animated `<name>.webp`.
- **Enemy battle damage is generated, never drawn — and derived from the
  enemy catalog.** Every enemy ships wounded variants named
  `<sprite>_<stage>_<frame>`; `sprite-data/index.mjs` reads `ENEMY_DEFS`
  and derives the stages from the `role` (minions `hurt`, elites +
  `wrecked`, bosses + `dying` — thresholds in the engine's
  `config.WOUNDS`/`LAST_STAND`) and the style from the `gore` field
  (`blood` → red splats with dried cores and grime, `ecto` → pale cyan,
  `sparks` → hot gold with a white-hot core, for machines).
  A NEW ENEMY therefore needs NO wound registry entry — just its enemy def
  and base frames, then `make assets`; `tests/content/wounds_test.ts` fails until
  the frames land in the atlas. Only a mob whose body colors swallow the
  default (dark-on-dark never reads) adds an override to its family's
  `_family.yaml` `wounds` map (splat/core/scuff chars). Retuning a base sprite
  re-wounds it automatically on the next generate.
- **Derived-variant generators must be seeded and frame-stable.** Anything
  that decorates existing frames programmatically (damage.mjs is the model)
  must (a) seed its RNG from the sprite name so `make assets` stays
  byte-identical — otherwise every unrelated PR churns PNG diffs — and
  (b) place pixels only where ALL animation frames are body-colored (after
  each frame's bob shift), or the decoration flickers with the walk cycle.
  Make stages progressive (each stage applies a prefix of one wound plan)
  so a mob losing hp never rearranges its damage.

## The iterative development cycle

Never ship a sprite you have not looked at. For each asset, loop:

1. **Sketch** — add or edit the sprite's `grid` in its YAML file under
   `sprites/<family>/` (new roster/biome = a new `<family>/` directory with a
   `_family.yaml`). Start from the silhouette: block the shape in one color,
   then add shading. New chars go in the sprite's own `palette` (concrete hex);
   put a color the family shares across sprites in `_family.yaml`.
2. **Generate** — run:

   ```sh
   make assets   # = node website/scripts/generate-assets.mjs
   ```

   Read its warnings: orphan pixels, low ground contrast, and invisible
   wound overlays are flagged here, before any eyes-on pass.

3. **Look** — open the generated previews with the Read tool (it renders
   images):
   - `website/assets-preview/<name>@8x.png` — the sprite at 8x for detail work
   - `website/assets-preview/family_<family>.png` — the family's sprites
     (wounded variants included) at 4x over the family's OWN ground tile
     AND light/dark checkers, plus a tiling strip — the per-family sheet
     is the unit of review; `sheet.png` (every sprite) exists for
     cross-family sweeps
   - `website/assets-preview/<animation>_strip.png` — frames + onion skin
   - `website/assets-preview/palette.png` — labeled swatches per palette
     scope (core + each family)
   - `website/assets-preview/font-specimen.png` — pixel-font sample lines
4. **Evaluate** against the checklist below. Be harsh; "roughly right" on
   the first pass is normal and means: keep looping.
5. **Loop** — fix the grid, regenerate, look again. Repeat until every
   checklist item passes. Two to five iterations per sprite is typical.
6. **Verify in game** — nothing to wire up: the atlas covers every sprite
   automatically, and catalogs reference sprites by name. Run the real app
   (the `playtest` skill) at real scale — `?debug` exposes
   `window.__game`, so you can force the state that shows the sprite
   (e.g. set an enemy's hp fraction) and screenshot it.

## Authoring from a description or a reference image

The hand-authored grid is the default, but a set of tools bootstrap and tighten
it — `website/scripts/sprite-author.mjs` (run `node
website/scripts/sprite-author.mjs` with no args for usage):

- **`prompt <sprite-name> [--out path]`** — synthesize an image-generation
  prompt from a sprite's fields alone: the shared style preamble, its family's
  `style:` anchor (from `_family.yaml`), its `description`, size, and palette
  (with the human color names off the palette comments). The grid is left out —
  the prompt exists to regenerate it. This is the blank-canvas step: feed the
  prompt to an image model, save the result, and hand it to `analyze`. Its
  quality follows straight from the `description`, so write that first.
- **`analyze <image.png> --name N --family F [--size WxH] [--colors K] [--out
  path] [--model M] [--seed S] [--prompt-file P]`** — trace a reference image
  (one an art model produced, or a sketch) into a self-describing sprite YAML.
  It resamples per-cell to the target grid, quantizes to a stable palette
  (deterministic — same image, same letters), and prints the YAML (or writes it
  and copies the reference next to it as `<name>.ref.png` with `--out`). A clean
  pixel-art reference passes through with no color loss; a larger illustration
  is resampled down. The emitted `description` is an empty stub — fill it in, it
  is the acceptance target. Pass `--model`/`--seed`/`--prompt-file` to record
  generation provenance beside the reference (`<name>.ref.json`) so the
  generation is auditable — it is not deterministic the way the atlas is.
- **`pose <sprite-name> [--scale N] [--out path]`** — render a base sprite
  centered on a patch of its OWN family ground (not transparency) and print its
  description. This is the review surface for the evaluate step: a sprite that
  reads on a checker can vanish on its own tiles. Read the emitted PNG, judge it
  against the description, edit the grid, `make assets`, pose again.
- **`compare <sprite-name> <reference.png>`** — score the rendered sprite
  against a reference (SSIM, mean OKLab ΔE, coverage). Use it as a triage number
  while refining toward a reference image — it is NOT an acceptance test. The
  description (what the sprite IS) outranks any reference image (one fallible
  realization of it), and the human vote is still the gate.

The reference image is a source, like the grid — committed next to the YAML, not
packed into the atlas. When the image and the description disagree, the
description wins; fix the grid, not the description.

## Improving one named sprite

When asked to improve a specific sprite ("let's improve the `fembot` sprite"),
first locate its YAML (`grep -rl "name: <sprite>" website/scripts/sprites/`) and
read its `description`. If the description is empty or thin, **write/sharpen it
first** — it is the acceptance target both paths below are judged against, and
the manuscript (`docs/manuscript.md`) / `docs/story.md` are the authority on
what a character or object should look like. Then take whichever path the user
picks:

- **Image path (bring your own genAI).** Run
  `node website/scripts/sprite-author.mjs prompt <sprite>` and hand the printed
  prompt to the user to paste into an image tool. When they return the image,
  save it and run `analyze <image> --name <sprite> --family <family> --size WxH
  --out website/scripts/sprites/<family>/<sprite>.yaml` (record provenance with
  `--model`/`--seed`/`--prompt-file`), then drop into the refine loop below to
  clean up the trace against the description.
- **Iterate-in-place path (no image).** Skip the image entirely: edit the
  `grid` toward the `description` by hand, `make assets`, then LOOK — either the
  `<sprite>@8x.png` / `family_<family>.png` previews or `pose <sprite>` on its
  own ground — judge against the description, edit, and loop (the iterative
  cycle above). This is the default when the user just says "iterate on it".

Either way the loop is the same: render → look → judge against the description →
edit the grid → repeat, until it passes the checklist. Commit per sprite and let
the user make the final call before shipping.

## Quality checklist

An asset passes only when ALL of these hold **in the preview images you
actually looked at**:

- [ ] **Silhouette reads at 1x.** Cover the detail: could you tell what it
      is from the outline alone at game scale (see the 1x row of the sheet)?
- [ ] **Contrast against the ground.** The sprite separates clearly from
      its family's ground tile in the contact sheet — no vanishing edges
      (the generator warns below an edge-contrast floor, but borderline
      cases still need eyes).
- [ ] **Palette discipline.** Colors come from the family's palette scope
      (core + local), derived from subject ramps; a sprite uses ~2–5
      colors plus outline. New colors need a reason.
- [ ] **Outline consistency.** Game sprites here use a dark (not pure black)
      outline on the exterior; interior detail lines are a shade lighter.
- [ ] **No orphan pixels.** Every lit pixel is part of a deliberate cluster;
      single floating pixels read as noise at 1x.
- [ ] **Light from the top-left**, consistently across all sprites.
- [ ] **Frames align.** For animated sprites, flip between frame previews:
      the anchor (feet, center of mass) must not drift between frames.
- [ ] **Transparency is clean.** No stray semi-opaque pixels on the checker
      background rows of the sheet.
- [ ] **Overlays contrast with the LOCAL body color.** Detail painted in
      the subject's own dark ramp char vanishes (a dark wound on a dark
      body is invisible). Pick a char that separates from the pixels it
      lands on, and reuse the color of the sibling effect for coherence
      (this game's specific wound→effect color pairings are in
      [`GAME_NOTES.md`](./GAME_NOTES.md)). Verify on the @8x preview of EACH
      family — one style rarely fits all palettes.
- [ ] **Decorations don't flicker across frames.** For variants derived
      from multi-frame sprites, Read frame `_0` and `_1` previews side by
      side: every added pixel must appear in both, tracking the bob.

## Conventions

- Sprite sizes: characters/enemies 16×16 (elites 24×24, bosses 48×48),
  projectiles/pickups 8×8–12×12, tiles 16×16. The renderer draws at
  integer scale with image smoothing off.
- Grid chars: `.` = transparent; every other char must exist in the
  family's merged palette (core + local).
- Animation frames are separate grids named `<sprite>_0`, `<sprite>_1`, …
- Enemy damage stages are named `<sprite>_<stage>_<frame>` (`hurt` /
  `wrecked` / `dying`); the renderer falls back to the base frame when a
  variant is missing, so a typo degrades silently — that's what
  `tests/content/wounds_test.ts` is for.
- Gore/wound chars: `r` blood, `i` dried blood (dark core), `E` grime (all
  in the core palette — the wound generator paints them on any mob); `ecto`
  wounds in `c`/`C`, `sparks` in `y`/`Y`; per-sprite overrides live in the
  `wounds` map in each family's `_family.yaml`.
- Tiles must tile: check the sheet's tiled-ground strip for visible seams.
- After changing any grid, run `make assets` and eyeball the render, but
  commit only the `sprites/` change: the atlas (`atlas.png` +
  `atlas.json`, font atlas) under `website/src/game/assets/` is gitignored
  and rebuilt on every build (`npm run assets` runs ahead of `vite`, `tsc`,
  and `vitest`), so the grids are the sole committed source of truth and the
  binary atlas never enters a diff or merge conflict. The pack is
  deterministic: regenerating from the same grids yields the same atlas.

## Skill self-improvement

When you discover a new failure mode (muddy contrast, off-pivot frames, a
seam pattern), record it as a lesson fragment under `.lessons/` (see
[`../LESSONS.md`](../LESSONS.md)) — never by appending to this file, which
conflicts across parallel sessions. Read past ones with
`node scripts/skill-lessons.mjs pixel-assets` before drawing. During a
consolidation pass, promote recurring failure modes into the quality
checklist above so the next run catches them in step 4 instead of in
playtesting.
