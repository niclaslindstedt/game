---
title: Padding added to a scroll box for outline room is REAL space — cancel it with a negative margin
date: 2026-08-09
scope: pwa/src/styles.css
concepts: [layout, scroll, padding, alignment, grids]
---

`.shop-bag-grid` carried `padding: 3px` for an honest reason: the grid is its
own scroll box (`overflow-y: auto`), so a selected cell's outline (2px at a 1px
offset) on an edge row is shaved off at the clip. But padding is not free room —
it is layout. The result was a counter whose two grids disagreed about the panel:
the bag sat 3px lower under `YOUR BAG` than the stall sits under `FOR SALE`, and
3px further right. Small enough that three passes read it as "the headings have
different spacing" and went looking at the headings.

The fix is to take the padding back out of the layout, not to drop it:

```css
padding: 3px;
margin: -3px;
width: auto;   /* `.inv-grid` sets `width: 100%`; without this the box cannot
                  grow by the margins and the whole grid just shifts left */
```

Two things make this safe here and are worth checking before copying it: the 3px
overhang lands inside the panel's own `1rem 1.1rem` padding, so nothing leaves
the window and no horizontal scrollbar is earned; and the container is a plain
flex column (`align-items: stretch`), which is what lets `width: auto` resolve to
"container width plus my negative margins".

The tell: two grids in the same panel whose LEFT EDGES do not line up. Compare
the left edges before you compare the gaps — a heading-gap difference and a
left-edge shift by the same few pixels are one bug, and it is in the box below
the heading, never in the heading.
