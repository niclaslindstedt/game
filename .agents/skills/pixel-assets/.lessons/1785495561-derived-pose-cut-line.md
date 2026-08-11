---
title: A derived POSE must delete rows from the legs, and the cut line has to be read off the sprite
date: 2026-07-31
scope: content/sprites/
concepts: [poses, derived-sprites, anatomy]
---

Deriving a second pose from a base sprite (a kneel, a slump, a buckle) is a
legitimate shortcut — but only with the right transform, and the two obvious
ones are both wrong:

- **Shifting the whole grid down and clipping the bottom** reads as the thing
  SINKING INTO THE FLOOR, not as a body giving way. Ground contact moves, which
  is the one thing that must not.
- **Scaling vertically** resamples pixel art into mush.

The transform that works is: **sink the upper body by `d` rows and DELETE `d`
rows out of the legs**, so the height shrinks and the ground contact stays
exactly where it was. Add a small horizontal shear on the rows above the waist
(±1–3 px) — without it the pose is just the same sprite lower down, and reads as
a rendering bug rather than as a body failing.

**The cut line has to be READ off the sprite, not guessed.** Picking a plausible
`leg_start` cut straight through a face, a screen and a tread band on three of
nine sprites — the BRO SUPERCORE lost half its eye and came out looking
corrupted. Print the lower rows of the grid first and put the cut in a band of
repeated structure (a tread, a plinth, a leg stalk), never through a feature.

**A body that cannot kneel needs a different verb.** A floater has no legs to
fold (THE FLAGBEARER settles onto his own hem — delete the BOOTS, not the gap above
them) and a wheeled chassis cannot compress at all (the BRO SUPERCORE reads as
`drop: 2` plus a big shear — the TILT is the whole pose). Ask what this body
does when it gives way before picking the numbers.

And the derived file inherits the base's `description`, which is the ACCEPTANCE
TARGET — a kneel sprite still described as standing is a sprite nobody can judge.
Rewrite `description` as well as the `subject.pose`/`flavor` slots, or
`sprite-author verify` passes while the words describe a different sprite.
