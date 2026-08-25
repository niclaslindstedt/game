---
title: A spawner that walks a mark by `1000 / density` silently stops dealing a whole population where the density thins
date: 2026-08-25
scope: engine/game/rocket/, engine/game/drive/
concepts: [spawning, density, false-green, minigame, determinism]
---

Both minigames lay their world on RUNNING MARKS — a mark walks ahead of the
player and steps by a stride derived from the local density. That is exact
while the density is roughly constant, and it breaks silently the moment a
population has a soft EDGE.

In the thin tail of a fade the density is near zero, so `1000 / density` is
enormous: one step out of the bottom of a band landed the mark 35 000 px up,
past the top of the sky, and every satellite, military bird and rock above it
was never dealt again for the rest of the flight. Nothing errored. The bench
reported a perfectly plausible sky, one hazard per climb instead of twenty, and
the ladder still looked monotone across the difficulties.

Walk in FIXED steps and spawn by the integral over the step instead. And if the
population is a design PROMISE ("you meet this every run"), a per-step coin is
not enough either — a band authored at three arrivals deals zero about one run
in twenty, which a five-seed test catches and a one-seed test does not. Carry a
per-population running DEBT, add `density × step / 1000` to it each step, and
spawn every whole unit in it: the count over a band comes out at exactly what
it was authored as, and only the position, the variant and the motion stay
random.

The test that catches both is the same one: fly several seeds and assert every
population appears in each. One seed passing is exactly the evidence a rare
band would also produce.
