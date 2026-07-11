---
name: simulate-run
description: "Use to measure the game's ACTUAL balance by running the real engine headlessly — whole levels or whole campaigns (easy → JESUS across every map), with the autopilot playing, auto-equip equipping, and loadouts carried between clears. Reports hero level/hp/dps progression, per-mob hp/level/contact damage, every drop, weapon swaps, deaths, and the XP the per-map caps withheld. The closing measurement loop of every balance change."
---

# Simulate Run

The campaign simulator is the balance team's wind tunnel: it drives the REAL
engine — `createGame`, `step`, the autopilot bot, auto-equip, loadout
carry-over — at full speed with no renderer, and reports what actually
happened. Nothing in it models or approximates a rule; it IS the rules, run
fast. Use it to judge any change to stats, XP, mobs, or loot BEFORE a manual
playtest, and to answer the questions the analytic calculators can't:

- Does the drop rain actually keep the auto-equipped hero's DPS on the mob
  hp curve, rung by rung?
- Where does leveling actually stall or race — and how much XP do the
  per-map caps (`XP_CAP`, see leveling.ts `xpLevelCap`) withhold on reruns?
- How hard does each mob actually hit, at what hp and monster level, and how
  many of them does a run field?
- What does a full campaign (easy → JESUS, every level, loadout carried)
  leave the hero with?

## The tools

- **Engine module: `src/sim/simulate.ts`** — `simulateLevel` (one map),
  `runLevel` (one map + the walked-out loadout), `simulateCampaign` (a
  difficulty × level sweep with carry). Deterministic per options; returns
  typed reports (`LevelReport` / `CampaignReport`). Deliberately NOT part of
  the public engine API — scripts and tests import the module directly.
- **CLI: `scripts/simulate-run.mjs`** — parses flags, runs the sweep, prints
  the summary table (and per-run detail with `--full`), dumps JSON with
  `--json`.

```sh
node scripts/simulate-run.mjs                            # full campaign, easy → JESUS
node scripts/simulate-run.mjs --difficulty easy          # one rung
node scripts/simulate-run.mjs --difficulty easy --level spacez_hq --full
node scripts/simulate-run.mjs --rerun 3                  # replay each map ×3 — the XP-cap/farm probe
node scripts/simulate-run.mjs --seed 42 --strategy kite  # different seed/autopilot
node scripts/simulate-run.mjs --no-revive --attempts 3   # honest lethality read
node scripts/simulate-run.mjs --json report.json         # machine-readable dump
```

## Reading the report

The summary table prints one row per run: hero level `start→end`, deaths,
kills, kills/min, realized DPS out, damage taken, the map's XP cap, the XP
that cap withheld (`xpLost`), and the weapon walked out with. `--full` adds,
per run: the hero block (stats, armor reduction, coins), the weapon timeline
(every auto-equip swap with before/after DPS), the mob table (spawned/killed,
average hp and monster level, catalog contact damage, XP paid), the drop
ledger (ground vs collected, equipment by tier, named finds), and per-minute
hero snapshots (hp, dps, armor, menace stage).

Balance signals to look for:

- **Snapshots' dps vs the mobs' avgHp** — blows-to-kill. If it collapses
  toward 1 the hero is one-shotting the horde (the overpowered drift the
  diminishing-returns curve exists to stop); if it balloons, the rung walls.
- **`xpLost` on FIRST visits** should be near zero — the caps are sized to
  bite reruns, not the story. Big first-visit forfeits mean `XP_CAP` bands
  sit too low for that rung.
- **Weapon timeline density** — a healthy run steps through a few genuine
  upgrades; constant churn means drops out-pace their worth, a silent
  timeline means the pools are starved.
- **Deaths (revive mode)** are a pressure gauge, not a lethality verdict —
  the autopilot plays far below a human. Compare rungs against each other,
  not against zero.

## Caveats — what a bot run does and doesn't measure

- **Revive mode is the default** (`--no-revive` to disable): deaths respawn
  the hero at the level spawn, counted, run continuing — so pacing and loot
  measurements aren't capped by the autopilot's survival skill. Use
  `--no-revive` when the question IS survival.
- **Runs are chaotic**: one different roll early cascades into a different
  run. For a tuning decision, compare A/B across several `--seed`s, not one.
- **The stall-breaker** teleports a geometry-wedged bot toward the fight
  (`unstuckNudges` in the report); the autopilot has no pathfinding, so
  boss-behind-walls maps may time out rather than clear. A `timeout` outcome
  still reports (and carries) everything the run banked.
- The engine's `@game/lib` runtime alias is mapped for plain `node` by
  `scripts/game-alias-loader.mjs` — new scripts that import engine modules
  must `register()` it first (see simulate-run.mjs's header).

## Workflow for a balance change

1. **Baseline**: run the relevant slice (a rung, or the full campaign) at
   2–3 seeds and keep the JSON dumps.
2. Make the engine/config change.
3. **Re-run the same slices/seeds** and diff the summaries: hero level per
   rung, dps-vs-mob-hp, drops per tier, deaths.
4. For leveling-pace changes, cross-check the analytic view
   (`scripts/leveling-curve.mjs`, see the `leveling-balance` skill) — the
   calculator predicts, the simulator confirms.
5. Run `make test` (the sim has engine smoke tests in
   `tests/engine/sim_test.ts`) and finish with a real `playtest` for feel —
   the simulator measures numbers, never fun.
