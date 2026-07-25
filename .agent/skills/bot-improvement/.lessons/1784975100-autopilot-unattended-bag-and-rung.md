---
title: An unattended ride needs an exit for loot AND for a beaten campaign
date: 2026-07-25
---

Two rules that only bite once the AUTO PILOT runs for hours unattended:

- **A bot's bag has no exit.** A human empties a full bag at the merchant or by
  wearing things; a ride cannot. "Never trash a keeper" (the old
  `cullWorstLoot` rule) therefore doesn't scale: once every cell holds a
  unique, the bag stays full and the ride REFUSES EVERY DROP for the rest of
  the flight — so the best find of the night is the one left on the floor. The
  fix is to shed the least precious keeper (ranked by TIER first, sell value
  only within a tier) and bank it in the LOST & FOUND
  (`src/game/items/vault.ts`) rather than destroy it.
- **A beaten campaign is a dead end.** `autopilotNextLevel` farmed the beaten
  rung forever, so an overnight ride ground mobs it had long outclassed.
  `autopilotStepUp` raises the difficulty instead — but the unlock graph is
  APP state (`nextDifficultyFor`), so the engine takes the rung as route input
  rather than deriving it.

Gotcha when probing either in the running app: the localStorage prefix is
`game.config.json`'s `storagePrefix` (`gone-in-space:`), NOT `game:`. Seeding a
roster under a guessed prefix loads a silently EMPTY roster — `loadCharacters`
swallows every failure and returns `[]`, so there is no error to see. Burned a
few probe rounds on this; read the prefix from the config, don't infer it.
