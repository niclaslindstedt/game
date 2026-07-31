---
title: Crate density on OPEN ground is a difficulty knob — re-run balance_test after adding any
date: 2026-07-31
---

Nothing but the hero jumps, so every crate is a wall to the horde. Adding supply
crates at density 3.4 to the moon's open `basin`/`rille` districts was enough to
make `tests/content/balance_test.ts` unable to kill a MOTIONLESS hero on MEDIUM
inside its 45s window — the boxes gave a standing hero cover he never earned, and
the idle-overrun promise ("doing nothing loses") quietly stopped holding. 1.1 was
the density that ground could carry.

Crates inside an ENCLOSED district (a station pad, a hall) are far cheaper: the
horde is already routing around walls there. So the rule is about the district,
not the count — anything scattered on ground the horde has to CROSS to reach the
hero needs `npx vitest run tests/content/balance_test.ts` before it ships, and
the test prints a per-rung time-to-death table to tune against.
