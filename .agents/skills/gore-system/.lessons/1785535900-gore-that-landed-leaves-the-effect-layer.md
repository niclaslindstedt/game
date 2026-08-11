---
title: Gore that has LANDED belongs under the actors, not in the effect layer
date: 2026-08-01
scope: pwa/src/game/render/
concepts: [render-layers, blood-floor, effects]
---

The effect layer (`pwa/src/game/render/effects.ts`) is drawn AFTER the whole
frame, so anything in it is painted over the hero. That is right for the beats
that happen in the air — the spray, the burst, a body coming apart — and wrong
the moment those end, because the remains stay: a corpse for seconds, gibs and
cleaved halves for GORE LINGER (ten seconds shipped), an epic's for the whole
level. A player walking back through a room he cleared had chunks of somebody
drawn across him the entire time.

`restsOnFloor(effect, timeMs)` is the seam: `drawFloorRemains` draws whatever it
claims from inside `drawFrame`, under the loot and the bodies, and `drawEffects`
draws the rest on top. A NEW long-lived leftover (a scorched shell, a puddle, a
dropped limb) has to answer that predicate, or it inherits the same bug. The
handover moment is the effect's own animation ending — `GORE_BURST_MS`,
`CLEAVE_MS`, a corpse's keel-over, or the flight of a punted one — so nothing is
mid-motion when it changes sides, and the field has no depth sort to appeal to
instead.
