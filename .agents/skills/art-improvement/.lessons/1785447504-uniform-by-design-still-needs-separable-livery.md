---
title: "Told apart only by livery" is a promise the palette has to keep
date: 2026-07-30
scope: content/sprites/
concepts: [livery, palette, families]
---

Identity collision has a second form the rubric's wording can hide: a family
that is SUPPOSED to be uniform. THE BUNKER ships six personal-detail guards
whose own `description` says "one of six identical guards told apart only by
livery", and they are the same 380hp minion mechanically — so making six
different silhouettes would have been wrong, and the lesson about fixing one
shared template does not, on its own, cover it.

What was actually broken was the livery. Three of the six wore near-identical
yellows (`#f6d074`, `#ffb02e`, `#d6a842`) on a 2x3px necktie, so the ONE field
that names whose detail a guard belongs to named nothing. Two fixes, both
cheap: spread the set right around the wheel (cyan / mint / red / amber /
violet / magenta), and carry each livery on THREE surfaces — visor, bicep
armband, tie — rather than one, so it survives being seen for half a second
in a crowd.

So when a family is uniform by design, check the ACCENT the same way you check
a silhouette: put all of them on one `sheet` and ask whether you could name
each one. If two accents are within a hue step of each other, that is the
defect, and it is invisible sprite-by-sprite.
