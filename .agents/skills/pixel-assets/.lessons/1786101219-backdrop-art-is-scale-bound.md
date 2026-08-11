---
title: A backdrop sprite is bound to the SCALE it was drawn for — a cutscene tile is not a world tile
date: 2026-08-07
scope: content/sprites/scenes/
concepts: [backdrops, scale, cutscenes]
---

`content/sprites/scenes/stars_a`/`stars_b` are 16×12 starfield tiles authored
for the space cutscenes, where they sit behind a 16-px planet on a full-screen
canvas. Reused as the night sky over the drive minigame — which draws at world
scale, ~422 px across — they laid a wallpaper of fat white four-point crosses
over the whole frame: at that scale a "tiny speck" is a third of a star's worth
of screen. The same applied to `sky_moon`, whose grey palette and dark outline
read as a pebble somebody had thrown once it was up in a lit sky rather than
hanging in a black window.

Two rules fell out of it:

- **Check a sprite's HOME SCALE before reusing it.** The fix was a purpose-drawn
  `night_moon` (bigger, brighter, no outline, because up there it is the light
  source rather than an object) and dropping the star tiles entirely — a star
  is ONE PIXEL, so there is no art to place and a hash-placed `fillRect` beats
  any tile, which would also repeat seven times across the frame.
- **A soft glow is a gradient, not a sprite.** The moon's halo has no edge to
  draw; a sprite would have to invent one. The "sprite, not a primitive" rule is
  about art standing in for art, not about atmosphere.

For the CLOUDS, generating the grid from overlapping half-ellipses beat
hand-stepping the silhouette (which came out as regular blocky terraces), but
two passes are needed after the fill or it looks wrong in a specific way:
crown the top pixel of a column ONLY where that column faces up — painted down
the flanks too, the highlight becomes an outline — and prune any column too thin
to carry both a crown and a belly, or the ends of the shape sprout single-pixel
spurs that read as orphans at 1x.
