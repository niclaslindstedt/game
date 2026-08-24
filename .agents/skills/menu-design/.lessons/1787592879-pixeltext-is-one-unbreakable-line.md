---
title: A PixelText canvas is ONE unbreakable line — anything that must wrap is split into several canvases, and the JS width budget has to mirror the CSS one
date: 2026-08-24
scope: pwa/src/game/title-screen/, pwa/src/lib/PixelText.tsx
concepts: [layout, overflow, pixel-font, heading, breadcrumb]
---

`PixelText` renders its string into a canvas sized to the string. CSS cannot
break that canvas, so a long drawn line does not wrap — it overflows, and on a
centred block it runs off BOTH edges. `maxWidth` (a rem cap) is the only
built-in wrap and it only helps where one canvas may become a paragraph.

Where the pieces must stay separately styled or measured — the page header's
breadcrumb, whose crumbs sit at a different scale and colour from the title —
the fix is to draw ONE CANVAS PER PIECE in a `flex-wrap: wrap` line. Two things
make that work and both are easy to miss:

- **Give the flex line a `max-width`.** A content-sized grid/flex parent lets an
  unbounded line grow past the viewport instead of breaking, so nothing wraps
  and the change looks like a no-op.
- **The JS budget and the CSS one must be the same number.** `heading-fit.ts`
  fits the title against `viewportWidth * WIDTH_SHARE` while the browser wraps
  against `.menu-heading-line`'s `max-width: 84vw`; the fit predicts the layout
  the browser is about to perform (`crumbTail` walks the crumbs the way
  `flex-wrap` does), so the two drifting apart makes the fit wrong rather than
  merely conservative. Mirror the flex `gap` too.

Judge it from a screenshot at the SMALL-PHONE floor (375x667) and the portrait
phone, not from the landscape reference — a header wide enough to overrun fits
on one line at 844 and the bug is invisible there.
