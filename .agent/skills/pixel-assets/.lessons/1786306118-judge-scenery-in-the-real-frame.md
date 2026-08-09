---
title: Scenery is judged in the RUNNING GAME at the reference viewport — the @8x preview cannot tell you a piece is off the top of the frame
date: 2026-08-09
scope: scripts/asset-tools/, content/sprites/
concepts: [judging, screenshots, framing, drive, review]
---

Every piece of the drive's new home site passed its `@8x` preview and its own
contact sheet, and four of the six were invisible in play: the drive's camera
shows only ~25 world px above the far pavement at the reference 844x390
viewport, so a 40 px house at a 20 px setback was almost entirely above the
frame. The per-sprite preview cannot show this, and neither can a strip render
of the whole site — both draw a canvas sized to fit the art.

For anything that stands in the WORLD rather than on a character, add the real
frame to the loop: build, serve `pwa/dist`, and screenshot the actual scene at
844x390 (`?drive=home&city=0&course=1600&bot=1` reaches the drive's arrival in
about eleven seconds). `node scripts/town-viewer.mjs --site home --from A --to B`
is the fast intermediate check for LAYOUT, but it is not a substitute for the
camera.
