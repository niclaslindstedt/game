---
title: A frozen map with no UI after an update is a save-format drift
date: 2026-08-01
---

Symptom class: after applying a PWA update, CONTINUE resumes into a still
image of the map and hero with no HUD, no overlay, and no input — the game
"freezes and needs to be restarted".

Mechanism: every DOM surface in `GameScreen` is gated on the `hud` snapshot,
and `setHud` is the LAST statement of the render frame
(`pwa/src/game/game-screen/render-frame.ts`). If the thawed `saved-run.ts`
state makes any per-frame code throw (a required field added to
`GameState`/`Player`/`stats` without a `SAVE_VERSION` bump — e.g. v24's
`player.ammo`, read by `buildHud` → `ammoCount`), the loop's crash-resilience
(`game-loop.ts`) catches it, reports 3×, and keeps drawing — so the canvas
shows the frame that half-rendered, the HUD never publishes, and no UI ever
mounts. The loop surviving is correct for a bad frame mid-run; a failure
BEFORE the first complete frame is escalated to the ErrorBoundary instead
(see `firstFrameOk` in `GameScreen.tsx`).

Triage shortcut: with `?debug`, `recentLogs()` carries the throttled
`game loop render failed: …` entries — the stack names the missing field.
The shape-drift guard in `tests/saved_run_test.ts` pins the fresh-state key
lists to `SAVE_VERSION`; when adding a state field, that test failing is the
reminder to bump.
