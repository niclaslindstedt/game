---
title: A DRIVE exhibit can only ever show ONE moment — the host freezes the camera at the exhibit's own collision
date: 2026-08-12
scope: pwa/src/game/drive-screen/exhibits.ts, pwa/src/game/drive-screen/exhibit-run.ts
concepts: [gallery, exhibits, drive, camera, verification]
---

`exhibit-run.ts` follows the wagon until the exhibit's declared `shows` event
lands and then HOLDS the camera there, so the aftermath stays in the display case
instead of leaving frame in 200 ms. That is right for every shelf about a
collision and it puts a hard ceiling on any shelf about a SEQUENCE: the car
drives out of the picture, and everything after the first hit happens somewhere
the camera no longer is. A take staged to show three beats 1.5 s apart shows the
first one and then two seconds of empty tarmac with no car in it — which reads as
a rendering bug, not as a staging mistake. Size the `showMs` to the FIRST beat
and say in the comment that the pacing is not reviewable on this shelf.

Three staging traps that cost a rebuild each, all cheap once known:

- A BODY PLANTED A SECOND OF ROAD AWAY WANDERS. `plantBody` gives every body
  `phase: 0`, so they all drift the SAME way at up to `DRIVE.walkPx`, and a lone
  figure on the car's line can be 40 px off the bumper by the time the car
  arrives. Plant a KNOT spread wider than the drift, not a body.
- THE `bank:` CONTRACT TEST READS THE FIRST HIT, and which of a knot the bumper
  meets first is not something the staging picks. Give every body in the knot a
  build from the same weight band (`bodyWeight`: mid is 0.92–1.08 of
  `CROWD_MASS_MULTS`, so variants 2/4/8/13) or the shelf test fails on a coin
  toss.
- `make gallery` DOES NOT CLEAR `pwa/assets-preview/effects/`. Two runs at
  different `--strip` counts interleave their frames and nothing in the names
  says which is which. `rm -rf` it before every re-render.
