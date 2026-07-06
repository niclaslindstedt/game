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
     and transparency, not just the sprite in isolation
   - `website/assets-preview/<animation>_strip.png` — frames + onion skin
   - `website/assets-preview/palette.png` — labeled swatches of every ramp
   - `website/assets-preview/font-specimen.png` — pixel-font sample lines
4. **Evaluate** against the checklist below. Be harsh; "roughly right" on
   the first pass is normal and means: keep looping.
5. **Loop** — fix the grid, regenerate, look again. Repeat until every
   checklist item passes. Two to five iterations per sprite is typical.
6. **Wire in** — import the 1x PNG from the renderer, then verify in the
   running game (the `playtest` skill) at real scale.

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

## Conventions

- Sprite sizes: characters/enemies 16×16, projectiles/pickups 8×8–12×12,
  tiles 16×16. The renderer draws at integer scale with image smoothing off.
- Grid chars: `.` = transparent; every other char must exist in `PALETTE`.
- Animation frames are separate grids named `<sprite>_0`, `<sprite>_1`, …
- Tiles must tile: check the sheet's tiled-ground strip for visible seams.
- After changing any grid, regenerate and commit the PNGs together with
  `sprite-data.mjs` — CI has no image toolchain guarantee, so the PNGs are
  the build inputs and the grids are their reviewable source.

## Skill self-improvement

When you discover a new failure mode (muddy contrast, off-pivot frames, a
seam pattern), add it to the quality checklist above so the next run catches
it in step 4 instead of in playtesting.
