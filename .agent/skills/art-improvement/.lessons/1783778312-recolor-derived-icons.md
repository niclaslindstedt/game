---
title: Recolor-derived icons — design in the SHIPPED color, keep the swap chars
date: 2026-07-11
---

Some item icons are `swapPalette(BASE_ICON, {...})` recolors, and the BASE
const is often never shown directly — only the recolor ships. Two traps:

- `icon_riot_taser = swapPalette(TASER_ICON, { h: "J", H: "j" })` and
  `icon_overclocked_laser = swapPalette(LASER_ICON, { b: "y" })`. When you
  redraw the base const you MUST keep the swapped chars (`h`/`H` for the
  taser body, `b` for the laser barrel) or the recolor breaks. Put the
  recolored region in those chars and everything else (arcs, LEDs, metal)
  in constant chars so it survives the swap.
- The `concepts` sheet renders the BASE colors, but the player only ever
  sees the recolor. Author in the base chars, then post-swap in the concept
  module (`rows.map(r => r.split("h").join("J")...)`) so you judge the
  SHIPPED look. Also note `b` in the icons palette is dark slate
  [63,69,83], not bright blue — run `art-audit.mjs palette <name>` before
  sketching so you don't assume a char is an energy glow when it isn't.
