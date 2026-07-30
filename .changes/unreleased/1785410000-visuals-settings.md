---
type: Added
title: SETTINGS → VISUALS — bloom, a colour grade, a vignette and depth haze
---

A new VISUALS page beside DISPLAY, with four knobs for how the field is
presented. Each is a drag track from OFF, through the look the game ships with,
and on past it; a RESET ALL row puts them all back.

- **BLOOM** — bright things bleed light past their own edges, so a legendary's
  light shaft, a muzzle flash and the level-up pillar read as light rather than
  as decals.
- **COLOR GRADE** — a little more contrast and colour in the whole picture.
- **VIGNETTE** — the corners fall away into the dark, which also puts the light
  where the player is already looking: the hero is always centre-screen.
- **DEPTH HAZE** — the floor fading as it rakes off toward the horizon, and the
  honest version of a distance blur (there is one ground plane and no depth to
  focus on, so a real blur would hide the horde standing beside you). It comes in
  as the camera leans over and is gone entirely looking straight down.

Every one costs frames, which is why they are their own page and why each has a
true OFF that does no work at all.

Also: a wall panel's edges no longer stair-step under a turned camera. Anything
baked through the projection is now rendered at 3× and averaged down, so the
diagonals the projection itself creates come out antialiased while the art's own
pixels stay exactly as drawn.
