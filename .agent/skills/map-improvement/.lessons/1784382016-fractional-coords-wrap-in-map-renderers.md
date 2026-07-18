---
title: Map renderers must ROUND world→screen coords — fractional y silently wraps labels/markers
date: 2026-07-18
---

The asset toolkit's `setPixel` (`website/scripts/asset-tools/surface.mjs`) writes
by a raw `(y * width + x) * 4` index with **no flooring**. When a caller passes a
**fractional y** (e.g. `y = 820.5`), the `0.5 * width` term lands on an integer
index but shifts the effective x by `width/2` — so the pixel WRAPS to the wrong
place. `blit` (and thus every text label) and `fillCircle` (marker centres) hit
this whenever their coordinate came from a `wx/wy` world→screen transform like
`c.ox + x * c.S` (fractional because `S` is fractional).

**Symptom:** labels render at the wrong x — often piled at the map's left edge, or
(in `map-preview.mjs`) leaving bare dark label *plates* with no text on them
(the `fillRect` plate floors via its integer loop, so it's placed right; the
`blit`-ed text wraps away). It looks like a data/label-swap bug but the data is
fine.

**Fix:** round in the transform so nothing fractional ever reaches a primitive:

```js
const wx = (c, x) => Math.round(c.ox + x * c.S);
const wy = (c, y) => Math.round(c.oy + y * c.S);
```

Both `map-layout.mjs` and `map-preview.mjs` now do this. If you write a new
top-down renderer, round `wx/wy` from the start. Debugging tip: don't trust the
downscaled preview — scan the raw PNG for a marker colour, or colour-code the two
suspect labels (pure red / pure green) and find each colour's pixel bbox; that
pins the real position without eyeballing.
