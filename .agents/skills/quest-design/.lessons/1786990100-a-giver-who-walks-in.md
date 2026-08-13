---
title: A giver who WALKS IN is only vulnerable while walking — `to` is the flag, and the walk is the whole exposure
date: 2026-08-13
scope: engine/game/quests/, content/quest-givers.yaml
concepts: [givers, arrival, staging, roadkill, hub]
---

`QuestGiverDef.arrive` ({from, delayMs, speed}) stands somebody on the map and
walks them to their authored spot. `QuestGiver.to` is set for exactly that
stretch and is the flag every rule reads: doors open for them (`stepDoors`),
they are NOT met/marked/talkable yet, and it is the only window in which a car
can kill them (`runDownBystander`).

Three things that made the beat work rather than merely happen:

- **The pause is load-bearing.** Somebody already moving on frame one is half
  inside before a player looking at his inventory glances up. `delayMs: 1100`
  then a ~2 s walk reads from anywhere on the lot.
- **Stage them ON the hazard's line, not near it.** Ruth centred on the garage
  doorway (the line the car leaves by) turns "she could be hit" into "she will
  be hit by anyone who floors it"; the earlier diagonal approach never
  intersected the wagon.
- **Death is per RUN, not per campaign.** Givers are minted by
  `createQuestGivers` on every level create, so a hub re-entry brings her back.
  That is what makes a permanent-feeling consequence safe to ship.

Gate the mark too: `giverMark` must return `"none"` for a dead giver, or the
bot walks at a corpse forever (`bot/errands.ts` keys off the mark, so that one
gate covers it). And `removeMapMarkers` needed a `defId` argument — removing by
KIND alone would take every other giver's pin on a map that has several.
