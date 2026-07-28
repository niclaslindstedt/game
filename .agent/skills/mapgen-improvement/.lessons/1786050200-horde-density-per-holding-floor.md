---
title: Price the horde per million px² of HOLDING floor, not per cell
date: 2026-07-28
---

"One knot per chamber" reads like a placement rule and behaves like a fixed count:
the carve grows its cells with the map, so each knot covered 2–3× the floor an
authored map's spawn point covers, and LARGE was worse than MEDIUM. The measured
gap was stark — 0.8–1.2 knots per million px² against the hand-authored campaign's
1.6–3.8, with the queued horde thinned to match (33–55 mobs/Mpx² against 48–73).
It played exactly as it measured: an elite, a boss, and a lot of walking.

Two things to get right when converting a per-cell count into a density:

1. **Spread the allowance over the floor that may HOLD it, not over the map.** A
   third of a carve is quiet by design (boss cell, cache cul-de-sacs, the trader's
   pitch). Pricing per cell hands that third back as emptiness: a nominal 1.7
   measured 1.0 on medium. `density = KNOT_DENSITY × mapFloor / hordeFloor` puts
   the map's whole allowance in the cells that can take it.
2. **Anything else keyed to depth needs the same rescale.** The ramp ladder and
   the breed windows are read off normalized depth, and the DEEPEST cells are
   precisely the quiet ones — so the top rungs were unreachable and the generated
   horde ran a couple of levels below the authored one. Normalize depth over the
   knot-bearing cells' own span.

Check it with a per-map table (knots/Mpx² and mobs/Mpx², authored beside each of
the three carve sizes) — the "vibe" of a render will not show a factor of two.
