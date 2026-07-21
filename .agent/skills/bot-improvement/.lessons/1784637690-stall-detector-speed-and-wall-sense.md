---
title: The unstuck stall detector must be speed-aware, and a wall is traced by asking where it visibly ends
date: 2026-07-21
---

Two findings from the "bot ignores the guidance arrow and oscillates at a
wall" fix:

- **A flat displacement bar in the stall detector reads every slow hero as
  wedged.** `UNSTUCK_MIN_DISP` (34px per 400ms window ≈ 85px/s) sat far above
  a fresh rookie's `PLAYER.speed` 56px/s — so on a quiet path-level march the
  bot alternated ~2.4s of travel with ~3s of UNSTICK forever, the escape
  sweep constantly overriding the (perfectly healthy) travel plan. Fights
  masked it on wave maps (`hasReachableFoe` resets the timer), which is why
  the stuck audit never surfaced it. Judge "frozen" against the hero's OWN
  pace (`playerSpeed(state) × window × UNSTUCK_SPEED_FRAC`, capped at the
  old flat bar): a genuine pin only jitters a few px per window, while even
  the deliberate half-pace recovery walk clears a 0.3 fraction. Any test that
  drives a fresh bot and asserts a macro thought label will catch a
  regression here — UNSTICK shows up instead of the expected label.

- **The oscillation cure is a committed wall-end query, not a better fan.**
  The memoryless per-tick deflection fan (`navTarget`) can flip between ±0.6
  rad on successive ticks — the visible up-down jitter at a long wall. The
  fix that reads like a human: ask the engine "where does this obstacle
  visibly end?" (`visibleObstacleEnd` in obstacles.ts — rotate bearings off
  the blocked one, first body-width-open sweep per side wins, sight capped at
  `wallSightPx` ≈ the phone half-screen) and LATCH the chosen side on the bot
  (`bot.trace`) while the straight sweep stays blocked, passing it back as
  `preferSide` so the trace never flips ends mid-wall. Clear the latch the
  moment a straight sweep runs clear.

- Test staging gotchas: `bot.waypoint` (the GPS nudge) is CONSUMED at
  `WAYPOINT_REACH` (120px) — a drive-until-arrived test must use ≥ that
  radius or the pin clears and the macro plan wanders off before the test's
  tighter "done" fires. And only `test_path_level` (fixtures) authors a
  `path`, so guidance-arrow / navTarget / unstuck behavior is invisible on
  the reference `test_level`.
