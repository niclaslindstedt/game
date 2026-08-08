---
title: Judge pixel alignment by MEASURING the canvases, never by looking at a screenshot
date: 2026-07-31
scope: pwa/src/game/
concepts: [alignment, measurement, verification]
---

The quest pick list's `!` sat visibly off the baseline of its row label. Two
rounds of eyeballing a screenshot and nudging CSS fixed nothing; measuring found
it in one pass.

The instrument is small: render the page, `getImageData` each canvas, scan the
alpha channel for the first and last lit rows, and print the ink bounds. That
gave identical 10 px ink heights and a **3.80 px** offset — i.e. a pure
translation, not a font-size or baseline problem, which pointed straight at the
cause: `PixelText` given a `maxWidth` top-aligns inside its box while a bare
canvas centres, and the row's `min-height: 1.6rem` was leaving exactly that much
slack. Fixed with `align-items: flex-start` on the row and its mark, and
dropping the `min-height`; re-measured at Δ 0.00 px.

Keep the measuring script out of the commit — it is an instrument, not a
deliverable — but reach for it the moment a spacing complaint survives one fix.
