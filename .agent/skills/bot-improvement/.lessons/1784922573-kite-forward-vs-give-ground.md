---
title: On walled path levels a ranged hero must KITE FORWARD in the hold-band zone, not backpedal — the give-ground arc traps him in a basin
date: 2026-07-24
---

`survive()` in `fight.ts` used to fire GIVE GROUND for the WHOLE too-close zone
(`nearestD < dangerDist || nearestD < engageDist - band`), retreating along
`awayFromPack(near, travelHeading)`. For a RANGED hero (`engageDist - band` well
above `dangerDist`) on a dense finite-knot map (THE MOON), a fast body is almost
always inside `engageDist - band`, so GIVE GROUND fires nearly every tick — and
the away-from-pack vector (weight 1) dominates the forward bias (0.9), so on a
WALLED basin the "open side" is backward/into the corner. The hero traces a giant
quarter-circle arc around the basin, never draining the knot and never threading
the ridge gap ("moves up and down but never goes right"). Confirmed with a
thought-trace: 90+ s of continuous GIVE GROUND, hero looping the basin.

Fix: split the zone. A true danger-bubble breach (`nearestD < dangerDist`), an
OVERWHELMED/bleeding hero, or an open map still gives ground away from the pack.
But a HEALTHY ranged hero merely holding-band-close on a PATH level now KITES
FORWARD: `normalize(objective + awayUnit × push)` with `push` ramping 0→
`kiteForwardPush` (0.75) as the nearest body closes, kept below 1 so the march is
always net-forward — draining the knot ON THE MOVE (exactly the moon YAML's
stated design). Non-sprint, like ADVANCE.

Two things that made this safe/correct:
- **Melee is unaffected by construction.** Melee sizes `engageDist`/`band` so
  `engageDist - band == dangerDist`; the kite-forward zone is empty for a blade,
  so only ranged/magic behavior changes.
- **Evaluate aggregate, not single seeds.** The sim is deterministic but chaotic
  — a tiny movement change cascades over 7 min, flipping single-seed outcomes
  either way (mars s2 victory→timeout looked like a regression but was an
  under-parity lucky boss-rush replaced by proper leveling; no seed developed a
  STUCK-AREAS table). Sweep ≥5 seeds AND check STUCK AREAS at boss-parity levels
  before trusting a verdict. Moon L11 s1 clear time dropped 8.6→6.7 min.
