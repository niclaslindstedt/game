---
name: pixel-assets
description: "Use when creating or changing pixel-art sprites for the game. Drives the iterative asset cycle: edit the pixel grid, regenerate PNGs, LOOK at the rendered preview, evaluate against the quality checklist, and loop until the asset passes."
---

# Creating Pixel Art Assets

All in-game pixel graphics — sprites, tiles, the palette, even the UI font —
are **generated, never hand-drawn binaries**. The source of truth is a set
of pixel grids in `website/scripts/sprite-data.mjs` (text: one string per
pixel row, one character per pixel, palette chars mapped to RGBA). The asset
pipeline renders them to the PNGs the app imports. This keeps assets
diffable, reviewable, and editable by agents.

## Files

| File | Role |
| --- | --- |
| `website/scripts/sprite-data.mjs` | Source of truth: palette ramps, sprite grids, animation frame lists |
| `website/scripts/generate-assets.mjs` | The pipeline: grids + font → `website/src/game/assets/` (1x PNGs, font atlas + metrics) + previews |
| `website/scripts/asset-tools/` | The utility pool the pipeline composes (see below) |
| `website/src/game/assets/` | Generated, checked in, imported by the renderer — **never edit by hand** |
| `website/assets-preview/` | Generated previews for evaluation — gitignored |

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
- **Animations are frame lists** in `ANIMATIONS` (sprite-data.mjs). Evaluate
  frames on the film strip (`<name>_strip.png` — the last cell is an
  onion-skin: a double image there means the anchor drifts) and motion in
  the animated `<name>.webp`.
- **Enemy battle damage is generated, never drawn.** Every enemy ships
  wounded variants named `<sprite>_<stage>_<frame>` (stages by role:
  minions `hurt`, elites + `wrecked`, bosses + `dying` — thresholds in the
  engine's `config.WOUNDS`/`LAST_STAND`), produced by the `WOUND_STYLES`
  loop at the bottom of sprite-data.mjs. A NEW ENEMY needs a `WOUND_STYLES`
  entry (splat/core/scuff chars + stage count) and `make assets` —
  `tests/wounds_test.ts` fails until the frames exist. Retuning a base
  sprite re-wounds it automatically on the next generate.
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

1. **Sketch** — add or edit the sprite's grid in `sprite-data.mjs`. Start
   from the silhouette: block the shape in one color, then add shading.
2. **Generate** — run:

   ```sh
   make assets   # = node website/scripts/generate-assets.mjs
   ```

3. **Look** — open the generated previews with the Read tool (it renders
   images):
   - `website/assets-preview/<name>@8x.png` — the sprite at 8x for detail work
   - `website/assets-preview/sheet.png` — every sprite at 4x on the actual
     ground tile AND on light/dark checkers, so you judge in-game contrast
     and transparency, not just the sprite in isolation.
     **The full sheet is now 200+ sprites wide and unreadable in one look**
     — when evaluating a family, write a scratch script that calls
     `buildContactSheet` with just that subset (over the RIGHT biome tile:
     `moon_0` or `lab_0`) and Read that instead
   - `website/assets-preview/<animation>_strip.png` — frames + onion skin
   - `website/assets-preview/palette.png` — labeled swatches of every ramp
   - `website/assets-preview/font-specimen.png` — pixel-font sample lines
4. **Evaluate** against the checklist below. Be harsh; "roughly right" on
   the first pass is normal and means: keep looping.
5. **Loop** — fix the grid, regenerate, look again. Repeat until every
   checklist item passes. Two to five iterations per sprite is typical.
6. **Wire in** — register the PNG in `website/src/game/assets.ts` (an
   import + a `SPRITE_URLS` entry; `SpriteName` typing follows for free).
   For BULK additions (tens of sprites), don't hand-edit: regenerate the
   import block + map from a `readdirSync` of the assets dir with a scratch
   script, keeping imports sorted by module path. Then verify in the
   running game (the `playtest` skill) at real scale — `?debug` exposes
   `window.__game`, so you can force the state that shows the sprite
   (e.g. set an enemy's hp fraction) and screenshot it.

## Quality checklist

An asset passes only when ALL of these hold **in the preview images you
actually looked at**:

- [ ] **Silhouette reads at 1x.** Cover the detail: could you tell what it
      is from the outline alone at game scale (see the 1x row of the sheet)?
- [ ] **Contrast against the ground.** The sprite separates clearly from the
      grass tile in the contact sheet — no vanishing edges.
- [ ] **Palette discipline.** Colors come from the shared `PALETTE` map;
      a sprite uses ~2–5 colors plus outline. New colors need a reason.
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
      the subject's own dark ramp char vanishes (a dark-violet wound on the
      dark-violet wraith is invisible). Pick a char that separates from the
      pixels it lands on, and reuse the color of the sibling effect for
      coherence (ghost wounds = the ecto splash's pale cyan, staff wounds =
      the blood splash's red). Verify on the @8x preview of EACH family —
      one style rarely fits all palettes.
- [ ] **Decorations don't flicker across frames.** For variants derived
      from multi-frame sprites, Read frame `_0` and `_1` previews side by
      side: every added pixel must appear in both, tracking the bob.

## Conventions

- Sprite sizes: characters/enemies 16×16, projectiles/pickups 8×8–12×12,
  tiles 16×16. The renderer draws at integer scale with image smoothing off.
- Grid chars: `.` = transparent; every other char must exist in `PALETTE`.
- Animation frames are separate grids named `<sprite>_0`, `<sprite>_1`, …
- Enemy damage stages are named `<sprite>_<stage>_<frame>` (`hurt` /
  `wrecked` / `dying`); the renderer falls back to the base frame when a
  variant is missing, so a typo degrades silently — that's what
  `tests/wounds_test.ts` is for.
- Gore/wound chars: `r` blood, `i` dried blood (dark core), `E` grime;
  ghost tiers wound in `c`/`C`/`U`/`M`/`N` per family (see `WOUND_STYLES`).
- Tiles must tile: check the sheet's tiled-ground strip for visible seams.
- After changing any grid, regenerate and commit the PNGs together with
  `sprite-data.mjs` — CI has no image toolchain guarantee, so the PNGs are
  the build inputs and the grids are their reviewable source.

## Skill self-improvement

When you discover a new failure mode (muddy contrast, off-pivot frames, a
seam pattern), add it to the quality checklist above so the next run catches
it in step 4 instead of in playtesting.
