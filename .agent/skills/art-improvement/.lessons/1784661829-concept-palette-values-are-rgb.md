---
title: Scratch concept palettes use RGB arrays, not YAML hex strings
date: 2026-07-21
---

`art-audit.mjs concepts` expects a scratch module's `palette` values as RGB
arrays such as `W: [244, 244, 244]`; sprite YAML palettes use hex strings such
as `W: "#f4f4f4"`. Supplying YAML-style hex strings to the concept module can
validate yet render nearly black because the sheet builder spreads the string
as if it were an RGB tuple. Use `art-audit.mjs palette <sprite>` before drawing
and translate the printed colors into RGB arrays in the scratch module.
