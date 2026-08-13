---
title: A headless `step()` loop stalls after one tick on a venue with a prelude — force `phase = "playing"` EVERY tick, not once
date: 2026-08-13
scope: scripts/, engine/game/step/
concepts: [headless, probes, determinism, measurement]
---

Stepping the garage through `createRunFromParams` + `step()` moved the world
for exactly one tick and then froze — `stats.timeMs` stopped advancing and
nothing walked. The venue's prelude puts the run back into `cutscene`, and a
phase forced once before the loop is a phase the first tick overwrites.

Force it inside the loop (`s.phase = "playing"; s.talk = null;`) and the run
steps normally. Also note `step(state, input, dtMs)` takes a PARTY input —
`{ inputs: [{ move: null, view: {...} }] }` — and milliseconds, not seconds.

Worth the rig: 30 s of headless stepping proved the arriving quest giver's
walk timing, that the roll-up opened for her, and that the trader's beat swept
the whole of a road whose length had just changed — three questions no
screenshot answers.
