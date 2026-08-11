---
title: A smoke puff drawn with `glowSprite` is invisible — matter needs a PLATEAU disc, light needs the ramp
date: 2026-08-09
scope: pwa/src/game/render/
concepts: [smoke, additive-glow, alpha, particles]
---

The launch cutscene's pad cloud was first built out of `glowSprite` discs
(`render/caches.ts`) — the same baked radial every fire and aura in the game
uses — and rendered as a faint smear of haze over the night sky rather than as a
cloud. Twenty-six of them, at 0.8 alpha, and you could barely tell they were
there.

The reason is what a glow's gradient IS: full alpha at the centre, zero at the
rim, which is correct for LIGHT (a glow has no edge) and averages to almost
nothing over its own disc. Smoke is MATTER: opaque nearly all the way out and
then it stops. The fix was a second baked disc with a PLATEAU — `rgba(c,1)` at
0, `rgba(c,0.94)` at 0.62, `rgba(c,0)` at 1 — after which the same count and the
same alpha read as bodies that overlap.

Two things followed from the same insight and both mattered as much as the
gradient: a billow needs a SECOND smaller lighter disc set up and inboard of it
(a cloud is read off where its light catches, and a flat disc has nowhere for
that to be), and a night launch cloud is far LIGHTER than intuition says —
mid-grey `#8e8888a` territory near the fire, not the charcoal you would pick for
smoke off a bonfire, because it is steam and dust lit from inside.
