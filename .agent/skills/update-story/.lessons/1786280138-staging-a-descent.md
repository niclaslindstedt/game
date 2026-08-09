---
title: Staging a scene that brings something DOWN — `lift:` on the actor, and a LADDER of jumps
date: 2026-08-09
scope: content/cutscenes/, engine/lib/cutscene.ts
concepts: [cutscenes, staging, depth-and-lift, rockets, easing]
---

A scene that OPENS in mid-air cannot be built out of `jump` beats alone: a jump
interpolates from wherever the actor already is, so a thing coming down has to
fly UP first, in frame, before it can fall. That is what `CutsceneActorDef.lift`
is for — the opening value of the runtime height, so the actor starts off its
mark.

**Author `at:` as the mark it is descending TO, never the sky it starts in.**
Everything measured against the ground reads that field and nothing else: the
painter's sort key, and — for a rocket — the plume's length, the pad blast and
how far the soot carries (`rocketPadLook`/`padY` in `CutsceneOverlay`). Authoring
the ship up in the sky put its pad blast in the sky with it.

**A descent is several `jump` beats, not one.** The easing is picked from the
DIRECTION of travel (`stepCutscene`): a fall is `t*t`, accelerating out of its
apex, so one long fall reads as a dropped brick hitting the lawn. A ladder of
shortening beats — 120→78→46→24→9→0 over 900/800/700/600/500 ms — has each beat
start slower than the last one ended, which reads as a retro burn biting,
letting go, and biting again. Position stays continuous across the seam
(`beginBeat` reads `liftFrom` off the live actor); only speed steps.

And the airborne frame is `<sprite>_jump`, which nothing but the hero authors —
every other body falls through to `alt: <sprite>_0`, so a ship simply holds
frame 0 while off the ground. Fine for a hull; worth knowing before you go
looking for the missing art.
