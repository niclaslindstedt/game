---
title: A menu row's icon is rendered MONOCHROME, so its palette is a lightness ladder and nothing else
date: 2026-08-10
scope: content/sprites/icons/
concepts: [icons, palette, contrast, readability, menus]
---

`MenuList.tsx` draws every row icon through `spriteMonoUrl` (`pwa/src/game/assets.ts`
→ `monochromeDataUrl` in `pwa/src/lib/atlas.ts`): each pixel keeps its Rec. 601
luma and takes the ROW's colour — grey until the row is selected. So on an
`icon_menu_*`-class sprite the hue you author is thrown away and only two things
survive: the silhouette, and the lightness steps inside it. Author the palette as
a ramp you can tell apart by brightness alone, and stop picking colours for
meaning (a green sprout and a red flame come out identical).

Two consequences worth knowing before drawing:

- The dark outline is NOT lost — the transform floors at `0.22 + 0.78·luma^0.75`,
  so `#1a1c2c` still renders at ~37% of the row colour and reads as a rim against
  the near-black menu. Outline as usual.
- A highlight one step off the body (e.g. `#f2f4fa` over `#c8cedd`) vanishes at
  the 1.6rem the icon is drawn at. Interior structure needs a REAL gap in
  lightness — the shaft of a feather drawn a shade lighter than its vane
  disappeared three iterations running; drawn in the outline colour it read.

Icons are also touch-only (`@media (any-pointer: fine)` hides them), so a
Playwright capture must set `hasTouch: true` or the whole column is blank.
