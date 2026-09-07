---
title: Size a panel's scroll box from the viewport minus its rem chrome — and check who else wears the class
date: 2026-09-07
scope: pwa/src/styles.css
concepts: [layout, scroll, css-cascade, modals, grids]
---

A fixed rem cap on the scroll box inside a modal (`max-height: 14.6rem`) is
wrong at both ends: it wastes most of a tall phone, and at the 2× UI-scale
tier it doubles while the viewport does not, so it pushes the foot rail off
the bottom. Size it against what the window is not already using instead —
every other row in the panel is rem, so their total is a constant:

```css
max-height: min(<ceiling>, max(<floor>, 94vh - <chrome>rem));
max-height: min(<ceiling>, max(<floor>, 94dvh - <chrome>rem));
```

The `dvh` line repeated after the `vh` one is the repo's pattern for it (an
Android browser showing its URL bar hands out a `vh` taller than the screen).
Measure `<chrome>` as `panel.scrollHeight - box.clientHeight` at 1×; it holds
at 2× and 3× because both halves are rem.

**Keep the FLOOR small.** A floor tall enough to always show a full grid is a
floor that pushes the footer off every screen too short to afford one — the
box has a scrollbar to give the height back, the foot rail has nowhere to go.

And before changing a cap on a shared class, grep who wears it. `.inv-bag-grid`
dresses the hero's bag AND both of the cache's grids, and two grids in one
window cannot each take the height a lone grid can — the landscape query had
to re-pin `.cache-grid` after the new rule to hold it where it was.
