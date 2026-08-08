---
title: The survey sheet used to hide the mobs the player sees most — check the horde model
date: 2026-07-30
scope: scripts/art-audit.mjs
concepts: [survey, horde, blind-spots]
---

`art-audit.mjs level <id>` collected `def.spawns` and `def.waves.budget` only.
A level whose ambient horde comes from the FINITE LOCAL model — `spawners` and
`packs`, which is THE MOON, MARS and every generated map — keeps its rank and
file nowhere else, so the sheet silently dropped them. On THE MOON that hid six
mobs including `ghost` and `wraith`, the two commonest things on the map, and
the survey read as if the venue were empty between its four pinned elites.

Fixed in `levelEntries` (it now walks `spawners`, `packs`, `lairs` and
`rareSpawns` too, and adds the lair door props). The general lesson survives the
fix: **before trusting a survey sheet, check it against the level YAML's own
horde section.** A venue can put a mob on screen through six different doors,
and a sheet that only knows two of them will send you off to redraw decor while
the thing the player stares at all level sits unexamined.

The paired tell is a suspiciously short sheet: 24 entries for a whole mission is
not a small level, it is a collection bug.
