---
title: A beat pinned to a PLACE — no monster, no door — and the two things it breaks that a mob-fired beat never does
date: 2026-08-05
scope: content/levels/
concepts: [beats, place-pinned, story-triggers]
---

Not every pinned line has a speaker to hang off. The HUB
(`content/levels/garage.yaml`) has no horde at all, so "tell the player what the
car is for" could not be a `firstSightThoughts`/`firstKillThoughts` pin, and must
not be an `intro` — that is the doorstep cutscene, which plays before the level
is walkable and is the establishing shot rather than the errand. The answer is
`LevelDef.placeThoughts`: `where: arrival` (the first live tick on this level) or
`where: pastDoor` (a hero on his own FEET has crossed one of the level's approach
doors — the roll-up kind), fired by `stepPlaceThoughts` in `src/game/story.ts`
and read once through `state.thoughtsSeen` like every other pinned beat.

The library half is the lesson already filed as "a new way to FIRE a thought
needs its own trigger kind" — with one addition it did not have to face: the
MISSION page has a second, independent renderer (`render-missions.mjs`'s "What
stops him mid-run" sentence) whose clause list only knew how to name a MONSTER.
A beat with no monster produced a sentence with a dangling clause. Both
renderers key on the same `when` string and both need a case.

The new one is the trap worth carrying: **an ARRIVAL beat lands on the FIRST
live tick, so every existing "run N ticks, expect `playing`" test on that level
silently starts asserting that a dialogue box is up.** Seed the ledger with
`markThoughtsSeen(state, ids)` in the suite's own start helper — which is
exactly what a returning player's persisted ledger does anyway — and test the
beats themselves from a deliberately fresh one.
