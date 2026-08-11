---
title: A deterministic outcome keyed by entity id must be staged with an intentional id in every exhibit
date: 2026-08-11
scope: pwa/src/game/drive-screen/exhibits.ts, engine/game/drive/wreckage.ts
concepts: [drive, effects-gallery, staging, determinism, probability]
---

The DRIVE's combustion roll is derived from a traffic vehicle's id so seeded runs replay without consuming the layout RNG. That also means a shared exhibit helper's default id silently selects fire or explosion for every physics card that uses it; use a known neutral id as the default and allow the one exhibit about combustion to request a known explosive id explicitly. A focused gallery test should pin the isolated card's event and sound bank so a later hash or threshold change cannot turn the demonstration into an ordinary crash.
