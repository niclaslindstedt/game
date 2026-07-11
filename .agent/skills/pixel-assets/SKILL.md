---
name: pixel-assets
description: "Use when creating or changing pixel-art sprites for the game. Drives the iterative asset cycle: edit the pixel grid, regenerate PNGs, LOOK at the rendered preview, evaluate against the quality checklist, and loop until the asset passes."
---

# Creating Pixel Art Assets

All in-game pixel graphics — sprites, tiles, the palette, even the UI font —
are **generated, never hand-drawn binaries**. The source of truth is a set
of pixel grids in the `website/scripts/sprite-data/` family modules (text:
one string per pixel row, one character per pixel, palette chars mapped to
RGBA). The asset pipeline renders them into ONE committed sprite atlas
(PNG + JSON source rects) the app slices at load time. This keeps assets
diffable, reviewable, and editable by agents.

## Files

| File | Role |
| --- | --- |
| `website/scripts/sprite-data/<family>.mjs` | Source of truth: one module per sprite family, each bundling its grids, LOCAL palette chars, animations, wound overrides, and lint exemptions. Discover the families dynamically — `ls website/scripts/sprite-data/*.mjs` (everything but `core.mjs`/`index.mjs`) — rather than assuming a fixed roster; this game's families and per-family learnings are in [`GAME_NOTES.md`](./GAME_NOTES.md) |
| `website/scripts/sprite-data/core.mjs` | The shared palette core (outline, gore chars, common materials) + exported subject ramps families derive local chars from |
| `website/scripts/sprite-data/index.mjs` | Merges the families, resolves each sprite's core+local palette, derives battle-damage variants from the enemy catalog |
| `website/scripts/generate-assets.mjs` | The pipeline: grids + font → `website/src/game/assets/` (`atlas.png` + `atlas.json`, font atlas + metrics) + previews + contrast lint |
| `website/scripts/asset-tools/` | The utility pool the pipeline composes (see below) |
| `website/src/game/assets/` | Generated, checked in, loaded by `assets.ts` — **never edit by hand** |
| `website/assets-preview/` | Generated previews for evaluation — gitignored |

## Palette scoping

The single-character namespace is **per family, not global**: each family
module's `palette` maps the chars only it draws with, merged at build time
with `CORE_PALETTE` (chars shared by two or more families: the outline
`O`, the gore chars `r`/`i`/`E` the wound generator paints anywhere, and
common materials). Two families may map the same char to different colors.
A new subject's chars go in ITS family's palette — touch `core.mjs` only
when a second family starts drawing with an existing char. Check char
availability per scope on `assets-preview/palette.png` (one labeled
section per scope).

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

Rules of the pool:

- **Palettes are ramps, not loose hex values.** Each subject (hero, slime,
  grass biome, medkit…) declares a base color; shades/highlights are derived
  with `ramp`/`shade`/`tint`. Re-theming a character or a level biome means
  changing ONE base color. A new colorway of an existing drawing (elite
  enemy, autumn biome) is `swapPalette(grid, mapping)` — never a redraw.
- **Text is an asset too.** UI text uses the generated pixel font (atlas +
  metrics in `website/src/game/assets/`, runtime renderer in
  `website/src/lib/pixel-font.ts`). New glyphs are added to `GLYPHS` in
  `font.mjs` and evaluated via `assets-preview/font-specimen.png`.
- **Animations are frame lists** in each family module's `animations` map.
  Evaluate frames on the film strip (`<name>_strip.png` — the last cell is
  an onion-skin: a double image there means the anchor drifts) and motion
  in the animated `<name>.webp`.
- **Enemy battle damage is generated, never drawn — and derived from the
  enemy catalog.** Every enemy ships wounded variants named
  `<sprite>_<stage>_<frame>`; `sprite-data/index.mjs` reads `ENEMY_DEFS`
  and derives the stages from the `role` (minions `hurt`, elites +
  `wrecked`, bosses + `dying` — thresholds in the engine's
  `config.WOUNDS`/`LAST_STAND`) and the style from the `gore` field
  (`blood` → red splats with dried cores and grime, `ecto` → pale cyan).
  A NEW ENEMY therefore needs NO wound registry entry — just its enemy def
  and base frames, then `make assets`; `tests/wounds_test.ts` fails until
  the frames land in the atlas. Only a mob whose body colors swallow the
  default (dark-on-dark never reads) adds an override to its family
  module's `wounds` map (splat/core/scuff chars). Retuning a base sprite
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

1. **Sketch** — add or edit the sprite's grid in its family module under
   `sprite-data/` (new roster/biome = new family module, registered in
   `index.mjs`). Start from the silhouette: block the shape in one color,
   then add shading. New chars go in the FAMILY's palette unless they're
   genuinely shared.
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
  `tests/wounds_test.ts` is for.
- Gore/wound chars: `r` blood, `i` dried blood (dark core), `E` grime (all
  in the core palette — the wound generator paints them on any mob);
  ghost-tier overrides wound in `c`/`C`/`U`/`N` (see the `wounds` maps in
  the family modules).
- Tiles must tile: check the sheet's tiled-ground strip for visible seams.
- After changing any grid, run `make assets` and eyeball the render, but
  commit only the `sprite-data/` change: the atlas (`atlas.png` +
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
