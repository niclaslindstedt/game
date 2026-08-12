---
title: The library has THREE gates on a level, and a new LevelDef field trips them in three different ways
date: 2026-08-01
scope: engine/game/defs/levels/types.ts, content/levels/, pwa/scripts/library/
concepts: [thoughts, triggers, publishing, level-def, coverage, silent-failure, bestiary]
---

**The FIELD gate is loud.** `pwa/scripts/library/model-missions.mjs` keeps
`LEVEL_FIELDS` and `assertLevelFieldsCovered` THROWS on any key it does not
know, so `tests/content/library_test.ts` goes red the moment a new `LevelDef`
field lands on a shipped level. It wants two edits: a row in `LEVEL_FIELDS`
saying which part of the page renders it, AND an actual read in the mission
model plus a sentence in `prose-missions.mjs`. Declaring without rendering
satisfies the throw and publishes nothing.

**The TRIGGER gate is silent.** `model-story.mjs` `thoughtsOn()` builds a
chapter's beats from a hardcoded list of trigger sources — `openingStrike`,
`firstSightThoughts`, `firstKillThoughts`, `travelDoors[].unready`,
`placeThoughts`, `exitByCar`, `martyrs.thought` — so a beat fired by anything
else is authored, shipped, playable and on no page at all, with every test
green. `assertFieldsCovered` does NOT catch it: the field carrying the id is
already covered by a row about something else. Each new trigger needs an entry
in `thoughtsOn()`'s `triggers` list with its own `when`, a `when` case in
`render-story.mjs`'s heading map, and a check of the section blurb (which
promises every beat "fires on its own, once each").

**The PLACEMENT gate is silent too, and it is the one nobody expects.** If the
new field also puts a MONSTER on the board, `model.mjs`'s
`placementsByEnemy()` has its own hardcoded list of the ways a level can do
that (`spawns`, `spawners`, `packs`, `waves.budget`, `rareSpawns`,
`openingStrike`, `martyrs`). A breed reachable only through a source missing
from it files in the bestiary under "**somewhere off the campaign path**" —
naming no venue, showing no difficulty table — while the game spawns it every
thirty seconds. It needs the entry AND a line in `prose.mjs`'s `has(<kind>)`
chain saying how the player meets it.

All three end the same way: grep the BUILT pages for the line.

    npm run library --workspace pwa && grep -rl "SOME DISTINCTIVE PHRASE" pwa/dist/library/
