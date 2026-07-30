---
title: Ground camouflage is a palette diff, not a judgement call — and fixing half a family is worse than none
date: 2026-07-30
---

Two things worth doing mechanically before the eye gets involved.

**Diff the palettes against the ground tile.** THE MOON's three moonrocks
painted their LIT face `f: #888a96`, which is `moon_0`'s base grey to the digit
— the brightest part of a solid obstacle was exactly the floor behind it. THE
PROSPECTOR's suit was `#cde8f0` at alpha `0xb9`, which composites to within a
hair of the same grey. Both read as "soft, washed out, somehow wrong" and both
are one `art-audit.mjs palette <name>` away from being obvious. Compare the
candidate's brightest and darkest painted colours with the family ground's base
before sketching; if the lit face is not clearly ABOVE it and the shadow clearly
BELOW, that is the defect, whatever else you were about to redraw.

The fix usually already exists in the family. Here it was `boulder`, sitting on
the same regolith and reading perfectly, with a vacuum-lit crown well above the
floor and a deep shadow side well below it. Look for the sibling that works.

**Finish the family or leave it alone.** Four of the moon's six blob-template
mobs were redrawn and the two that had been cut in the funnel (they read better
than the blobs beside them) immediately became the only two on the retired
template — a visible inconsistency the pass itself created. Half a family on a
new rule looks worse than none of it. When the funnel's finalists turn out to
share ONE template defect, the unit of work is the template, so re-check the
cut siblings against the new rule before Phase 5 rather than shipping the split.
