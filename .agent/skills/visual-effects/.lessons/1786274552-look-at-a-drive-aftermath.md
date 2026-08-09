---
title: A drive exhibit cannot show an AFTERMATH — the hero drives on and the subject is despawned; brake him with `input`
date: 2026-08-09
scope: pwa/src/game/effects-gallery/drive-exhibits.ts, pwa/scripts/effects-gallery.mjs
concepts: [drive, effects-gallery, judging, staging, review-loop]
---

The DRIVE shelf holds the camera where the collision happened, but the SIM does not:
the hero is held flat out (`FLAT_OUT`) and `stepTraffic` forgets anything more than
`DRIVE.despawnBehindPx` (420 px) behind him, so at ~780 px/s the thing you just hit
is deleted about half a second after he passes it. Any effect whose subject is what
happens AFTER a collision settles — a wreck coming to rest, a cloud piling up around
it — is therefore never in the take, and sampling later `--at` offsets just gets you
an empty road with some smoke on it.

Two more traps in the same loop: the exhibit runs on rAF, so the same `--at` offset in
two separate runs is NOT the same moment of the collision (don't diff frames across
runs — sample densely inside ONE), and the effect layer is anchored at the GROUND
while a rolled car's sprite is drawn well above it, so a cloud that looks offset
downward is usually correct physics and wants a lift in the DRAW, not a moved anchor.

To actually look at an aftermath, temporarily give the exhibit
`input: { pedal: -1, wheel: 0 }` — the hero still hits at nearly the staged speed
(`openAt` sets it before the first tick) and then brakes, so he stays beside the
wreck and it is never forgotten. Revert it before committing.
