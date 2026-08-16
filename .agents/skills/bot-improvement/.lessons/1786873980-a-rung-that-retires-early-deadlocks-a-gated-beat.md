---
title: A rung that retires at the doorway deadlocks any beat gated on getting further — and steering stops SHORT of its goal
date: 2026-08-16
scope: engine/game/bot/entrance.ts, engine/game/story.ts
concepts: [rungs, scripted-beats, deadlock, arrivals, nav, false-green]
---

`bot/entrance.ts` retired the moment the hero left the arrival lot, which was
fine while GOODCO's first read fired on crossing the threshold. Tighten that read
to a DEPTH (`ARRIVALS.enteredStep`) and the level deadlocks: the bot stops in the
opening, the read that fires the opening strike waits for depth he never walks,
the strike is what ARMS him, and every rung below is waiting for a weapon. He
stood there unarmed and untouched for the full 90 s with `hp=100` — which reads
as a bot bug and is a rung boundary.

The rule: when a scripted beat is gated on the hero reaching somewhere, the rung
that carries him there must retire on THAT condition, not on the one that made it
start. Measure it — log the hero's max depth per seed rather than inferring from
a test that only says "never armed".

And the tail: steering stops within `PLAYER.arriveRadius` (4 px) of its target,
so a goal set exactly AT the bar leaves him arrived, satisfied, and short — 92.5
against a bar of 96, identical on every seed. A goal that has to be CROSSED is
aimed past it (a body's radius is enough). An identical number on every seed is
the tell that you are reading a constant, not a roll.
