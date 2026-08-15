---
title: Author a SET of props with a throwaway grid composer, never by typing rows — and mind the orphan-pixel lint
date: 2026-08-15
scope: content/sprites/
concepts: [authoring, generators, lint, cutscenes]
---

Hand-typing a `grid:` is fine for one 10×14 prop and a liability for nine of
them: every row has to be exactly `size[0]` characters, and a miscount surfaces
as a generator error with no clue which row. A ~30-line scratch composer with
`put/hline/vline/rect/outline/box` helpers — the same shape
`scripts/asset-tools/homestead.mjs` uses for real — makes the rows correct by
construction, lets you place features by coordinate against the scene's own
layout numbers, and makes a revision one edited call instead of a re-typed
block. Have it write the whole YAML (front matter, palette, grid) so nothing is
transcribed by hand. Delete it once the art is settled; it is scaffolding, not
tooling.

Two things it does not save you from, both worth knowing up front:

- **`make assets` warns on ORPHAN PIXELS** (`! flowers: orphan pixel(s) at
  (6,4 "N")`), and diagonal-only connections count as orphans. A stem or a wire
  drawn as a diagonal staircase must be an unbroken ORTHOGONAL run into whatever
  it joins.
- **Judge the art in the SCENE, never on `<name>@8x.png`.** The per-sprite
  preview says a piece is legible; only the contact sheet
  (`node pwa/scripts/cutscene-preview.mjs --id <scene>`) says whether it fights
  the thing the shot is about, and that is what gets a prop moved or cut.
