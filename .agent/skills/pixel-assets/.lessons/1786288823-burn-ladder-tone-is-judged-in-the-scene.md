---
title: A "burnt" middle rung reads as AUTUMN until you desaturate it — and only the scene shot tells you
date: 2026-08-09
scope: content/sprites/scenes/, content/sprites/earth/
concepts: [ladders, progression, palette, contrast, cutscenes, judging]
---

Building a three-rung burn ladder (in leaf → charred → bare), the middle rung's
first two palettes were warm browns (`#7a6234` / `#5a4526`). At 8x they look
scorched; in the cutscene beside a green tree they read as an autumn tree —
LIGHTER than the rung before them, which is the opposite of the story. What
fixed it was DESATURATING rather than darkening further (`#5c4c30` / `#42381f`):
a burnt thing is grey-brown, and the grey is what says "dead" while the value
step says "worse".

Two process notes that made the loop fast:

- `pwa/scripts/cutscene-preview.mjs --tags cleared:moon` shoots a scene at a
  LATER rung, so the whole ladder can be laid side by side from one dev server
  (`npx vite --port 5199` from `pwa/`). Judge the rungs against each other in
  the scene, never on `<name>@8x.png` one at a time.
- Spend the STRUCTURE on the last rung and the palette on the middle one: rung 2
  keeping the exact silhouette with three holes punched well INSIDE the rim (a
  hole at the rim severs pieces off and leaves 1px slivers), rung 3 dropping the
  crown entirely for bare boughs. That ordering also matches the existing
  `damage-ladder-budget` lesson.
