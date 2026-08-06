---
title: Ground art drawn for a side-view stage reads as STAIRS the moment it flares, and it must be painted with the floor rather than sorted into the standing queue
date: 2026-08-06
---

Adding the driveway and the road to the launch cutscene
(`content/cutscenes/launch.yaml`, sprites in `content/sprites/scenes/`) hit two
traps neither of which is about the pixels' colours.

**Draw order first.** A cutscene stage prop is bottom-anchored and painter-sorted
by `y` (`CutsceneOverlay.tsx`), which is correct for anything STANDING and wrong
for anything LYING DOWN: a slab is anchored at its NEAR edge, so a driveway that
reaches the bottom of the frame sorts in front of every actor walking over it and
paints out their feet. There is no way to author around it — the fix is the
renderer's, and it is now `ground: true` on the prop, which paints it with the
floor under the whole standing queue. Check the same question before drawing any
floor piece for a stage: what is its anchor, and who stands on it?

**Then the flare.** The first driveway was a trapezoid — narrow at the garage
door, wide at the kerb — with two poured joints across it. It rendered as a
flight of stone STEPS, because the 1-px-per-3-rows edge stepping plus the
horizontal joint lines are exactly how a staircase is drawn, and because the
house beside it is drawn flat side-on with no perspective at all. A straight-
sided slab with NO horizontal lines read as a driveway immediately. What sold
the direction instead was two faint wheel tracks (`p`, one step darker than the
paving) running the slab's length — vertical detail says "this runs away from
you", horizontal detail says "this is a step".

And a night-graded ground piece will trip the contrast lint against its family's
DAYTIME ground tile (`garage_drive: edge contrast 60 vs grass_0`). That is the
lint working: the sprite is never drawn on grass_0, only on its scene's own dark
lawn wash, so it belongs in the family's `contrastExempt` beside the sky pieces —
not brightened until it clashes with the scene it actually lives in.
