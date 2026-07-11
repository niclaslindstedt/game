---
title: Compute grids in JS, don't hand-type ASCII, once a sprite has props or two frames
date: 2026-07-11
---

Every prop-heavy redraw of one pass (janitor's mop + bucket, the desk, the
vending machine, the hazmat rig) was faster and error-free built with
`put`/`box`/`hline` helpers over a base grid (see Phase 4) than typed by
hand — hand-aligning a mop handle or a keyboard into a fixed-width row is
where off-by-one bugs live. Build both walk frames from the one base and
print the joined rows to paste in; never retype the winning grid.
