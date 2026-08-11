---
title: An expanding-ring effect is tuned against the FRAME, not against the world — reach ~1.5× the frame's half-diagonal, and fade linearly
date: 2026-08-11
scope: pwa/src/game/drive-screen/drive-fx.ts, pwa/src/game/render/effects.ts
concepts: [shockwave, ring, expanding, tuning, additive-glow, review-loop]
---

The first cut of the drive's blast shockwave reached 640 world px in 900 ms and
faded on `(1-t)²`. It was invisible in every capture, and both halves were why:

- **Reach.** A drive frame is ~422 world units wide and ~110 of road tall, so
  its half-diagonal is about 290. A ring that reaches 640 is off-screen a third
  of the way through its life and spends the rest drawing a circle nobody can
  see. The useful bound is **~1.5× the half-diagonal** — far enough that the
  front visibly LEAVES the picture (a wave that stops is a ripple), close enough
  that most of its life is spent in frame. 420 px over 1100 ms reads.
- **Fade.** `(1-t)²` is the honest curve for energy spread round a growing
  circumference and the wrong one for something that has to be SEEN: combined
  with a `lineWidth` on the same curve, the front is a 1-px line at a third
  alpha by the time it crosses the frame. Fade LINEARLY, and start the front
  thick (6 px) with a wide dim wake (16 px) just inside it.

And a wave on the ground is NOT automatically a floor ellipse. A blast front is a
sphere of air; drawing it squashed through `projectOffset` read as a ripple in a
puddle under the wreck. Run the RADIUS through the projection (so it travels at
the same speed as anything else measuring ground) and then use it in BOTH screen
axes — a true circle.

To judge one at all, sample `--at` offsets INSIDE its own life rather than
`--strip` across the exhibit's `showMs`: a 1.1 s ring inside a 3.2 s show gets
one or two strip frames, and a strip under `--speed` shifts which. Work out when
the effect fires (the drive shelf's plants land ~420 ms in) and shoot six offsets
across the second after it.
