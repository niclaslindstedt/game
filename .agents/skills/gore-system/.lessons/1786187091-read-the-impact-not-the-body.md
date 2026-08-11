---
title: A rule downstream of a collision must read the IMPACT, never the struck body — the blow has already moved it
date: 2026-08-08
scope: engine/game/drive/
concepts: [drive, collision, impact, ordering, eject, head-on]
---

`collide()` runs a sequence on one struck vehicle — `hurtTraffic`, then
`breakCar` (crush, glass, shed, **shunt**, tip), then `ejectOccupants` — and
each step MUTATES the thing the next step is looking at. Anything late in that
chain that reads `other.*` is reading a post-blow number.

It has now bitten twice, the same way both times:

- **`breakCar` read `other.wrecked`** to decide whether to shunt. `hurtTraffic`
  had already set it, so the blow that writes a car off never shoved it — the
  hardest collision on the road produced no movement at all.
- **`headOn` read `other.speed`** to ask "were we closing?". `shunt` runs first
  and a head-on punt REVERSES an oncoming car, so the rule saw a vehicle going
  the hero's own way and returned false on precisely the collision it exists
  for. No halves, no glass gore, no spray — for weeks, silently.

The fix in both cases is the same and it is the one the file already states for
`squareness` and `panel`: **the solver has the number in its hand, so carry it
on the `Impact`** (`Impact.approach` is the second one) rather than re-deriving
it downstream from state that has since moved. If a fact is about the moment of
contact, it belongs on the impact.

**AND THE OBVIOUS TEST WILL MISS IT.** A staged head-on hard enough to WRITE THE
CAR OFF ejects from inside `hurtTraffic` — *before* `breakCar` reaches `shunt` —
so it takes a completely different path and passes straight through the bug.
Every softer blow, which is every one a player actually meets, took the broken
path. When testing anything in this chain, stage it **under** the write-off line
(`wreckForce < 1`) as well as over it.
