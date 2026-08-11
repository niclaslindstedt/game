---
title: Run `palette <family|sprite>` before you sketch — and mind the two colour formats
date: 2026-07-11
scope: scripts/art-audit.mjs
concepts: [palette, colour-formats, workflow]
---

`node scripts/art-audit.mjs palette <family|sprite>` prints the exact
char → colour map a redraw draws with (core plus family-local, the local ones
marked `*`), so you don't hand-read the family file to find which letter is
"steel" or "cyan". Run it before the first concept, not after the first
surprise — `b` is a dark slate, not a blue, and `B` is a brown.

The two places you then write colours want DIFFERENT formats, and mixing them
fails silently:

- a **scratch concept module** (`concepts <module.mjs>`) wants RGB arrays —
  `palette: { W: [244, 244, 244] }`. A YAML-style hex string there VALIDATES
  and renders nearly black, because the sheet builder spreads the string as if
  it were an RGB tuple.
- a **sprite YAML** wants hex strings — `W: "#f4f4f4"`, each with a `# name`
  comment, since `sprite-author.mjs verify` reads those names as part of the
  acceptance target.

A sprite YAML's palette is free-form hex, not restricted to the family map, so
a redraw may introduce a new shade (a navy shadow between the outline and the
uniform, say). Keep it a step on an existing ramp and name it in the comment;
declare the same colour in the scratch module as an RGB array while iterating.
