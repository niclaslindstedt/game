---
title: Testing a guaranteed drop on a SPAREABLE unique needs resolveChoice(state, false)
date: 2026-07-12
---

A spareable unique (RASPUTIN et al.) does NOT die when stepped to 0 hp — the
killing blow leaves it kneeling in the `choice` phase, and its guaranteed loot
(incl. a `requiresClear`-gated drop like the SEVERED HAND) only falls on the
KILL verdict. A test that just steps until the mob is "gone" will hang at the
choice and see no drop. Step until `state.phase === "choice"`, then call
`resolveChoice(state, false)` (KILL) to land the withheld blow and the drops.
See `tests/content/bunker_test.ts` `killRasputinInRift`.
