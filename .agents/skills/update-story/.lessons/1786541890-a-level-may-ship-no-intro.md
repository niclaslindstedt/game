---
title: A venue may ship NO opening monologue — `LevelDef.intro` is optional, and the phase must be re-settled onto the title card in TWO places
date: 2026-08-12
scope: content/levels/, engine/game/opening.ts, engine/game/create.ts, engine/game/story.ts
concepts: [intro, level-def, phases, hub]
---

Removing a level's `intro:` is not one edit. The phase a run opens in is
decided from the level, and a run left in `phase: "intro"` with no pages shows
an empty dialogue box.

`engine/game/opening.ts` is the leaf that owns both questions — `introPages`
(the level's own monologue, `?? []`) and `openingPhase` (`intro` when there is
a page to turn, `title` when there is not). It is a LEAF rather than living
beside the pager in `items/flow.ts` because `story.ts` has to ask the same
question and `flow.ts` already imports `story.ts`; answering it there is a
cycle.

**Two callers, and missing either is a soft-lock:**

- `create.ts`, at the very END of `createGame` — the answer is read off the
  CARVE (`runLevelDef`), which the state literal at the top does not have yet.
- `story.ts` `advanceCutsceneChain` — a PRELUDE hands the stage over when it
  drains, and the garage is reached exactly that way.

The level schema (`scripts/asset-tools/level-schema.mjs`) drops `intro` from
`REQUIRED_FIELDS` but refuses `intro: []` — present-and-empty reads as a
monologue somebody meant to write, and lands the player where omitting it
does.

Two tests bite that a `make test` catches late: `tests/content/goodco_test.ts`
asserts every level has an intro, and `tests/typewriter_test.ts` sweeps
`def.intro` across the whole catalog.
