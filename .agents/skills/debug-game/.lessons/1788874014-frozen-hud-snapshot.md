---
title: A still picture with (almost) no UI is a FROZEN HUD SNAPSHOT — the render frame is throwing, and what is still on screen names the phase it froze in
date: 2026-08-01
scope: pwa/src/game/game-screen/
concepts: [save-format, migration, freeze, screenshots, hud-snapshot, symptom-far-from-cause]
---

Symptom class: the field is drawn but dead — no HUD, no dock, no pause menu,
no input. Reported as "it crashed" / "it didn't load", usually with a phone
screenshot and nothing else.

Mechanism: every DOM surface in `GameScreen` is gated on the `hud` snapshot,
and `setHud` is the LAST statement of the render frame (`render-frame.ts`). A
throw anywhere earlier is caught by the loop's crash-resilience
(`game-loop.ts`), which keeps drawing — so the canvas holds a half-rendered
frame and React holds whatever the last COMPLETE frame published. Two ways in:

- **It never got going** — a thawed `saved-run.ts` state this build cannot
  read (a required `GameState`/`Player`/`stats` field added without a
  `SAVE_VERSION` bump). `tests/saved_run_test.ts` pins the fresh-state key
  lists to `SAVE_VERSION`; that test failing is the reminder to bump.
- **It stopped mid-run** — a draw that starts faulting an hour in. Since the
  half had completed, `run-health.ts` used to leave it alone; it now gives up
  after `DEAD_STREAK` frames with no completed one.

**Read the screenshot for WHICH surfaces survived** — it dates the frozen
snapshot precisely, which is otherwise unrecoverable from a bug report. Match
the leftover element against the stylesheet rather than guessing: a lone hero
bust at the top-left is `.dialogue-hud` (`SceneOverlays` mounts it over an
enemy ARRIVAL scene) and not the HUD's own `.hud-portrait-unit`, which would
carry its frame plate and vitals bars beside it. So the snapshot froze during
a dialogue while the live state had already moved on — the overlay reads live
state and drew nothing.

Triage: with `?debug`, `recentLogs()` carries the throttled
`game loop render failed: …` entries and the stack names the fault.
