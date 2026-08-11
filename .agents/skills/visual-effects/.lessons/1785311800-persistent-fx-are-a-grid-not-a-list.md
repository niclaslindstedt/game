---
title: A PERSISTENT effect is a grid, not a list — and its top rung will draw rectangles
date: 2026-07-29
scope: pwa/src/game/render/
concepts: [persistent-fx, grid, blood-floor]
---

Transient FX are a list of `Effect`s and that is right — they expire. An effect
that must STAY (blood on the floor, scorch marks, frost, oil) is a different
animal: a list of them grows with every event that spawns one, so the draw cost
of a floor grows with how long the fight ran, and keeping it affordable forces
you into eviction — throwing away marks the player can still see.

**Model persistent ground FX as a `Uint8Array` of intensity over the level's TILE
grid instead.** One byte per 16 px cell is 28 KB for the biggest map in this
game — the whole map, permanently, nothing evicted. Painting is `+=` over an
ellipse of tiles; drawing is one blit per non-zero tile the VIEW covers, so the
cost is bounded by the screen and a floor with forty thousand hits on it draws
exactly as fast as one with forty. `render/blood-ground.ts` is the worked
example; `tileHash` (`render/ground-tiles.ts`) is already there to pick a variant
and a mirror per cell, which is what stops eight sprites reading as eight
sprites.

Two traps found the hard way, both visible only in a screenshot:

1. **The top rung of the ladder is opaque edge to edge, and ONE of those on its
   own is a red SQUARE.** It is the single ugliest thing a tile system can draw
   and it appeared the moment a lone cell took a big hit. Fix: cap a tile's drawn
   rung at ONE ABOVE the weakest of its four neighbours, so the solid rung can
   only ever appear INSIDE a mess and the rim stays on the ragged rungs. The same
   min-of-neighbours number then drives the interior "wash" that fills the middle
   in — but scale that by the tile's OWN intensity too, or a barely-marked cell
   surrounded by a massacre jumps to solid and puts a hard square edge in the
   middle of an otherwise ragged patch.
2. **Draw NOTHING below a real threshold.** The outermost reach of a spray barely
   wets what it touches; drawing those tiles lays an even pale haze over
   everything within throwing distance, which reads as a rash rather than as
   spatter. A floor on the first rung is a floor with no shape. Set the first
   rung's entry well above zero and the mess keeps an outline.

Judge all of this on a CROP of a real playtest/gallery frame at the phone
viewport — the tiling preview sheet showed no seams and still hid both bugs,
because neither is about the art.

## Follow-up: what actually removed the squares

The two rules above (a rung cap on the orthogonal neighbours, plus a real
threshold under the first rung) were NOT enough, and the bug shipped. Three more
things were needed, and each fixes a distinct way a tiled overlay comes out
looking stamped:

- **The orthogonal cap only saves a LONE cell.** Land a few kills together and
  every cell in the blob has heavy neighbours, so they all clear the cap at once
  and the blob draws solid — the exact rectangle the cap was meant to prevent.
  The near-opaque top rung has to be gated on all EIGHT neighbours, so a mess
  must be 3×3 before one cell in the middle fills in and every rim cell stays on
  the holed rung below.
- **Draw the art CENTRED ON the cell and oversized, never INTO the cell rect.**
  Heavy rungs authored at 24 px over a 16 px grid, plus a ±3 px per-cell nudge,
  make neighbours overlap: the boundary of a mess becomes the ragged union of a
  dozen blobs instead of the outline of the cells that happen to be stained. A
  straight edge in a tiled overlay is just a run of cells that agreed on where to
  stop — three pixels of disagreement is enough that they never do.
- **The rim needs AUTHORED EDGE ART, not a lower alpha.** The edge of a pool is
  not a fainter pool; it is a scalloped lip with droplets frayed off it. One
  sprite fading toward +X and one toward +Y cover all four directions through the
  flip cache. **Its interior must be transparent** — a fringe with a solid inner
  half is a half-plane, so a cell that fringes on all four sides unions them into
  a filled square, which is the very artifact it was added to remove.

Each of these was invisible in a tiling preview sheet and obvious in a 3× crop of
a real frame. Crop the frame.
