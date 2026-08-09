---
title: The drive minigame has no bot strategy — `?drive&bot=1` is its probe, and `&city=0` skips the opening
date: 2026-08-09
scope: pwa/src/game/drive-screen/, engine/game/drive/
concepts: [drive, playwright, probes, workbench]
---

`playtest.mjs` drives `?debug&bot=<strategy>`, which is the RUN's autopilot and
reaches the road not at all — a drive is not a `GameState`. The road's own probe
is the workbench deep link (`pwa/src/game/drive-screen/DriveWorkbench.tsx`):
`?drive&bot=1` hands the wheel to the engine's `createDriveDriver`,
`&difficulty=`/`&seed=` pin the rung and the stretch, and `&city=0` opens IN the
town so a pass about the traffic does not spend five seconds watching the
approach every run. Launch it with plain Playwright and
`executablePath: "/opt/pw-browsers/chromium"`.

To see something RARE on that road (a police chase is ~3.5% of lane marks), turn
its own knob in `DRIVE.drivers.chase` up for the shot and put it back — and turn
`paceMult` DOWN at the same time, or the thing you wanted to look at crosses the
frame in under a second.
