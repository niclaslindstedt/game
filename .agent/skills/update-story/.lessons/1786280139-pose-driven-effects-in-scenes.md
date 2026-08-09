---
title: A POSE-DRIVEN effect dies when the pose is undone — and is looked up from the FRAMED name
date: 2026-08-09
scope: content/cutscenes/, pwa/src/game/overlays/CutsceneOverlay.tsx, pwa/src/game/render/rocket-exhaust.ts
concepts: [cutscenes, pose-driven, effects, silent-failure, rockets]
---

Two bugs of one family, and a scene that turns an effect OFF is the first thing
to find both. Neither showed while the only rocket scene in the game was a
LAUNCH — which lights an engine, climbs, and fades out with it still burning.

**A spent effect must keep its mark.** Everything the blast does to the scenery
— the soot on the house, the roof catching, the scorched lawn — is clocked off
the ship's `poseMs`, so posing it back to the cold sprite took all of it off in
the single frame the engine cut. `stagedRocket` now reports a FINISHED burn for
a rocket that has been re-posed and is no longer lit (`BLAST_SPENT_MS`, derived
from the ramps so re-timing one cannot leave it short). The general rule: if an
effect's clock is a pose, ask what it should look like after the pose is undone,
because "instantly nothing" is almost never the answer.

**Look an effect up from `actor.sprite`, never from the framed name.** The
painter asks the atlas for `<sprite>_<frame>`, and an actor off the ground is
asked for `<sprite>_jump` — a name no effect table answers to, so the plume
silently drew NOTHING for the whole descent while the soot and the roof fire
(read off the unframed name) worked perfectly, which is a confusing half-broken
picture to debug. The look now travels ON the placed item instead of being
re-derived at paint time.

**And `pwa/scripts/cutscene-preview.mjs --tags cleared:moon`** is how a scene's
conditional dressing gets looked at at all — without run tags the harness can
only ever shoot opening night, which for a scene with a `needs:`/`until:` ladder
is the one rung that is not the interesting one.
