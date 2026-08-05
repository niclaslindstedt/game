---
title: Tune an additive glow's alpha against the floor it will actually appear on — a copied alpha is not a copied effect
date: 2026-08-05
---

The car's "you can get in this" halo (`pwa/src/game/render/vehicles.ts`) was
written by copying the XP veil's numbers — same baked `glowSprite`, same
`lighter` composite, `HALO_ALPHA` 0.3 — and rendered COMPLETELY INVISIBLE in the
game. Not subtle: absent. The veil's 0.3 was tuned on GOODCO's dark blue-grey
deck, and the garage bay is poured cement, a light mid-grey. An additive warm
glow over light grey has almost nothing left to add; the same alpha that reads
as a shroud on a dark floor reads as nothing at all on a bright one.

Two things follow. First, an always-on world glow's alpha is a property of the
PAIR (glow, floor) and has to be re-tuned per venue-family, not inherited — this
one landed at 0.5, which is where it reads as a faint pool rather than a
spotlight. Second, and the reason this cost a round trip: you cannot tell from
the code, and you cannot reliably tell from a full 844×390 playtest screenshot
either. Prove the effect is drawing AT ALL by cranking the alpha to 1 for one
run, then walk it back down; and judge the final value from a 4× CROP of the
screenshot around the subject, not from the whole frame.
