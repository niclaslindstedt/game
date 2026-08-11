---
title: A new way to FIRE a thought — or any new LevelDef field — needs its own library entry, or the line publishes nowhere
date: 2026-08-01
scope: engine/game/defs/levels/types.ts, content/levels/, pwa/scripts/library/
concepts: [thoughts, triggers, publishing, level-def, coverage, silent-failure]
---

The library has TWO independent gates on a level, and a new field trips them in
opposite ways.

**The FIELD gate is loud.** `pwa/scripts/library/model-missions.mjs` keeps
`LEVEL_FIELDS` and `assertLevelFieldsCovered` THROWS on any key it does not
know, so `tests/content/library_test.ts` goes red the moment a new `LevelDef`
field lands on a shipped level. It wants two edits: a row in `LEVEL_FIELDS`
saying which part of the page renders it, AND an actual read in the mission
model plus a sentence in `prose-missions.mjs`. Declaring without rendering
satisfies the throw and publishes nothing.

**The TRIGGER gate is silent.** `pwa/scripts/library/model-story.mjs`
`thoughtsOn()` builds a chapter's beats from a hardcoded list of trigger
sources — `openingStrike`, `firstSightThoughts`, `firstKillThoughts`,
`travelDoors[].unready`, `placeThoughts`, `exitByCar` — so a beat fired by
anything else is authored, shipped, playable and on no page at all, with every
test green. `assertFieldsCovered` does NOT catch it: the field carrying the id
is already covered by a row about something else.

Each new trigger needs: an entry in `thoughtsOn()`'s `triggers` list with its
own `when`; a `when` case in `render-story.mjs`'s heading map (the slot the
mob-fired beats fill with a SPEAKER needs a second source when the beat names a
door, a place or an ending instead); and a check of the section blurb, which
promises every beat "fires on its own, once each" — a door beat does neither,
and prose that contradicts the page is drift.

Both gates end the same way: grep the BUILT pages for the line.

    cd pwa && npm run library && grep -rl "SOME DISTINCTIVE PHRASE" dist/library/
