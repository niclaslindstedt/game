---
title: To judge a SLOW looping effect (a breath, a pulse), read a SERIES of back-to-back screenshots — one shot is meaningless and a settle-then-shoot pair is worse
date: 2026-08-09
concepts: [playwright, screenshots, measurement, ab-testing, overlays, transient-fx]
---

A transient needs an in-page watcher (see the freeze lesson beside this one). A
slow LOOP — the car's boardable halo breathing over 2 s, a lamp's flicker — does
not: it is always happening, so the question is only whether you sampled enough
of it. Take 100+ screenshots in a tight loop with NO `waitForTimeout` between
them, reduce each to the mean luminance of one small patch the effect is the
only thing lighting, and print the whole series. The oscillation is obvious in
the numbers (`134 136 138 145 148 149 147 142 …`) and min/max ARE the trough and
the peak.

Two ways this pass got it wrong first, both of which produce a confident wrong
answer:

- **Settle, then sample a dozen frames.** The series came out MONOTONIC every
  time — and identical whether the settle was 12 s or 30 s — which reads like a
  fade rather than a loop and tells you nothing about the swing.
- **Sampling through an overlay.** The garage hub opens on a quest offer that
  covers the whole world for many seconds; those frames scored ~29 against ~140
  and dragged the "dimmest" sample to a picture of a menu. Reject them with a
  REFERENCE patch — a bit of the scene that is bright whenever the world is
  actually on screen (the car's white flank did it) — or simply drop samples
  below an obvious floor.

And to prove a change did what was asked, A/B it in the source: flip the
constant back with a two-line edit, re-run the identical sampler (vite HMR picks
it up, no restart), then restore. That turned "the pulse looks deeper" into
min/max 141.9/148.9 before and 134.1/148.9 after — the peak provably unchanged,
which was the actual requirement.
