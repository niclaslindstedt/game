---
title: A CSS transition is caught by watching computed style from inside the page, not by timing a screenshot
date: 2026-08-09
scope: pwa/src/game/drive-screen/
concepts: [playwright, screenshots, transient-fx, freeze, css]
---

Sibling to the transient-frame lesson, and the same fix in a different clothes.
A HUD that slides in over 420 ms cannot be screenshotted by `waitForTimeout` —
the drive's own clock starts when the title card is dismissed, which is after an
asset load whose length varies by seconds run to run, so a wait tuned on one
run lands before the opening on the next and after the slide on the one after.
Twenty guesses caught it zero times.

What works in one try: `page.evaluate` an rAF loop that reads
`getComputedStyle(el).opacity` every frame and stashes `{transform, opacity}` on
`window.__caught` the first time it is strictly between 0 and 1, then
`waitForFunction(() => window.__caught !== null)` and screenshot. The stashed
transform is also the PROOF — `matrix(1,0,0,1,-17.6,0)` says the slide is
coming from the left, which no screenshot can say on its own.

And do not hunt a sprite by colour-matching its pixels: scanning for the
beacon's `#4aa8ff` matched a blue SEDAN's paint and sent the pass cropping the
wrong car twice. Pick the frame by eye from a burst, or find the thing by a
colour the ART does not contain.
