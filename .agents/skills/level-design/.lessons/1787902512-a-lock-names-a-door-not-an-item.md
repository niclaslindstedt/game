---
title: A lock names a DOOR id; the key is the story item whose `unlocks` points back at it — comparing the two id spaces type-checks and is never true
date: 2026-08-28
scope: engine/game/, content/maps/, content/story-items.yaml
concepts: [keys, doors, locks, annex, silent-regression]
---

`LevelDef.gates[].opensWith`, `LevelDef.elevators[].opensWith` and
`MapBlueprint.annex.lock` all carry a DOOR id (`control`, `vault`). What opens
one is whatever story item's `unlocks` names that door (`keycard_boot_hill`).
Two id spaces, both plain strings, so `state.storyItems.includes(pad.opensWith)`
compiles, reads correctly, and can only ever be false.

That exact line sealed BOOT HILL's control-room lift on 100% of runs. The annex
is the venue's boss room and the lift is its only door, so the level could not
be finished by anybody — with every content check green, because the AUTHORING
was right: `generated_maps_test.ts` proves each `opensWith` is some item's
`unlocks`, and `boot_hill_test.ts` proved the pass was on THE STUNT DOUBLE.
Nothing asked whether the pass then worked.

Ask through the accessors instead — `holdsKeyFor(state, doorId)`
(`engine/game/story.ts`) for "is the party carrying it", `keyItemForDoor(doorId)`
(`engine/game/defs/story.ts`) for "what is it called". And when a venue's finale
sits behind a lock, the test that matters is the RIDE, not the wiring: stage the
hero on the pad with and without the key and assert he moves.
