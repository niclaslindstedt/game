---
title: A beat about somebody LEAVING has to latch that they were seen — by the time it fires there is nothing left to look at
date: 2026-08-12
scope: engine/game/arrivals.ts, content/thoughts.yaml
concepts: [thoughts, visibility, triggers, fog]
---

A line pinned to "he watched somebody go through the door" cannot ask
`visibleTo` at the moment it fires. The body is taken off the field a step INSIDE
the building and the fog stops at the walls, so its last position is one no hero
on the tarmac can ever see; and anchoring the question on the DOORWAY instead
fails too, because the beat is staged near the LANDING (`ARRIVALS.watchReach`,
96px) while the gate is wherever the carve punched it — measured 244px away on
the shipped seed 1, well outside `MAP.revealRadius`.

Latch it while it is happening (`Arrival.watched`, set each tick a hero standing
on the lot can see the walker) and read the latch at the end. Both halves are
asked of a hero who is ON the lot, so "somebody saw it" and "somebody is still
outside" cannot be answered by two different players in a party.

Also: a fixture level that carries a `thought` FREEZES a headless suite. A scene
takes the stage and `step` advances nothing but `playing`, so an unmuted fixture
stops dead the first time somebody gets out of a car — with every later assertion
timing out on a beat that was never going to happen. `muteDialogue` still SPENDS
the read (`readOnce`), so `thoughtsSeen` says what it always said.
