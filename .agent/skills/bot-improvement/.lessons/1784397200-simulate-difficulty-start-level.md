---
title: Match --start-level to the difficulty's ladder floor when simulating a bot change; a fresh L1 hero on nightmare/jesus is a fake death-spiral
date: 2026-07-18
---

Nightmare and JESUS are NEVER played from level 1: the campaign ladder
(`scripts/ladder.yaml`, stamped onto each level as `intendedLevel`) puts
the hero around L40+ by the time nightmare mobs appear (~L54 for eastworld). A
naked L1 hero on nightmare just death-spirals on the starter weapon (brass
knuckles/blaster), never levels, never reaches a boss — the numbers are garbage
and tell you nothing about a positioning change.

`scripts/simulate-run.mjs` now GUARDS this: on nightmare/jesus, `--start-level`
DEFAULTS to the first swept level's ladder hero level (`defaultStartLevel()`),
so an omitted flag arrives realistically instead of at L1. easy/medium/hard
still default to a fresh L1 rookie (their real entry). Pass `--start-level 1` to
force a rookie on nightmare/jesus anyway. Still pair with `--gear-tier` to set
the kit tier. If you add a new difficulty above nightmare, teach
`defaultStartLevel` about it (jesus borrows nightmare's ladder number, since
`intendedLevel` omits the player-relative rungs).

Corollary for measuring a BOSS-FIGHT change (e.g. the FIGHT BOSS orbit): the
sim is sweep-dominated and rarely enters a sustained boss fight — at parity
level with good gear the hero one-shots everything (0 dmgIn), under-levelled he
dies before the boss, and `survive()`'s boss-lock only fires when
`readyForBoss` (hero level >= bossLevel - BOSS_ENGAGE_MARGIN). Staging it by
hand is also fiddly: a path level wedges a hand-placed hero into the UNSTUCK
sweep, and `strategy boss` sits in APPROACH BOSS (~250px out) without crossing
into the FIGHT BOSS hold. The open engine fixture `test_shielded_boss` (a
stationary ranged boss, `onPathLevel` false) is the cleanest bed, but even
there the boss must aggro and the hero must close inside `range*0.7` to reach
the orbit branch.
