---
title: A rank of upright bars in a box reads as a six-pack, whatever you colour it
date: 2026-08-05
---

The AMMUNITION pickups were three tall bars standing side by side inside a
rectangle — brass ones for BULLETS, cyan ones for CELLS — and both read to
players as *drinks*. The pouch icons had the same problem one object down: a
6×6 body with a flat cap and a coloured band across the middle is a soda can,
and a 4-wide case with a rounded top and a grey foot is a beer bottle. Colour
does not rescue any of it; the silhouette had already answered.

Three edits fixed all four sprites, and none of them is shading:

- **Lay the object DOWN.** A drink stands up. Anything drawn horizontally is
  immediately not one, and a 12×12 canvas has room for two lying objects
  staggered one under the other, which reads as a small heap rather than a
  packaged set. This is the single highest-yield change.
- **Break the straight top edge.** The tell of a container is a flat cap over
  straight walls, so the tell of a projectile is the opposite: taper the nose
  over three or four steps (1 px → 3 px → 5 px, the way `icon_ammo_arrows`
  builds its broadhead) and let the point stick out past the body's outline
  on the middle row. A 1-px extension is invisible at game scale; go 3–4 px.
- **Make the proportions the object's own.** A battery is ~1:2.5 with a narrow
  terminal nub; the old cell icon was 1:1 with a wide one, which is a jar. The
  ratio carries more identification than any interior detail at 12 px.

And a contrast trap that only shows up on the POSE, never on the @8x preview:
**bare steel (`#8d9196`, the core's `A`) is the moon regolith's own colour**, so
a cartridge's steel head vanished completely against `moon_0` while looking
perfectly fine on the checker. The fix was to drop steel from the sprite
entirely and draw the whole round in brass with the extractor groove as a dark
outline-coloured line — one warm mid-tone that separates from grey ground, dark
ground and light lab tile alike. Run `sprite-author pose` on every pickup: a
pickup lands on every biome, not just its family's.
