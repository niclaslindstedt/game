---
title: A grid cell squared by `aspect-ratio` overflows its auto-sized row, so a scroll cap slices the last row open
date: 2026-09-07
scope: pwa/src/styles.css
concepts: [layout, grids, scroll, aspect-ratio, overflow]
---

`.inv-cell` is `aspect-ratio: 1 / 1`, so a cell in a fixed-width column renders
square. The grid's AUTO row, though, is sized from the cell's content — the icon
— not from the aspect ratio, so every cell overflows its own track by a few
pixels. Invisible until the grid is a scroll box with a `max-height`: the cap
then lands inside the bottom cell and the row reads as clipped rather than as
scrollable.

Two declarations fix it together, and either alone leaves it broken:

```css
grid-auto-rows: var(--cell);                        /* track == cell */
max-height: calc(var(--cell) * 3 + var(--gap) * 2); /* cap on a row boundary */
flex-shrink: 0;                                     /* the column above is flex */
```

Deriving the cap from the cell pitch instead of typing a round rem figure is
what keeps it landing between rows at the 2x tablet tiers, where every rem
doubles. The symptom to recognise: the grid's `getBoundingClientRect().height`
is a whole number of ROWS smaller than its own `scrollHeight`, and the measured
row pitch is less than cell + gap.
