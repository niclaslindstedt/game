---
title: A contact sheet that CROPS is indistinguishable from art that is flat — check the tool's own canvas maths before judging the art
date: 2026-08-10
scope: scripts/, scripts/asset-tools/
concepts: [judging, generated-art, previews, tooling, drive]
---

Half an hour of "why do all these roofs read as slabs" on the drive's town was
not the art. `scripts/town-viewer.mjs` sized its strip canvas with the lift of
each piece ADDED to its screen top instead of subtracted, so the sheet came out
exactly 18 px short — twice the gap between the frontage line and the building
line — and every roof on the road was sliced off at the same height in every
render. The bug is invisible by construction: a sheet that crops uniformly
looks like a row of flat-topped buildings, which is a plausible thing for a row
of buildings to be.

So when a preview tool composes a scene rather than blitting one sprite:

- **Verify it against a piece whose height you know** before trusting a
  judgement made from it. One tall archetype rendered alone, and its measured
  pixel height compared with `townHeight(def)`, would have caught this instantly.
- **A tool that answers a question about POSITION is part of the art pipeline**
  and gets the same scrutiny as the generator. This one had shipped, been used
  to sign off a whole rework, and was wrong the entire time.
- Two other silent skews in the same file, both of the same kind: `--at 1`
  measured the stop against `coursePx` rather than `cityEndPx`, so the last of
  the five default stops asked about the destination's run-in — road with no
  houses on it — and answered with an empty verge.

The same session also confirmed the standing rule above it: the drive's real
frame at 844x390 shows only the GROUND FLOOR band of the town, so a new
archetype earns its read from its doors, its shopfront and the strip in front
of it. Everything above the fascia — storeys, galleries, roof plant — is for
the tablet and the desktop, and cannot be the thing that tells a motel from a
bungalow at the reference viewport.
