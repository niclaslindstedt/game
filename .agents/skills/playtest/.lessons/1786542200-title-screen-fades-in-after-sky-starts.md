---
title: A title-screen screenshot taken as soon as `__skyState` exists is BLACK — the sky driver starts while the studio card is still up
date: 2026-08-12
scope: pwa/src/game/title-sky.ts, pwa/src/game/title-screen/, pwa/scripts/verify-sky.mjs
concepts: [playwright, screenshots, title-screen, splash, staging]
---

`page.waitForFunction(() => !!window.__skyState)` resolves the moment
`startTitleSky` runs, which is BEHIND the studio card and its fade — so the
first several seconds of screenshots come back near-black even though every
number the driver publishes is already correct. A filmstrip built that way
looks like the bodies are missing rather than like the page is not up yet, and
the natural next move (blame the geometry) is a dead end.

Wait a few seconds past `__skyState` before the first `page.screenshot()`, or
assert on a pixel rather than on the hook. The published geometry
(`__skyState.bodies`, `.earth`, `.moon`) is trustworthy immediately and needs no
wait at all — only the PICTURE does, which is the split worth remembering: read
numbers early, take pictures late.

Two more things about this harness, both of which cost time here. The `bodies`
map holds only bodies that are IN FRAME — `paint` returns before publishing when
a body is off the edge — so a sweep looking for a satellite must drive
`window.__skyZoom(z)` out to 0.05 to see Neptune's, and must report which ones
it never observed instead of quietly checking eighteen of twenty. And "is this
satellite near the right planet" cannot be answered by nearest-planet-on-screen:
at low zoom the drawn systems are wider than the gaps between the planets, so
Saturn's moons legitimately come closer to Jupiter than to Saturn. Measure the
separation from its OWN parent against its band radius instead.
