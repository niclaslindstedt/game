---
title: A modal's title left-pins unless the box opts out of the blanket canvas rule
date: 2026-07-26
---

`styles.css` carries `.game-overlay canvas { align-self: flex-start }`. It exists
for a good reason — a `PixelText` canvas is a flex item, and without it flex
STRETCHES the canvas inside the left-aligned rows of the inventory and HUD — but
it applies to every canvas under every overlay, including the heading of a modal
whose box already says `align-items: center`.

The effect is invisible in code review and obvious in a screenshot: PAUSED, AUTO
PILOT, COIN STORE, LEAVE THE DEMO? and the respec's points-left line all sat
against the left rail while the buttons under them spanned the box. Individual
modals had been papering over it one at a time with per-component overrides
(`.map-box .map-header canvas`, `.autopilot-stat canvas`, `.coin-store-confirm >
canvas`), each rediscovering the same cause.

The fix belongs at the BOX level, next to the blanket rule:

```css
.intro-box > canvas,
.levelup-box > canvas,
.talent-header > canvas {
  align-self: center;
}
```

When a sweep adds a new modal box class, add it to that selector list. When a
title looks left-pinned, this is why — don't add another per-component override.
