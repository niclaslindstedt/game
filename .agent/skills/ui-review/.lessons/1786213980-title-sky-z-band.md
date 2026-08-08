---
title: A surface drawn OVER a modal is usually a wide z-band that was never wrapped — look for the stacking context, not for a number to raise
date: 2026-08-08
scope: pwa/src/styles.css, pwa/src/game/title-screen/
concepts: [z-index, stacking-context, modals, overlays, layer-bands]
---

The title screen's solar system paints its planets with an inline `z-index`
carrying each body's depth (`SUN_Z ± Z_SPREAD` in `title-sky.ts`, 150..850 —
wide on purpose, because two solid worlds a hair apart in depth must not round
onto the same integer). Unwrapped, those numbers competed with the app's own
bands in the same stacking context and beat every one of them: the SCREENSHOT
gallery, the trophy shelf, the LOST & FOUND and the arsenal all sit at 70, so a
planet drew straight over the picture being viewed.

**The fix is a wrapper, never a bigger number.** `.title-sky` is
`position: absolute; z-index: 0` — positioned AND banded, which is what makes a
stacking context — so the whole 150..850 becomes private and the sky flattens to
one band. Raising each overlay instead would have been wrong twice over: those
overlays are SHARED with the run, where the game shell's band map applies, and
the next surface added would reopen the leak.

Two things worth carrying:

- **Renumber in one order-preserving pass, and write the ladder down.** Once the
  sky was wrapped, `.title-plate` (13) and `.title-content` (950) no longer made
  sense against each other; every title band was re-laid as 0..5 with the map in
  a comment above `.title-sky` and pinned in `tests/overlay_layers_test.ts`.
  Chasing one number at a time is how the stale comments ("bodies z 1..9, the
  glare z 12") got there in the first place.
- **A screen-blended layer must stay OUT of the wrapper.** `mix-blend-mode` only
  reaches the backdrop of its own stacking context, so the sun's glare — which
  lights up the title screen's background gradient as much as the sky — had to
  stay a sibling of `.title-sky` rather than a child.

VERIFY IT AT THE PIXEL, not from the CSS. Staging the real stylesheet in
Playwright with a magenta stand-in planet and sampling the pixel under the
overlay caught it in seconds, and the same script run against the pre-fix DOM
shape is the negative control that proves the probe can see the bug at all.
