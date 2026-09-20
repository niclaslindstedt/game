---
title: A test that WARPS the hero across the map trips the level's first-sight read and parks the run in `dialogue`
date: 2026-09-20
scope: tests/
concepts: [tests, false-green, staging, story, carve]
---

Staging by assigning `hero.pos` to somewhere mid-map — a lift pad, a boss room —
drops the hero in front of a horde he has not "seen" yet, so the level's
`firstSightThoughts` fires on the next `step` and `state.phase` becomes
`dialogue`. A frozen run steps nothing, and the assertion about the thing under
test fails with a number that looks like a physics bug (Boot Hill's lift: the
hero simply stayed on the pad).

`startGame` in `tests/helpers.ts` skips the CUTSCENE and the INTRO; it does not
spend the place-pinned reads. Push the thought id onto `state.thoughtsSeen`
before the first step, and assert `state.phase` is `"playing"` right after it —
a staging that stops holding otherwise fails silently and green.

It surfaces on a carve change rather than on a code change: the map is generated
per seed, so a generator edit moves the horde and a test that has warped the hero
for years starts seeing one.
