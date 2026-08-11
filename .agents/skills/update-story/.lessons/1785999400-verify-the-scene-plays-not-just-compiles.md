---
title: A multi-beat scene needs a STATE gate between beats, not a bigger distance
date: 2026-07-31
scope: content/cutscenes/
concepts: [scenes, state-gate, verification]
---

Sequenced beats driven by a proximity/contact trigger collapse into consecutive
ticks unless something explicitly says "this beat is spent". Shoving the striker
away is NOT enough: a contact radius tight enough to mean "on top of him" (22 px
on goodco_hq) takes many ticks to clear at any sane shove speed, so the next
beat fires on the very tick the player taps the last one closed — and all three
monologues stack up as one long scene while every test that only asserts the
END state stays green.

`stepOpeningStrike` gates on `knockMs > 0` (the recoil is LIVE), which is a
fact rather than a number that happens to be big enough today. Assert the gap
in the test, not just the ordering: step between beats and check the striker
actually got clear floor between them.
