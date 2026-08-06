---
title: Price an errand against a MEASURED run, and check the map can supply it
date: 2026-08-06
---

Every shipped kill errand opened at 6–10 kills and every fetch piece fell at a
third of a chance. Both numbers read fine in the YAML and were wrong by a
factor of five, because nothing in the authoring loop ever says how fast this
hero actually kills. One command does:

```sh
node scripts/simulate-run.mjs --difficulty medium --level goodco_hq --seed 42 --full
```

Its `mobs:` table gives kills per breed for a real run — 176 monsters in three
minutes on HQ, 165 of them interns. That is the denominator an errand's count
has to be picked against, and it also shows the SKEW: the same run killed one
security guard. A count that is generous against the map's total can still be
impossible against the breed the player actually meets.

The supply side needs its own instrument, because a carved map's horde is
finite and lives entirely in spawner queues (`waves` are dropped on a carve).
Twenty lines are enough:

```js
const s = createGame(seed, levelId, "medium");           // note: POSITIONAL args
for (const p of s.spawners) if (!(p.openStage ?? 0)) for (const d of p.queue) tally(d);
```

That found longhorn at 39 on Boot Hill and successor at 30 on HQ against
hundreds of everything else — the two places a forty-kill errand would have
been unfinishable. Run BOTH before picking a number: the sim says what a count
costs in minutes, the census says whether the map owns that many bodies at all.

One trap worth carrying: a top-up pass that adds mobs must gate on the breeds
the level's own `spawners[].members` were built from. Quest carriers include
named elites, cache guardians and rampage-only hellborn, and "restocking" one
of those queues a one-off boss into the ordinary horde. Everything looked
right until the check printed `+3 scaled_ancestor` on a fresh map.
