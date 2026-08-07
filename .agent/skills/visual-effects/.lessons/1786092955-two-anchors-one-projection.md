---
title: TWO anchor conventions exist, and picking the wrong one is a 25% y error nothing catches
date: 2026-08-07
---

There are two ways to put a world point on this screen, and which is correct
depends entirely on whether the context already has `applyWorldProjection` on
it:

- **INSIDE the projected context** — every actor, the ground bands, anything in
  a `drawFrame`/`drawDrive` pass — a world point is a PLAIN CAMERA SUBTRACT:
  `seatX(x, camera.x)` / `seatY(y, camera.y)`. The context's own transform rakes
  it. A body that has to stand UP rather than lie down wraps that in
  `billboard(...)`, which un-projects around its own anchor.
- **OUTSIDE it** — `drawDriveFx`, anything drawn over the finished frame — the
  projection has to be applied by hand, which is what `bodyAnchorX` /
  `bodyAnchorY` are for.

Using the OUTSIDE anchor INSIDE the projection projects twice. At the shipped
camera (yaw 0, pitch 0.75) that is `y × 0.75` applied twice, so the error is
`0.25 × (worldY − cameraY)` — **28 world px near the bottom of a 195-px view**,
which is taller than the car. The drive's blood trail was laid correctly, drawn
with the wrong anchor, and came out looking like it poured off the ROOF of the
car instead of out from under the wheels.

Nothing catches it. It typechecks (both return a number), it is invisible in a
still of an empty road or a lone effect, and it only becomes obvious when the
mis-anchored thing is drawn beside the object that produced it. If you are
adding a draw to a pass, find out which side of `applyWorldProjection` you are
on before you pick an anchor — and if the thing lies on the FLOOR, draw it
inside the projection so it takes the rake, rather than outside where you would
have to fake it.
