---
title: `startPlayerThought` freezes the run, so a line raised mid-countdown silently stalls the beat it was meant to decorate
date: 2026-08-15
scope: engine/game/
concepts: [dialogue, thoughts, phases, victory, false-green]
---

`startPlayerThought` (`engine/game/story.ts`) sets `state.phase = "dialogue"`,
and `step()` advances nothing but `playing` — so a line raised from a passage
that is counting something down stops that clock until the player taps through.

Raising `LevelDef.exitByCar.thought` when the victory countdown ARMS (rather
than at its end) looked free and was not: the `dialogue` phase held the loot
window open forever, the `victory` event never fired, and the failure presented
as an unrelated test asserting "the clear still banks" going red. Nothing warns
about it, because both halves are correct on their own.

Three ways out, and which one is right is a design question rather than a
mechanical one:

- **`floatPlayerThought`** — the same def spoken over the hero's head with the
  run carrying on. ONE page only, so it is right for a bark and wrong for a
  paragraph; it is read out of the corner of the eye by somebody doing
  something else.
- **A phase that HANDS OVER** — `outro` pages, or a `farewell` cutscene chain
  with `cutsceneThen`. These exist precisely because "say this, then raise the
  splash" needs somewhere to land; a bare dialogue always returns to `playing`.
- **Move WHEN the line is raised** to a moment the freeze is wanted. A line
  raised as the player presses a button is read over the picture they are
  leaving, and it stalls a beat that has not started yet — which is free.

The tell in a test: a countdown-driven event that never fires while
`state.dialogue` is non-null. Assert the phase, not just the outcome.
