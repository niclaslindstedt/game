---
title: A leaner/darker minion redraw can trip the 6px wound-visibility lint — budget for it
date: 2026-07-11
---

`make assets` warns `hurt overlay visibly changes only N px` when the
auto-generated wound doesn't move enough pixels. Minions get only the `hurt`
stage (2 tiny clusters), and the RNG (seeded by the sprite name) anchors
them at fixed spots, so a compact, dark, or sparse silhouette can land under
6 visible px. Fixes, in order: (1) a family `wounds` override with a splat
that contrasts the body (`{splat:"y",core:"Y"}` gold for steel/dark hosts);
(2) add a `scuff` (`{...,scuff:"H"}`) AND give it a STABLE lower-body row to
land on — legs that stride between frames are *not* candidates (only pixels
body-colored in BOTH frames count), so a fixed coat hem / boot band in the
lower third is what the scuff needs; (3) avoid isolated 1px limbs — a
cluster that anchors on a stub can't grow, so connect arms to the torso.
When color/scuff can't move enough pixels it is a *count* problem, not a
color one: give the base a contiguous multi-row body block (a 3-row deck
beats a wide 2-row one — clusters grow 2D, not just along a line). Iterate
fast with a throwaway probe that calls `woundedFrames(name, [f0,f1], style,
["hurt"])` + `woundVisibility(f0, hurt0, SPRITE_PALETTES[name+"_0"])` —
pass the REAL minion stage `["hurt"]` (not the boss set) or it lies.
