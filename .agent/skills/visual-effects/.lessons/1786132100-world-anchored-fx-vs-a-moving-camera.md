---
title: A world-anchored effect and a moving camera are a two-frame effect
date: 2026-08-06
---

Building the effects gallery's DRIVE shelf turned up a rule worth carrying to
any exhibit whose subject MOVES.

Every one of the drive's effects is anchored to the road — grit, sparks,
shards, the gore burst. That is right in play: you throw them and drive past
them, and watching them recede is most of what makes speed read. But the
gallery's camera is the game's own, riding a fixed lead ahead of a car doing
624 px/s, so the entire aftermath was off the left edge about **200 ms** after
the hit. A three-second exhibit of a body coming apart was two frames of gore
and then an empty road, and nothing in the code was wrong.

Two fixes, and which one applies depends on where the subject IS:

- **The subject is on the ground** (gore, sparks, a smoke column): the take
  follows the mover up to the event and then HOLDS — shift the shipped camera
  back by however far the mover has come since, so the framing stays the game's
  own and the wreckage stays in frame while the thing that made it leaves.
- **The subject is on the mover** (a bent panel, a shed bumper): holding is
  useless, because the thing to look at drives out of frame. Slow the mover
  down instead. An exhibit's threshold is usually STAGED rather than earned, so
  it costs nothing to cross it at a third of the speed.

And the same look revealed a real bug the other way round: the dead engine's
smoke was anchored to the road while the wreck coasted a screen and a half out
from under it. If an effect belongs to a THING rather than to a PLACE, it has
to be drawn at where the thing is now — the gallery is where that becomes
obvious, which is the argument for putting a moving subject on a shelf at all.
