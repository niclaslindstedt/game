---
title: A `minDifficulty` line makes a carrier invisible below its rung, and nothing in the build catches it
date: 2026-08-09
scope: content/quests/, content/maps/
concepts: [difficulty-gates, hellborn, collect, kill-named, testing]
---

The schema checks that a `dropFrom` / `kill` / `killNamed` id EXISTS; it never
asks whether the rung the errand is offered on can put that mob on the field.
Five shipped errands were silently impossible because of it. Two gates stack on
a map's `hellborn:` block and both are easy to miss: the HELLGATES the crop
comes out of are stamped `minDifficulty: nightmare` by the carve
(`mapgen/generate.ts` — it appears in NO authored YAML at all), and the second
member line of every `hellborn:` block carries its own `minDifficulty: jesus`.
So a `hellborn` breed is NIGHTMARE-and-up at best and JESUS-only at worst, and
`quests/restock.ts` deliberately refuses to top up a one-off, so nothing
rescues it.

Two right answers, and which one applies is a design question, not a mechanical
one. If the errand is ABOUT the rampage-only horror ("clear the thing haunting
this corridor"), give the QUEST a matching `minDifficulty` — that is what the
field is for, and the errand simply is not offered on rungs where the thing
does not exist. If the errand must run on every rung (RUTH's THE SCALE pays the
game's only cache and `DifficultyDef.cache` authors a line for all five), widen
`dropFrom` with a one-off the rung actually reaches; the 1-in-8 ceiling binds
only breeds the map's `horde` is made of, so `dropChance: 1` survives.

Picking a guaranteed one-off carrier takes measuring, not reading: `elites` and
the `boss` (plus its `escort`) are placed on every seed, but `guardians` are
dealt round-robin over the CACHE ROOMS, of which THE RIFT grows only 2–3 — so a
third guardian is absent on most seeds. `rareSpawns.unique` rolls at 0.2. And a
`killBoss` mission clears only when no `role: boss` is left alive, which makes a
boss ESCORT the one carrier a completed run cannot route around (a `spareable`
elite can be spared, and a boss with `flees` never dies at all).

`tests/content/quest_reachability_test.ts` is the guard. Note what it had to
learn the hard way: walking the whole carved `LevelDef` for `enemy` keys reports
everything green, because `firstSightThoughts` / `firstKillThoughts` name the
very breed whose first sighting plays a thought. It walks an ALLOW-list of
spawn-bearing fields instead.
