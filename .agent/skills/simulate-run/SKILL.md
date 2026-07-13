---
name: simulate-run
description: "Use to measure the game's ACTUAL balance by running the real engine headlessly — whole levels or whole campaigns (easy → JESUS across every map), with the autopilot playing, auto-equip equipping, and loadouts carried between clears. The hero is immortal (a calibration instrument — deaths are booked, never run-ending). Reports hero level/hp/dps progression, damage per hit dealt and taken, per-mob hp/level/contact damage/blows-to-kill, every drop, weapon swaps, deaths, and the XP the per-map caps withheld. The closing measurement loop of every balance change."
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
- How hard does the hero's blow actually land — per hit, per mob type, and
  how many blows does one kill take?
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
node scripts/simulate-run.mjs --verdict                  # one-screen PASS/WARN/FAIL read
node scripts/simulate-run.mjs --balance xpGain=0.8,mobHp=1.5 --verdict   # probe a candidate tuning
node scripts/simulate-run.mjs --compare baseline.json    # A/B diff vs an earlier --json dump
node scripts/simulate-run.mjs --json report.json         # machine-readable dump
```

### Probing balance WITHOUT editing config — the `--balance` knobs

`--balance` applies the SAME ten runtime multipliers the DEVELOPER → BALANCE
subpage exposes (`BalanceTuning` in `src/game/tuning.ts`: `xpGain`,
`playerDamage`, `mobHp`, `mobDamage`, `hordeSize`, `dropRate`,
`equipmentShare`, `gearQuality`, `uniqueDrops`, `menaceGain`) — as `key=×`
pairs, where `1` is the shipped tuning and `0` turns a system off. The sim
calls `setBalanceTuning` for the run and restores the prior tuning after, so
you can measure a candidate balance with **no rebuild and no config edit**:
change a knob, re-run, read the verdict, repeat. When a value earns its keep,
paste it into `src/game/config.ts` (the knob's real read site) and re-verify at
`1×` — the `--balance` flag is the fast probe, the config is the commit.

### The analytic sibling — `progression-sim`

When the question is progression rather than survival — how XP, loot, and the
hero's stat block climb if the hero cleanly farms **every** mob a level can
field (the horde, its elites, its rolled rare/unique visitors, its boss), rung
by rung, up to level 99 — use the **analytic** simulator instead. It skips the
autopilot and the geometry: it enumerates a level's guaranteed roster and runs
the real kill funnel (`killEnemy` → `grantXp` with the per-map cap → the drop
ladder) once per mob at overkill efficiency 1, auto-equipping upgrades and
spending level-up points on a **configurable** stat distribution, snapshotting
the full stat block every N kills (default 25).

- **Engine module: `src/sim/analytic.ts`** — `simulateProgression(options)`,
  deterministic, returns a typed `ProgressionReport` (per-pass `LevelResult`s +
  a flat `Checkpoint` series). Not part of the public engine API.
- **CLI: `scripts/progression-sim.mjs`** — prints a per-pass table (and every
  checkpoint with `--full`), dumps JSON with `--json`, and writes a
  self-contained HTML **progression graph** (level, hp, damage, crit, armor,
  and attributes over the run, banded by difficulty — via
  `scripts/progression-chart.mjs`).

```sh
node scripts/progression-sim.mjs                              # full game → L99, writes progression.html
node scripts/progression-sim.mjs --difficulty easy --level spacez_hq --full
node scripts/progression-sim.mjs --stats strength=3,stamina=1 # a STR-heavy build
node scripts/progression-sim.mjs --json out.json --html out.html
```

Use the autopilot simulator (above) for "how hard is the pressure / does the
drop rain keep DPS on the mob-hp curve"; use `progression-sim` for "where does
the stat/XP/loot curve actually land, batch by batch, to the cap."

## Reading the report

The summary table prints one row per run: hero level `start→end`, deaths,
kills, kills/min, realized DPS out, average damage per landed blow
(`hitOut`), damage taken and its per-blow average before armor (`hitIn`),
the map's XP cap, the XP that cap withheld (`xpLost`), and the weapon walked
out with. `--full` adds, per run: the hero block (stats, armor reduction,
coins), the combat line (hits landed, damage per hit, crit rate, hits
taken), the weapon timeline (every auto-equip swap with before/after DPS),
the mob table (spawned/killed, average hp and monster level, catalog contact
damage, the hero's average blow against that mob type and its blows-to-kill,
XP paid), the drop ledger (ground vs collected, equipment by tier, named
finds), and per-minute hero snapshots (hp, dps, armor, menace stage).

**The BOSS ENCOUNTERS table** (always printed when the run meets one) answers
"where, at what level, and with what, does the hero fight each elite/boss — and
what does it drop?" One row per boss/elite met: the sim-minute and hero level
the fight STARTED (engagement — the first blow traded, not the boss's spawn,
since bosses are usually placed at map load), shown as `heroL/intended` against
the map's `arrowCapByDifficulty` yardstick; the boss's own monster level, hp,
and contact damage; blows-to-kill; the hero's hp% entering the fight; and the
named unique/legendary it dropped (attributed by kill order). A boss the run
never reached reads `not reached`; one engaged but not felled reads `ENGAGED,
not killed` — a wall (or the bot's pacing giving out). This is the read for
pacing gates: if the hero meets a boss far under its intended level, the rung
before it levels too slow (or the boss gate sits too high).

**`--verdict`** distills the whole run to a handful of PASS/WARN/FAIL band
checks — first-visit XP forfeit (should be ~0), minion blows-to-kill (target
2–8; toward 1 = one-shotting, ballooning = wall), boss level vs intended (±2),
and bosses engaged-but-not-felled — plus one overall line. It's the "does
anything seem off?" answer without reading every table; the bands are generous
by design (they flag gross regressions, not fine feel). **`--compare
baseline.json`** diffs the current run against an earlier `--json` dump as
deltas (k/min, final level, per-boss hero level and blows-to-kill) — the A/B
view a knob change actually wants.

Balance signals to look for:

- **The mob table's `toKill` (avgHp / the hero's average blow)** — the
  direct blows-to-kill read. If it collapses toward 1 the hero is
  one-shotting the horde (the overpowered drift the diminishing-returns
  curve exists to stop); if it balloons, the rung walls.
- **`hitOut` vs `hitIn`** — the damage exchange rate: how hard one hero blow
  lands against how hard one mob blow arrives (before armor; the hero block
  prints the armor reduction to apply).
- **`xpLost` on FIRST visits** should be near zero — the caps are sized to
  bite reruns, not the story. Big first-visit forfeits mean `XP_CAP` bands
  sit too low for that rung.
- **Weapon timeline density** — a healthy run steps through a few genuine
  upgrades; constant churn means drops out-pace their worth, a silent
  timeline means the pools are starved.
- **Deaths** are a pressure gauge, not a lethality verdict — the autopilot
  plays far below a human. Compare rungs against each other, not against
  zero.

## Caveats — what a bot run does and doesn't measure

- **The hero is immortal — it's a calibration instrument**: a death respawns
  the hero at the level spawn (counted in `deaths`, run continuing), so
  pacing, loot, and damage-exchange measurements are never capped by the
  autopilot's survival skill. A run only ends in `victory` or `timeout`;
  the sim never answers "does the hero survive?" — only "how hard is the
  pressure?" (the deaths count).
- **Runs are chaotic**: one different roll early cascades into a different
  run. For a tuning decision, compare A/B across several `--seed`s, not one.
- **The stall-breaker** teleports a geometry-wedged bot toward the fight
  (`unstuckNudges` in the report); the autopilot has no pathfinding, so
  boss-behind-walls maps may time out rather than clear. A `timeout` outcome
  still reports (and carries) everything the run banked.
- The engine's `@game/lib` runtime alias is mapped for plain `node` by
  `scripts/game-alias-loader.mjs` — new scripts that import engine modules
  must `register()` it first (see simulate-run.mjs's header).

## Iterating balance FAST — the knob loop

The `--balance`/`--verdict`/`--compare` trio makes the inner loop tight enough
to run many candidates without touching config:

1. **Baseline**: `node scripts/simulate-run.mjs --json baseline.json` (a rung,
   or the full campaign; keep the dump).
2. **Probe a candidate** with the runtime knobs — no rebuild:
   ```sh
   node scripts/simulate-run.mjs --balance mobHp=1.3,xpGain=0.9 --verdict --compare baseline.json
   ```
   Read the VERDICT line and the COMPARE deltas: did the change move what you
   intended (and nothing you didn't)?
3. **Iterate** — adjust the `--balance` values and re-run against the same
   baseline until the verdict and the boss table land where you want. Hold the
   `--seed` fixed while dialing one knob; then confirm across 2–3 seeds (runs
   are chaotic — one A/B seed isn't a decision).
4. **Commit the winner to config.** The `--balance` knobs are a probe, not a
   ship vehicle — settings-page tuning doesn't change the shipped game. Move
   the earned value into `src/game/config.ts` at the knob's real read site (the
   `tuning.ts` header names each site), then re-run at plain `1×` to confirm
   the config change reproduces the probe.
5. For leveling-pace changes, cross-check the analytic view
   (`scripts/leveling-curve.mjs`, see the `leveling-balance` skill) — the
   calculator predicts, the simulator confirms.
6. Run `make test` (the sim has engine smoke tests in
   `tests/engine/sim_test.ts`) and finish with a real `playtest` for feel —
   the simulator measures numbers, never fun.
