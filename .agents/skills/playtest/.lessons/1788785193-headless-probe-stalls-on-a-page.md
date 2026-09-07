---
title: A hand-rolled headless engine probe stalls on a PHASE, not on a crash — turn the page each tick, and top the hero up, or it reports a plateau that is really a stuck run
date: 2026-09-07
scope: scripts/, engine/sim/
concepts: [probes, false-green, staging, measurement, headless]
---

Driving `createGame` + `step` + `botAct` straight from a script — instead of
through `scripts/simulate-run.mjs` — silently produces a run that is not
playing. Two things stop it, and both look like a real measurement:

- **A PAGE.** `state.phase` lands on `dialogue` / `cutscene` / `intro` and
  nothing turns it, so the world never ticks. A "10 minutes simulated, 1% of
  the map explored" line is a run that stood still. Call `advanceDialogue`,
  `skipCutscene` or `dismissIntro` on the matching phase EVERY tick, not once
  at the start — a giver, a story find or a quest you staged raises a new one
  mid-run.
- **DEATH.** On a late venue a level-1 hero is in `dying`/`defeat` inside two
  minutes and every later reading is the same frozen number. `simulate-run.mjs`
  is immortal by default for exactly this reason; a hand-rolled probe has to
  top `hp` up itself, and must do it BEFORE the step that would kill him.

Three mechanics worth not rediscovering: the loader is
`register("./scripts/game-alias-loader.mjs", import.meta.url)` followed by a
DYNAMIC `await import("./engine/index.ts")` — a static `@game/core` import
resolves before the hook is installed and dies with ERR_MODULE_NOT_FOUND; the
script must live inside the repo, not in a scratch directory; and `botAct` takes
`(bot, state, hero)` with the bot from `createBot(strategy)`, not `(state,
strategy)`.

If the probe needs a healthy run more than it needs custom instrumentation,
reach for `simulate-run.mjs` first — it already solves all of this.
