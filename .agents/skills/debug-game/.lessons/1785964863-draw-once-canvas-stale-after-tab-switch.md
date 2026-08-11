---
title: A visual artifact only a tab switch reproduces is a draw-once canvas
date: 2026-08-05
scope: pwa/src/game/render/
concepts: [canvas, stale-draw, tab-switch]
---

Symptom class: a DOM surface built from pixel canvases (the dialogue box, a
label, the map card) shows a slice of ITS OWN PREVIOUS content — "remnants of
old text along the bottom of each line" — and only after the player alt-tabs
away and back. Screenshots never show it: Playwright's `page.screenshot`
forces a fresh raster, which is exactly the repaint that hides the bug. Hours
went into DPR/rounding/wrapping theories before the reporter volunteered the
alt-tab step, which is the whole diagnosis.

Mechanism: every canvas in the app is redrawn per frame EXCEPT the ones React
draws in a layout effect keyed on props — those draw once and are then left
alone. A hidden page stops compositing, may hibernate or drop canvas backing
stores, and a draw that lands while it is hidden (a typewriter crawl on a
throttled timer) is never composited, so the tile can be re-rastered from the
snapshot taken when the page was backgrounded. Nothing in the app repaints it
afterwards, so the stale pixels are permanent until the props change.

Triage shortcut: ask what redraws the surface. "Only when its props change" +
"reproduces on a tab switch" is this class, no pixel forensics needed. The fix
is a repaint on wake — `onCanvasWake` (`@ui/lib/canvas-wake.ts`) — and the
paint it registers must draw from scratch, sizing included, because a restored
context comes back blank.
