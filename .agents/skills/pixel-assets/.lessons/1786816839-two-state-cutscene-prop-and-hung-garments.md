---
title: A cutscene prop that CHANGES is two whole sprites on one mark — and a hung garment only reads if its shoulder row is unbroken
date: 2026-08-15
scope: content/sprites/, content/cutscenes/
concepts: [cutscenes, props, two-state-props, sorting, garments, silhouette]
---

**Never split a changing prop into a base plus a detachable piece.** Drawing a
coat stand and hanging a separate jacket sprite on it looks like the flexible
option and cannot work: a cutscene prop's `at.y` is both its mark and the
painter's sort key, so a jacket that must draw IN FRONT of its post needs a
larger `y` than the post — which also moves it down the wall. Author both states
as complete sprites on the identical `at`, one `hidden: true`, and swap them
with a `prop` pair. The prelude's front door was already built this way; follow
it rather than rediscovering the constraint.

**A garment hung at 12–14 px wide reads as a bulb until the shoulders are one
unbroken row.** First pass ran the sleeve seam (an outline column each side of
the torso) the full height including the shoulder line, and the sleeves came out
as two red bars floating beside a red capsule. Make the shoulder row solid
across the full width and start the seams on the row BELOW it; the silhouette
snaps to "coat on a hanger" with no other change.

Two supporting calls from the same pass:

- **A 1 px highlight on an 8 px-wide body is not a detail, it is a stripe.** A
  zip at `#c9c9d4` split the jacket like a jersey; `#8f8fa0` reads as a placket.
  Judge any 1 px accent against the fill's width, not at @8x alone.
- **An open jacket on a 16 px figure is a full-height column of the under-layer,
  not a chest patch.** Two pixels wide from collar to hem reads as "worn open"; a
  2×2 square in the middle reads as a logo.

Judge all of it in the scene — `node pwa/scripts/cutscene-preview.mjs --id <id>`
over a running dev server — never only on the @8x preview.
