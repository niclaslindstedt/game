---
title: A hub-accepted campaign chain crosses levels — and two tests care
date: 2026-08-01
scope: content/quests/
concepts: [campaign-chain, hub, testing]
---

A giver can stand on the HUB (`level: garage`) and hand out `campaign: true`
errands whose collect pieces drop on OTHER levels — the engine already
supports it (`maybeDropQuestItem` rolls off any ACTIVE quest's `dropFrom`
carriers wherever the kill happens, and campaign quests seed into every run).
Two things to know when authoring one:

- `tests/content/quests_test.ts` ("send the hero after breeds the map they
  are on actually spawns") checks `dropFrom` against the quest's OWN level.
  Hub-level quests are the sanctioned exception: their breeds are checked
  against the union of every level's breeds. Keep that exception scoped to
  `objective.type === "hub"` levels.
- `levelBreeds` in that test only sees `enemy:`-keyed ids, so a breed that
  appears ONLY in a map's `rareSpawns` string list is invisible to it — and a
  rare spawn is a bad quest carrier anyway (the pity floor can't help if the
  carrier itself never appears). Pick common minions as carriers.

Cross-level `at:` placements remain unusable (placement runs at ACCEPT on the
current run's map); `dropFrom` is the only cross-level delivery mechanism.
