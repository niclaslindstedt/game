---
title: A new GROUND TILE owes `_family.yaml` two exemptions, or `make assets` warns on every build
date: 2026-08-09
scope: content/sprites/
concepts: [tiles, ground, lint, family]
---

A tile is the one sprite kind that fails both of the generator's automatic
checks by design: it has no silhouette to hold against the family ground (it IS
the family ground), and its texture is deliberately made of isolated single
pixels. So `contrastExempt` AND `speckleExempt` in the family's `_family.yaml`
both need the new name — the existing tiles in the list are the tell — or the
repo's zero-warning baseline breaks on the next `make assets`.

Two shortcuts that worked when adding `grass_charred_0/1` to `earth`: author the
grid on the SAME speckle layout as the tile it replaces (`grass_0`), which keeps
the density and the seamlessness you already know tiles, and keep the all-base
first/last row and column so the tiling is trivially clean. Judging it needs the
tiled strip, never the `@8x` — a single tile tells you nothing about the seam.
