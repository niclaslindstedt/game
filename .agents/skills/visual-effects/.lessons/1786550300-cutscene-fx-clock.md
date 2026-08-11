---
title: A cutscene effect runs on the SCENE clock and needs its own state on the actor — not a render-side ref
date: 2026-08-09
scope: pwa/src/game/overlays/CutsceneOverlay.tsx, engine/lib/cutscene.ts
concepts: [cutscene, determinism, effects-clock]
---

An effect that hangs off a cutscene actor's POSE (the launch ship's engine
lighting) needs to know how long ago the pose happened, and `CutsceneState`
carried no such clock — only `timeMs`, `beat` and `beatMs`, none of which
survive the beats moving on.

The right answer was a field on the engine's `CutsceneActor` (`poseMs`, reset by
a `pose` beat that actually CHANGES the sprite, advanced in `stepCutscene`),
not a `Map` of ages held in the overlay. It is pure, it replays identically, and
the cutscene preview harness screenshots beats — an effect on a wall clock or a
render-side ref gives a different picture on every capture.

The second half of the same rule: `paintOne` hands a drawing its own top-left as
the origin, so anything an effect needs in STAGE coordinates (where the pad is,
how far off a prop stands) must be handed over and converted at paint time —
only the paint knows how tall the art is, and therefore where the actor's feet
are.

A SECOND CLOCK question came out of the same work and is worth carrying: a
CUTSCENE CHAIN has to record which END of the run it was
(`GameState.cutsceneThen`), because a prelude and a level's `farewell` are
indistinguishable by the time either drains — both are the `cutscene` phase with
an empty queue. Every exit from the chain has to honour it, and the one that is
easy to miss is SKIP: `skipCutscene` sent every chain to the level-name `title`
card, which for a send-off drops a player who has just BEATEN the level back
onto the card announcing it.
