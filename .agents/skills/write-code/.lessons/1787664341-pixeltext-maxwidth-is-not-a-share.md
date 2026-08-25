---
title: A fixed `PixelText.maxWidth` is a share of the ROOT FONT, not of the screen — measure it
date: 2026-08-25
scope: pwa/src/
concepts: [layout, overflow, pixel-font, rem, ui-scale]
---

`PixelText` wraps against `maxWidth` rem and then sizes its canvas in rem, so
the block's real width is `maxWidth × the live root font size`. `styles.css`
bumps that root to 200% past 700 px and 300% past 1200, and the viewport does
NOT follow — so a caption authored at a comfortable 26 rem runs off both edges
of the very screens the bump was for, and off a narrow portrait phone before
any bump at all (26 rem is 416 px on a 390 px screen).

Use `usePixelWrapRem(share, max)` (`@ui/lib/pixel-wrap.ts`): a share of the live
`window.innerWidth` divided by the measured root font size, capped at `max`.
Reading `getComputedStyle(document.documentElement).fontSize` is the CSS itself
rather than a copy of its breakpoints, so it cannot drift the way a mirrored
`uiScaleFor` table can.

Give the container the SAME share in CSS (`width: 84vw; max-width: 26rem`), so a
line the font cannot break is clipped by the box rather than by the screen.
