---
title: Secret levels ride a registry split + latent travel gates
date: 2026-07-11
---

A level OUTSIDE the campaign (the bunker cow level) is a registry concern,
not an engine fork: `levels/index.ts` merges `SECRET` defs into `LEVELS` but
keeps them out of `LEVEL_ORDER` (`SECRET_LEVEL_ORDER` feeds the dev warp
picker), and the secret level SHARES a campaign story `index` so
`levelPosition`'s XP-cap axis and `levelsBefore` never shift under shipped
maps. Reaching it is data + one small system: `LevelDef.gates` entries stay
LATENT until `spendGateKey` consumes the matching zero-stat bag trinket
(`opensWith`, a GEAR id — spare it in `isSpecialItem` via `gateKeyIds()` or
the scrap sweep eats the key), which pushes a `GateState` plus a LANDMARK
(zero renderer edits, the flee-landmark precedent) and the `stepGates` pass
books a one-shot `gateEntered`. The APP owns travel (bank loadout →
`setLevelId`) because mutator-pushed events die at the next `step()`'s
`events = []` — cue UI feedback directly in the handler, and only trust
events pushed INSIDE step. Bossless farm venues use the new
`objective: { type: "reachExit", at }` (anchors the difficulty axis at the
door) + `outro` + `exitTo` (the victory splash's BACK TO <name> button).
Naming gotcha: an engine mutator named `use*` trips react-hooks lint the
moment the app calls it — pick `spend*`/`activate*`. New GameState field
(`gates`) = website `SAVE_VERSION` bump, as always. A `?level=` dev override
pins every re-mount, so gate-travel playtests must
`history.replaceState` the param away after the first run starts.
