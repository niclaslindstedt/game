---
title: Debug navigation with STUCK AREAS + a seed-matched map-layout render — the wedges usually sit on scatter rocks
date: 2026-07-21
---

The sim's stuck-penalty ledger (`simulate-run.mjs --stuck-limit`, on by
default) turns "the bot gets stuck somewhere" into exact world coordinates:
each wedge/loiter books a penalty at the bot's position, runs cancel (outcome
`stuck`) when the penalty crosses the limit, and the STUCK AREAS table prints
clustered `(x, y)` spots plus a ready `map-layout.mjs --highlight` command.

Two gotchas learned building/using it:

- **Always render the highlight map with the RUN's seed** (the printed command
  includes `--seed`). Measured on `spacez_hq` easy seed 1: the big 11-wedge
  cluster at (663, 648) sits on seed-scattered ROCKS in a wall pocket — on the
  seed-less layout render the spot looks like open floor and the failure makes
  no sense. Campaign runs derive per-run seeds (`seed + runIndex * 104729`), so
  use `report.seed` from the run row, not the CLI `--seed` value.
- **Baseline read (2026-07-21, seed 1, easy, survivor/meta):** every easy map
  books stuck penalties; spacez_hq, mars and the_rift cancel at limit 20 with
  wedge clusters against wall pockets/scatter rocks. Any obstacle-avoidance
  change should A/B this exact sweep — total penalty per map and whether the
  cancelled maps go back to clearing.
