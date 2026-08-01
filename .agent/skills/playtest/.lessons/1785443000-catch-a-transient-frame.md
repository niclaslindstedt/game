---
title: To judge a TRANSIENT moment, watch it from inside the page and freeze it — polling from Playwright misses it
date: 2026-08-01
---

`playtest.mjs` screenshots at fixed beats, which is fine for "does the HUD
fit" but useless for a rule that only shows in a passing frame (the hero
mirrored onto the pack while retreating, a proc's flash, one gib's arc).
Polling `page.evaluate` in a loop does NOT fix it: each round trip is tens of
ms, so a 2–3 frame moment slips between samples — a 150 s kite run caught the
pose zero times that way.

What works is a watcher INSIDE the page: `?debug` exposes `window.__game` and
`window.__timeScale`, so install a `requestAnimationFrame` loop that tests the
condition every frame, stashes the readings on `window.__caught`, and calls
`window.__timeScale(0.001)` to hold the sim on that frame. Playwright then just
`waitForFunction(() => window.__caught !== null)` and screenshots at leisure —
first try, with the numbers that prove the moment. Crop and nearest-upscale the
result (`sharp().extract().resize({kernel:'nearest'})`) before judging: the
harness viewport is 844×390 and a hero is 20 px across.

Driving the menus by hand (rather than through `playtest.mjs`) needs the
prelude skipped explicitly — a fresh run opens in `phase: "cutscene"` and
clicking the canvas does nothing; the button is `skip-cutscene`. Also launch
with `executablePath: "/opt/pw-browsers/chromium"` (as `playtest.mjs` does),
or Playwright hunts for a browser it never downloaded.
