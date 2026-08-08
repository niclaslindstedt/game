---
title: A ground tile lies on a swatch — judge it with `field`, and check the biome isn't a recolour
date: 2026-07-30
scope: content/sprites/
concepts: [ground-tiles, biomes, judging, tiling]
---

Two things a Mars pass turned up that the survey sheet cannot show, both now in
the rubric and the helper table:

**A ground or patch tile has to be seen REPEATED.** `level <id>` and `sheet`
draw one 16×16 cell, where a tile with six stray flecks looks like reasonable
texture. Laid down across a map those flecks line up into a visible lattice of
dots at exactly 16px, and a patch pair is worse — patches clump on a **4×4 tile
block** (`groundTileName`, `tileHash(tx >> 2, ty >> 2) % every`), so whatever
the pair draws is stamped sixteen times inside one 64×64 area, and Mars's read
as rows of the identical comma-shaped cluster. `art-audit.mjs field
<level|name|module.mjs>` exists for this now: a level id lays the tile down
under that level's own rule (imported from the renderer, not restated), a bare
name tiles it flat, and a concept module tiles each sketch — so candidates are
judged as a field BEFORE install. Three cures, in order: write the grid with
**wrapping** coordinates so a feature meanders into its neighbour instead of
stopping at the seam; make the grain **dense** so the eye has nothing isolated
to lock onto; and past that just lower the **contrast**, because a 16px tile
repeated cannot be aperiodic. Beware smooth periodic value-noise with a handful
of sine terms — thresholded, it makes exactly one blob per tile and is the
worst lattice of the lot.

Then judge it AGAIN in `scripts/level-render.mjs <id> --bare --dormant`: two
ripple bands per tile passed the field sheet at 3× and still resolved into a
diamond mesh at the game's own 2×. And note `before-after` cannot show a ground
change at all — it draws both cells over the CURRENT ground, so the pair comes
out as two identical squares. Crop the same patch of the level render from
before the pass and after it, and stack them.

**Check whether the biome is another biome recoloured.** Thirty of Mars's
terrain sprites were the Moon's, pixel for pixel — every `marsboulder_*`, both
craters, `red_rocks`, all three `marsrock_*`, and the whole `mars_pit`/`_scar`/
`_debris` set. Find them in one pass: normalize each grid to a canonical char
sequence (map distinct chars to indices by first appearance) and compare
families for identical shapes. It always reads as the wrong place — the moon is
airless, so its rock is sharp-shattered and its craters keep bright unweathered
rims, none of which survives anywhere with wind. The fix is the shape LANGUAGE,
not the hue: on Mars, wind-scoured facets, drift banked against every foot, and
craters worn low and half-filled with fines.

One happy corollary: the better language is often already in the same family.
Mars's own `marsboulder_*` set carries a dark outline, a **sun-caught dust rim**
(`p` #deaa86) just inside it on the lit side, a broad lit face and a deep
shadow — and that rim is most of why they read off the dust while the
`marsrock_*` trio did not. Read the strongest sibling's YAML before sketching.
