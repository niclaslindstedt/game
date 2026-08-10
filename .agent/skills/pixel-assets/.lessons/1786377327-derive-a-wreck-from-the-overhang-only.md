---
title: A "crashed" variant of a vehicle is a WARP of its clean grid, and the squeeze must stop at the axle
date: 2026-08-10
scope: content/sprites/earth/, scripts/asset-tools/
concepts: [generated-art, derived-sprites, vehicles, silhouette, review-loop]
---

Drawing 32 crash grids by hand is not the job; deforming each clean grid is. But
which SPAN you compress decides whether you get a folded car or a pile of
debris, and three cuts were wrong before one was right:

- **The squeeze must cover the OVERHANG ONLY** — the bodywork outboard of the
  struck wheel — with the arch and everything inboard of it left exactly where
  it is. A span that CONTAINS the wheel smears the tyre's own pixels through
  the fold and no cleanup afterwards gets a car back out of it.
- **Walk the SOURCE columns, not the destination.** Sampling back from each
  destination skips source columns wherever the squeeze is tightest, and every
  skipped one is a full-height hole that cuts the wreck into two floating
  pieces. Walking the source lands every column somewhere, which is what a
  concertina IS.
- **Where two columns land on one pixel, FIRST wins, not darkest.** Darkest-wins
  reads beautifully for one crease and catastrophically for a pile: every folded
  column contributes its own shut line and the ink stacks into a solid black bar
  straight through the car.
- **The vertical shift has to be CONTINUOUS down the body.** Lifting the deck
  and sinking the sill as two separate moves tears each column in half at the
  step, and the tip arrives as loose strands.

Three cheap post-passes then do most of the visible work: sweep connected
components under ~14 px (a shear carries a roofline into columns the body no
longer reaches, and the leftovers read as a rendering fault, not as debris);
de-duplicate the body's single `s` highlight row where the shear stepped it
(two rows of near-white across a folded bonnet reads as a flare of light); and
run the orphan sweep AGAIN after the outline pass, because the outline creates
its own strays.

And an emptied wheel arch needs a RIM: cleared to nothing it reads as a hole
punched in the car, worst on the heavies whose tyres are six rows deep — the box
truck's cab came out as an empty blue frame. Ink every body pixel the void now
touches. The hub left in it must be COMPACT (3 px across, 4 down, on the road);
hung off the arch on a one-px stem it reads as a lollipop — a dark bar with a
bright dot, which at this size is a leg rather than a brake drum.

Finally: the generator copies the base sprite's header when it writes a variant,
which leaves a wreck carrying an intact car's `description`/`subject`. That is
the ACCEPTANCE TARGET and it outranks the grid, so a stale one is worse than
none — rewrite it per variant in the same pass.
