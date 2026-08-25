---
title: Never mint a CanvasGradient per frame — draw a cached glowSprite under globalAlpha, or bake the gradient per radius and translate
date: 2026-08-25
scope: pwa/src/
concepts: [rendering, canvas, performance]
---

`createRadialGradient` + addColorStop allocates every frame it runs, and
three separate per-frame mints had accumulated on the rocket climb alone
(the burning house's glow, the storm's strike glow, the earth limb's haze).
For a soft radial light the answer already exists: `glowSprite(rgb, r)`
(`pwa/src/game/render/caches.ts`) bakes it once and a `globalAlpha` carries
the flicker; a destination rect stretches it into an ellipse, and a source
rect crops it (note its 256 px bake cap — stretch past it by destination).
For a gradient that genuinely moves, bake it ONCE centered at the origin,
key the cache on its radius, and place it with `ctx.translate` — a gradient
is positioned in user space, so the translate moves it for free.
