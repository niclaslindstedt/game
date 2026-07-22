---
name: simulate-run
description: "Use to measure the game's ACTUAL balance by running the real engine headlessly — whole levels or whole campaigns (easy → JESUS across every map), with the autopilot playing, auto-equip equipping, and loadouts carried between clears. The hero is immortal by default (a calibration instrument — every death booked with its CAUSE and COORDINATES, never run-ending); --mortal makes a death restart the level and --max-deaths aborts a run that keeps dying, with the DEATHS table feeding map-layout's death overlay. Reports hero level/hp/dps progression, damage per hit dealt and taken, per-mob hp/level/contact damage/blows-to-kill, every drop, weapon swaps, deaths, and the XP the per-map caps withheld. Probe a candidate tuning live with --balance (the DEVELOPER→BALANCE knobs, no rebuild), read a one-screen --verdict (PASS/WARN/FAIL incl. loot-fits-level and DPS-on-curve), see where the hero meets each boss and what it drops, judge whether drops fit the leveling curve, and A/B two runs with --compare. The closing measurement loop of every balance change — including fixing loot so drops make sense for the level."
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
- **Are the LADDER numbers themselves right?** A stall, a runaway, or a hero who
  reaches the boss badly under/over its level may mean the map's `intendedLevel` /
  `hero:` band (`ladder.yaml`) is mis-set — the intended level is a BALANCE KNOB,
  not a fact to tune everything else around. Always hold it as a candidate for the
  fix. And because the hero carries level + gear forward, moving one map's band
  cascades to every FOLLOWING map, so a range change is never a one-level edit:
  re-flow it through all maps × difficulties and re-verify the whole chain is
  beatable back-to-back (campaign run with carry). This is one of the big things a
  balance pass must look at.
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
node scripts/simulate-run.mjs                            # full campaign, easy → JESUS (realistic pacing)
node scripts/simulate-run.mjs --difficulty medium,nightmare,jesus  # the critical path (avoids outlevelled 0-kill runs)
node scripts/simulate-run.mjs --difficulty easy --level spacez_hq --full
node scripts/simulate-run.mjs --farm --rerun 3           # ENDGAME: farm to the cap (L99 / artifact chase)
node scripts/simulate-run.mjs --seed 42 --strategy kite  # different seed/autopilot
node scripts/simulate-run.mjs --level oasis --difficulty hard --start-level 20 --mortal  # survival read: deaths restart the level, abort at 10
node scripts/simulate-run.mjs --class all                # MATRIX every build (melee/ranged/magic/balanced) head to head
node scripts/simulate-run.mjs --class magic --difficulty jesus --start-level 50  # a magic endgame arrival
node scripts/simulate-run.mjs --verdict                  # one-screen PASS/WARN/FAIL read
node scripts/simulate-run.mjs --balance xpGain=0.8,mobHp=1.5 --verdict   # probe a candidate tuning
node scripts/simulate-run.mjs --compare baseline.json    # A/B diff vs an earlier --json dump
node scripts/simulate-run.mjs --json report.json         # machine-readable dump
```

### Pacing — realistic by DEFAULT, farm with `--farm`

The immortal bot, left alone, farms every map for the whole `--max-minutes` and
over-levels wildly (L48 after just easy+medium, L99 by the hard tier) — which
**poisons every level-relative read** (loot-vs-level, boss-level, difficulty):
the hero is 20 levels above the content, so drops read as trash and bosses read
as trivial, purely from the over-farm, not the balance. So the CLI **defaults to
realistic pacing**: each run ENDS (`outcome: cleared`) the moment the hero
reaches the map's intended exit level (its `arrowCapByDifficulty`, the same
yardstick the boss-level read uses), and he carries a real-player level forward.
This is what makes the audit trustworthy — **use it for any level-relative
tuning**. Notes:

- Give it a **generous `--max-minutes`** (12–15): with a tight budget the slow
  survivor bot can time out UNDER a map's target, then over-shoot catching up on
  the next — a generous budget lets every map actually reach its target.
- Sweep the **critical path** (`--difficulty medium,nightmare,jesus`), not all
  five rungs: the bottom three lanes share caps, so after one of them the hero
  outlevels the other two and their runs clear at 0 kills (no data).
- **`--farm`** turns pacing OFF — the old farm-to-the-cap behaviour, for the
  ENDGAME read (how the L99 / full-artifact chase actually plays). Pair it with a
  big `--max-minutes` / `--rerun`. The DPS/deaths reads under `--farm` are an
  over-farmer's, not a real player's — don't tune level-relative rules off them.

### Classes — ALWAYS consider all four builds (`--class`)

Balance is per-BUILD, so **a balance question is never fully answered by one
build** — a knob that fixes melee can break magic. The `--class` flag picks the
stat-distribution build the hero levels as (`melee`/`ranged`/`magic` focus a
weapon lane; `balanced` spreads across every stat), which through the stat-aware
auto-equip also decides the weapon and gear. (`--profile` is the historical alias
for the same axis, and also takes `auto`, the emergent lane.) The build catalog
is one source of truth — `src/game/builds.ts` — shared with the analytic
progression graphs, so a build means the same thing in both tools.

- **`--class all`** runs the MATRIX (one campaign per build) and prints
  `SPEC TOTALS` — the head-to-head that answers **"is one build overpowered?"**.
  Make this the default read for any balance change: run `--class all --verdict`
  and confirm no single build walls or one-shots where the others are on-curve.
- **`--start-level N` mints the arrival hero PER BUILD**, so an endgame class
  comparison (`--class all --difficulty jesus --start-level 50 --farm`) drops
  each spec in as its own leveled + geared hero (a melee arrival wields a melee
  weapon, etc.), not one shared generalist.
- The design goal is that **each build leads during its own stretch of the
  game** (e.g. melee early, ranged/magic mid/late) rather than one dominating
  throughout — so read the matrix per rung, not just the campaign total.

### Shopping — ON by default; `--no-shop` to turn it off

The autopilot has no merchant behaviour of its own, so a weapon that breaks with
an empty bag would strand the hero on the unbreakable sidearm (`blaster`) and,
at high difficulty, into a DEATH SPIRAL (can't kill → can't level → can't drop a
replacement) — which **overstates high-difficulty pressure**. Since a real
player shops, the sim does it too **by default**: when the hero is weapon-starved
(on the sidearm, or a nearly-worn weapon), it walks him to the merchant and
**sells the bag → repairs → buys the best weapon he can wield → equips it**
(visits counted in `combat.shopVisits`). **`--no-shop`** turns it off — the
bot-never-shops read. **A/B them** (default vs `--no-shop`, `--compare`) to tell a
REAL high-difficulty stall — where even a bought weapon can't keep up — from an
artifact of the bot not shopping (in the audit, `--no-shop` stranded the hero on
the 46-dps sidearm through all of JESUS; with shopping he stayed armed with
447→1662-dps weapons, so the "spiral" was mostly the missing shop behaviour).

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

### Stuck cancellation — `--stuck-limit` and the STUCK AREAS map loop

The bot getting stuck poisons a run's numbers long before the timeout: it
grinds against a wall pocket for minutes while the clock (and the XP pacing)
runs. So the runner keeps a **stuck-penalty ledger** (`report.stuck`): every
no-progress moment books a penalty at the bot's world coordinates — a **wedge**
(the stall-breaker firing: no kill, no damage, no net movement for 15 s) or a
**loiter** (still moving, but circling one ≤~140 px patch for 30 s without
landing a point of damage — the "AI logic not working here" read). A repeat in
an area that already failed weighs double. When the total reaches
`--stuck-limit` (default 20; `0` disables) the run is **CANCELLED** (outcome
`stuck`) and the sweep moves on with whatever it banked.

The cancelled run's coordinates are the deliverable: the **STUCK AREAS** table
prints each run's clustered failure spots `(x, y) ×events [wedges, loiters]`
plus a ready-to-paste visualize command:

```sh
node scripts/map-layout.mjs <level> --seed <runSeed> --highlight "x,y;x,y"
```

`--highlight` draws magenta X markers (labelled X1, X2, … with coordinates) on
the layout render; `--highlight-file report.json` reads a `--json` dump
directly and pulls the matching runs' `stuck.areas`. **Always pass the run's
`--seed`** (the printed command does): stuck spots usually sit on the run's
seed-scattered rocks, which only draw on the layout with that seed. This is the
fast loop for navigation/obstacle-avoidance work: run → read STUCK AREAS →
look at the highlighted map → fix `bot.ts`/geometry → re-run (see the
`bot-improvement` skill). For pure balance sweeps where the old
grind-through-the-clock behaviour is wanted, pass `--stuck-limit 0`.

### Menace escalations — when/where the horde evolved

Every run carries an ESCALATION LEDGER (`report.menace`): each menace stage
rise the engine emitted, with its sim-timestamp, map coordinates, and CAUSE —
`overkill` (a one-shot's jolt), `ratchet` (the permanent evolution floor
lifting), or `heat` (the rolling DPS/kill-rate channel) — plus the run's
final/floor/peak stages. The **MENACE ESCALATIONS** table prints one block per
run that escalated: the rise count by cause, the first-rise minute, the first
dozen rises `(min, stage, cause, (x, y))`, and a ready-to-paste
`map-layout.mjs --highlight` command over the clustered rise areas — so a
"malice is off the scale" complaint answers WHEN it blew up, WHERE on the map,
and WHICH channel drove it before any knob is touched. Read the cause mix
first: an overkill/ratchet-heavy ledger means one-shotting (gear/mob-hp
tuning); a heat-heavy ledger means the sustained-output channel is what's
climbing. The per-minute snapshots' `menace` column stays the coarse view.

### Mortality — `--mortal`, `--max-deaths`, and the DEATHS map loop

Every death is booked in a **death ledger** (`report.deathLog`) with its
**cause** — the enemy defId that landed the fatal blow, or a `hazard:*` tag
(asteroid, sandstorm, stampede, black_hole) — and its **world coordinates**,
clustered into areas like the stuck ledger. The **DEATHS** table prints each
run's clusters `(x, y) ×deaths [cause×n, …]` plus a ready-to-paste visualize
command; a repeated cause at one spot is the finding ("he dies to the intern
pack at that choke, every time").

Two flags change what a death MEANS:

- **`--mortal`** — the SURVIVAL read: instead of the immortal in-place revive,
  a death **starts the level over** (a fresh map from a new attempt seed — a
  retry that rolls differently — with the walk-in loadout), the way a real
  player's failed run does. The run's clock and combat totals span every
  attempt.
- **`--max-deaths N`** — abort the run (outcome `dead`) once it books N deaths
  (default 10 under `--mortal`, 0 = never otherwise). If the bot keeps dying
  at the same place to the same cause, more attempts just repeat the lesson —
  the spot is too hard, and the aborted run's DEATHS coordinates are the
  deliverable to go fix (see the `map-improvement` skill's "Death areas"
  loop).

```sh
node scripts/simulate-run.mjs --level <id> --difficulty hard --start-level 20 --mortal
node scripts/map-layout.mjs <level> --seed <runSeed> --deaths "x,y:cause;x,y:cause"
```

`--deaths` draws red **†** markers (disc area ∝ deaths in the cluster,
labelled D1, D2, … with the killer); `--highlight-file report.json` pulls the
matching runs' `deathLog.areas` (and `stuck.areas`) from a `--json` dump
directly. Pair `--mortal` with `--start-level` — an under-levelled arrival
dies everywhere and tells you nothing about the map. Keep the immortal
default for calibration sweeps: mortal restarts reset in-level progress, so
pacing/loot reads come from the immortal instrument.

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

### The HITS-TO-KILL calibrator — `mob-hp-curve`

When the question is specifically **"how many hits does a mob take, over the
game?"** — the mob-toughness / one-shotting / rampage-meter read — use
`scripts/mob-hp-curve.mjs`. For each rung it walks the geared hero (off the
analytic sim) across its realistic level band and records the reference minion's
hp + armor, the hero's per-hit, and HITS REQUIRED, as a console table and a
self-contained HTML graph. This is the instrument the geometric mob-hp curve
(`MENACE.mobHpGrowthPerLevel` / `mobHpLevelFactor`) is calibrated against — a
healthy campaign RISES from ~2 hits early to ~10 by L60 then plateaus; a line
pinned near the bottom means the hero one-shots the horde (which pins the
rampage meter at its cap).

```sh
node scripts/mob-hp-curve.mjs                                       # every rung → mob-hp-curve.html
node scripts/mob-hp-curve.mjs --difficulty easy,jesus --to 72
node scripts/mob-hp-curve.mjs --no-unique --no-legendary --no-sets  # NORMAL magic/rare gear
```

The `--no-*` flags leave those tiers on the ground (via
`ProgressionOptions.excludeTiers`), so the curve reads the hero on everyday loot
— the baseline the horde is tuned to, with named drops a bounded BONUS spike
(keep them under ~10× a normal loadout sub-99).

### The AoE-targets calibrator — `aoe-calibration`

When the question is **"how many foes does a melee swing actually hit?"** — the
input to the damage-budget model's AoE assumption (`weaponAssumedTargets` /
config `WEAPON.meleeAoe`) — use `scripts/aoe-calibration.mjs` (engine side
`src/sim/aoe-calibration.ts`). It arms the REAL autopilot with probe weapons,
plays representative levels, and records the UNCAPPED in-cone count on every
swing (exposed on the `swing` event by `meleeSweep`). There are TWO axes:

- **Arc** (default mode, bucketed by effective arc): sweeping the cone ANGLE at
  a fixed reach, the arc barely matters — a read rises from ~1.2 at a narrow
  thrust to only a ~1.85 plateau, because at a SHORT reach only ~2 bodies fit at
  once (the old cone-4 / full-5 guess was 2–3× too high).
- **Reach** (`--reach`, an arc×reach grid): once STRENGTH drives melee reach
  (`rangePerStr`), reach is the DOMINANT lever — the swept sector's area grows
  with reach², so a deep high-STR swing threads 6–9 foes. The `WEAPON.meleeAoe`
  model is the swept-AREA fit (`1 + gain·(1 − e^(−area/scaleArea))`, clamped at a
  design `targetCap`), and `weaponAssumedTargets` prices a melee weapon at the
  crowd it reaches AT THE REALISTIC BUILD STATS for its `levelReq`
  (`meleeBudgetTargets`). Realized hits in play are `min(geometry,
  maxMeleeTargets = 2 + INT)` — which for a real melee build sits above the
  geometry, so reach is the limiter.

The **`--ranged`** mode answers the same question for a ranged trigger pull —
how many DISTINCT foes a spread / pierce / chain reaches — off the per-hit
`enemyHit.fromVolley` telemetry (each shot tags its trigger pull). The read
(config `WEAPON.rangedAoe`): a SPREAD reaches only ~1.8 distinct foes however
many pellets it fans (its `count` stays priced as point-blank BURST, but its
crowd spread is a mirage), while PIERCE / CHAIN thread ~0.5 / ~0.7 distinct foes
each — the reliable ranged AoE.

```sh
node scripts/aoe-calibration.mjs                                    # default melee sweep
node scripts/aoe-calibration.mjs --degs 40,90,120,180 --difficulty medium,nightmare
node scripts/aoe-calibration.mjs --ranged --difficulty medium,nightmare   # spread/pierce/chain
node scripts/aoe-calibration.mjs --json aoe.json
```

## Reading the report

The summary table prints one row per run: hero level `start→end`, deaths,
kills, kills/min, realized DPS out, average damage per landed blow
(`hitOut`), damage taken and its per-blow average before armor (`hitIn`),
JUMP takeoffs and their per-minute rate (`jumps`/`j/min` — the
stamina-discipline read: each takeoff spends 10% of the sprint pool, so a
high rate means the autopilot is bunny-hopping itself winded),
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

**The LOOT VS LEVEL table** (always printed when equipment drops) answers "do
the drops FIT the hero's level, or is the map raining gear he's too low to wear
or trash beneath him?" — the read for *drops that make sense from a leveling
perspective*. One row per run: pieces dropped, how many were **wear**able on
the spot, how many were **gated** (too high a level requirement to wear yet),
how many were **trash** (ilvl ≥3 under the hero) vs **onLvl** vs **above**, and
**Δilvl** — the mean drop ilvl minus hero level (the headline: ~0 means the
rain tracks the hero, strongly negative = trash, strongly positive = gated).
Fast-leveling opening maps read a higher trash share naturally (the hero
out-levels his early drops by the clear), so read Δilvl across the campaign, not
off one short map.

**`--verdict`** distills the whole run to PASS/WARN/FAIL band checks — plus one
overall line. It's the "does anything seem off?" answer without reading every
table; the bands are generous by design (they flag gross regressions, not fine
feel):

- **First-visit XP** forfeit (should be ~0 — caps bite reruns, not first passes)
- **Blows-to-kill** — campaign-mean minion blows (target 2–8; toward 1 =
  one-shotting, ballooning = wall)
- **Boss level** vs the map's intended level (±2)
- **Bosses felled** — engaged-but-not-felled bosses (walls)
- **Loot fits level** — the share of drops that were gated or trash, and the
  mean Δilvl (the loot-vs-leveling headline)
- **DPS on curve** — blows-to-kill checked PER RUNG, not just on average, so the
  one rung where loot fell off the curve isn't hidden by a healthy mean
- **Loot pools** — rungs where the hero leveled up but nothing wearable dropped
  (a starved `weaponPool`)

**`--compare baseline.json`** diffs the current run against an earlier `--json`
dump as deltas (k/min, final level, equip drops, mean Δilvl, per-boss hero level
and blows-to-kill) — the A/B view a knob or loot-pool change actually wants.

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

- **The hero is immortal BY DEFAULT — it's a calibration instrument**: a death
  respawns the hero at the level spawn (counted in `deaths`, cause +
  coordinates in `deathLog`, run continuing), so pacing, loot, and
  damage-exchange measurements are never capped by the autopilot's survival
  skill. A default run only ends in `victory` or `timeout` — "does the hero
  survive?" is the `--mortal` / `--max-deaths` read (outcome `dead` when the
  death limit is hit), not the default one.
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

## Recipe — make the drops make sense for the leveling curve

The task "fix loot so drops fit where the hero is" is a MEASURE-here,
FIX-elsewhere loop: this sim is the instrument, but the levers live in the
weapon/level defs (the `weapon-system` and `level-design` skills own them).
Drive it like this:

1. **Read the current state.** Run a full campaign and look at the LOOT VS
   LEVEL table and the `Loot fits level` / `DPS on curve` / `Loot pools`
   verdict lines:
   ```sh
   node scripts/simulate-run.mjs --verdict --json loot-before.json
   ```
   Diagnose from the columns:
   - **high `gated`** (drops the hero can't wear yet) → a base's `levelReq` is
     ahead of when the map drops it, or the level's `loot.weaponPool` includes
     bases that gate too high for that rung.
   - **high `trash` / strongly negative `Δilvl`** → the map rains gear beneath
     the hero: he's over-levelled for the content (a leveling-pace problem — see
     the `leveling-balance` skill) or the pool's bases sit too low.
   - **`Loot pools` starved rung** (leveled up, nothing wearable dropped) →
     the level's `loot.weaponPool` has nothing at that ilvl band; widen it or
     add a base that enters there.
   - **`DPS on curve` off on one rung** → the auto-equipped hero's DPS drifted
     off the mob-hp curve there; the pool isn't handing him an upgrade that
     rung keeps pace with.
2. **Fix the DEF, not the sim.** The sites (see the `weapon-system` skill's
   "Where everything lives" table): a base's `levelReq` (`equipment.ts`), the
   level's `loot.weaponPool` (`defs/levels/<level>.ts`), the `LOOT` tier/ilvl
   gates (`config.ts`), and boss `tierDrops`/`uniquesByDifficulty`
   (`defs/enemies/`). Use `item-forge.mjs` for any new item's numbers and
   `drop-rate.mjs` for the rare/unique economy.
3. **Re-measure and diff.** Re-run against the baseline and confirm the loot
   columns moved the right way without breaking pace or the boss table:
   ```sh
   node scripts/simulate-run.mjs --verdict --compare loot-before.json
   ```
   Iterate 1→3 until `Loot fits level` and `DPS on curve` pass across the
   campaign (not just one map — a fast opening map reads trashy in isolation).
4. Finish with `make test` and a `playtest`.

Global loot knobs (`--balance dropRate/gearQuality/equipmentShare/uniqueDrops`)
tune the drop rain's overall VOLUME and QUALITY, not any single item's fit — use
them to probe "is there roughly enough good loot?", then fix specific fit
problems in the pools/`levelReq` above.
