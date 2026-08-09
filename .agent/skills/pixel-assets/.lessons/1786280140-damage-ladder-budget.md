---
title: A progressive DAMAGE LADDER must spend its darkness on the LAST rung, not the second
date: 2026-08-09
scope: content/sprites/scenes/, content/sprites/
concepts: [ladders, progression, palette, contrast, readability]
---

Drawing rung 2 of a three-rung damage ladder (whole → burnt → burnt twice →
gutted), the obvious move is to make it a lot worse than rung 1 — and that
spends the whole budget early. The first cut of `garage_house_burnt2` went so
dark that its small window, its garage-door panel and the holes in its roof all
collapsed into one black block, and rung 3 then had nowhere left to go.

Budget it the other way round: decide what the LAST rung looks like, then place
the middle rungs between it and the original. Rung 2 should still be a readable
building.

Two things that make the rungs read as the same object getting worse rather than
as three different sprites: keep the CHAR LAYOUT identical between rungs wherever
you can and let the palette carry the tone, and let the STRUCTURE carry the
damage (a hole eaten through the roof, a door gone to open dark, a window blown
through) — structure survives being seen at scene scale, where a two-shade
palette step does not.

And judge it in the SCENE, not on `<name>@8x.png`. A backdrop that fills the
preview is 48 px wide in a 224-px cutscene stage, and at that size a live soot
overlay is doing more of the darkening than the palette is
(`pwa/scripts/cutscene-preview.mjs`, then crop the region with sharp — the raw
844×390 shot is far too small to judge a 48×19 sprite in).
