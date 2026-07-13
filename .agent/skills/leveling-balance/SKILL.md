---
name: leveling-balance
description: "Use when tuning how fast the hero levels — the XP curve, kills-per-level pacing, the level cap, the onboarding ramp, or the auto-stat/mob-scaling balance. Walks the kills-per-level model, the leveling-curve calculator, and the measure-with-a-bot loop."
---

# Leveling Balance

Leveling is the game's long-game pacing: how many levels a day of play buys,
how gear stays relevant, and how the climb tapers toward the level cap. Tune it
here — **only in `src/game/config.ts` `LEVELING`** — and verify with the
calculator and a bot run before it ships.

## The model — the curve is authored in KILLS, not raw XP

`src/game/leveling.ts` `xpToLevelUp(L)` is the single source of truth. It sets
each level's XP cost so that the **number of kills** a level takes is the
quantity you control:

```
xpToLevelUp(L) = killsPerLevel(L) × referenceMobXp(L)
killsPerLevel(L) = killsPerLevelBase × killsPerLevelGrowth^(L-1) × earlyRamp(L)
referenceMobXp(L) = refMobHp × (1 + (L-1)·mobHpPerLevel) × autoPowerScale(L) × xpPerHp
```

Kill XP is hp-proportional (`xpPerHp`), and a mob's hp carries the SAME
`autoPowerScale` factor `referenceMobXp` does, so it **cancels**:

```
actual kills for level L ≈ xpToLevelUp(L) / (refMobHp × mobHpScaleFor(L, difficulty))
```

is invariant to the auto-stat dev flag and to how hard the hero hits — only the
difficulty's `mobLevelOffset` nudges it. That is the whole point: you tune
*kills per level*, and the XP number takes care of itself no matter how the
horde scales.

**Golden XP arrows are a SECOND faucet — a CATCH-UP one.** They drop from the
loot rain (`LOOT.dropChance × LOOT.arrowShare × the difficulty's `arrowDropMult`,
tuned to ~one per 50 kills at medium) and, while the hero is UNDER-levelled for
the current content, each grants `arrowXpShareAt(L)` of the current bar — XP the
kill-count model above ignores. They meaningfully accelerate an under-levelled
hero (up to ~40% faster mid-game on the gentle rungs), taper with level
(`arrowXpShareTaper`), and thin out up the difficulty ladder (zero on JESUS).

They **go COLD past a cap.** Each `LevelDef.loot.arrowCapByDifficulty` names the
level a normal single run of that map/difficulty leaves the hero at (read from
`--by-level`); once `player.level` reaches it, arrows stop paying a share of the
bar and pay a flat `LEVELING.arrowColdMobXpMult × referenceMobXp(L)` (≈5 mob
kills, a rounding error against a level) via `arrowColdXp`. So arrows speed a
hero up to where the content belongs and no further — grinding old maps can't
over-level him. The calculator folds both regimes in: its `w/arrows` column and
the `--campaign`/`--by-level` model apply the cold branch when the modelled
level is at/above a map's cap (visible with high `--luck` or on replay). Treat
`arrowXpShare`, `arrowXpShareTaper`, `LOOT.arrowShare`, `arrowColdMobXpMult`, the
per-map `arrowCapByDifficulty`, and per-difficulty `arrowDropMult` as pacing
levers, not just feel — and when the curve moves, re-read the caps off
`--by-level` and update the level defs so the cold cliff still lands where a run
actually ends.

## The knobs (`LEVELING` in `src/game/config.ts`)

| Knob | Does |
| --- | --- |
| `killsPerLevelBase` | Kills a mid level costs (the curve's height). Bigger = slower everywhere. |
| `killsPerLevelGrowth` | Per-level rise (the taper). Ships at `1.035` (≈×29 over 99 levels): a STEEP taper on purpose — cheap low levels make the accessible bottom tier level fast, expensive high levels let the jesus pass land at ~60 on the curve alone (no cap wall) and keep the 60→99 endgame a real grind. Bigger = steeper. |
| `refMobHp` | The "typical minion hp" anchor kills-per-level is stated against. Keep near the common wave minions' catalog hp. Scales the whole curve's height with `killsPerLevelBase`. |
| `earlyRampStart` / `earlyRampLevels` | Onboarding ramp: level 1 costs this FRACTION of its curve value, lerping to full by `earlyRampLevels`. Makes the first ding land in a handful of kills to show off the level-up. |
| `maxLevel` | The Diablo-style cap (99). At the cap XP stops banking levels (bar pins full) — the endgame becomes the gear hunt. Enforced in `grantXp` (loot.ts). |
| `xpPerHp` | XP per point of a mob's max hp. The units the whole model rides on; rarely touched. |

`statPointsPerLevel`, `dingCelebrationMs`, `autoGainsPerLevel` are ding
*rewards/feel*, not pacing — leave them unless that's the change. `arrowXpShare`
/ `arrowXpShareTaper` (and `LOOT.arrowShare` / per-difficulty `arrowDropMult`)
DO move pacing — the golden-arrow faucet above — and the calculator models them.

**Don't fight the auto-stat/mob balance.** `autoGainsPerLevel` (leveling.ts)
and `MENACE.mobHpPerLevel` are wired so free growth cancels against the horde
(`tests/engine/leveling_test.ts` asserts it). The kills-per-level model already
rides that cancellation — so tune the `LEVELING` pacing knobs, not the mob
scaling, to move pacing. Both sides of the cancellation run through the
**diminishing-returns curve** (`diminishStat` in leveling.ts, knobs
`STATS.statSoftCap`/`statTaper`): effective stats are linear to the soft cap
and flatten past it, and `autoPowerScale` applies the same curve to the
auto-only sums — so the cancellation holds, while chosen points and gear
stats (which stack deeper into the flat tail) realize a little less each
level. That is deliberate: leveling alone slowly loses ground to the horde,
and gear carries the endgame.

**Per-map XP caps.** Every (level × difficulty) pair has a hero-level ceiling
(config `XP_CAP`, `xpLevelCap`/`xpCapMultiplier` in leveling.ts, applied in
`grantXp`): XP halves per level across the last `fadeLevels` under the cap
and stops AT it, so re-running an outgrown map farms loot, never levels. The
bands are sized a few levels above where a first pass naturally ends per stage
(`--by-level` below is the check) — when retuning the curve, re-size the bands
too, and verify with the simulator that first visits forfeit ~no XP (`xpLost` in
the `simulate-run` summary). **The three bottom lanes (easy/medium/hard) are
parallel entry points over the same level band, so they SHARE one cap band** —
the difference between them is help, not pace. That shared cap also BOUNDS the
completionist who replays all three bottom lanes to roughly the same level
entering nightmare as someone who played just one (`--full` shows it).

## Workflow

1. **Aim the pacing.** Decide the target: first-ding kills, early levels/day,
   levels/day at the cap. The design target is ~10–20 levels/day early tapering
   to ~2/day near 99, with the first ding in the opening minute.
2. **Model it** with the calculator — no game needed:
   ```sh
   node scripts/leveling-curve.mjs --difficulty medium --kills-per-hour 2000
   node scripts/leveling-curve.mjs --difficulty easy --to 20   # early game
   node scripts/leveling-curve.mjs --luck 20                   # more arrows
   node scripts/leveling-curve.mjs --campaign                  # critical path
   node scripts/leveling-curve.mjs --by-level                  # per (stage × level)
   node scripts/leveling-curve.mjs --by-level --start hard     # a different lane
   node scripts/leveling-curve.mjs --by-level --full           # completionist
   ```
   The default table reads the live `LEVELING`/`MENACE`/`LOOT` config and prints,
   per level: `xpToNext`, `kills/lvl` (kill XP only), `w/arrows` (the same with
   the golden-arrow faucet folded in), `levels/day`, and cumulative kills/days to
   the cap. `levels/day` and the cumulative columns ride the `w/arrows` count —
   the realistic pace — while `kills/lvl` stays as the kill-XP-only baseline; the
   gap between them IS the arrows' contribution (`--luck N` grows it, JESUS
   collapses it to zero). `--campaign` instead simulates clearing every level along
   the CRITICAL PATH (arrows included, and the per-map XP caps applied) and
   reports the level after each stage; `--by-level` prints the same run but with
   the hero's level at the START of every (stage × level) clear — the view for
   sizing a level-locked gate (e.g. a world-drop `minPlayerLevel`) above where a
   level is first reached. The critical path is the SHORTEST route under the
   parallel-lane ladder: **one bottom lane → nightmare → jesus** (three
   playthroughs, not five); `--start <easy|medium|hard>` picks the bottom lane
   (default medium — the three share caps so they land within a level of each
   other), and `--full` walks all five rungs for the completionist. This is the
   check for the **critical path → ~level 60** target (`--clear-share` overrides
   the assumed roster fraction killed per clear, default 0.5). `killsPerLevelBase`
   is the height knob that moves that number; `killsPerLevelGrowth` the taper.
   Adjust and re-run until the table and every `--start` lane land where you want.
3. **Measure the real kill rate** — the calculator's kills/hour is an
   ASSUMPTION. Get the real number headlessly from the campaign simulator
   (see the `simulate-run` skill — the summary table's `k/min` column ×60 is
   kills/hour, and its per-rung hero `start→end` levels ARE the campaign
   progression the calculator only predicts):
   ```sh
   node scripts/simulate-run.mjs --difficulty easy --level spacez_hq --full
   node scripts/simulate-run.mjs               # the full campaign, easy → JESUS
   node scripts/simulate-run.mjs --verdict     # PASS/WARN/FAIL, incl. boss-level-vs-intended
   ```
   To probe a pace change BEFORE editing `LEVELING`, the simulator's `--balance
   xpGain=…` knob scales kill XP live (no rebuild) and `--verdict` flags the
   first-visit-XP and boss-level bands (see the `simulate-run` skill's knob
   loop). It's a fast directional probe — the shipped pace still lives in
   `config.ts`, so commit the change there and re-verify at `1×`.
   or from a browser bot run (see the `playtest` skill):
   ```sh
   cd website && npx vite --port 5199 &
   node website/scripts/playtest.mjs --strategy survivor --difficulty easy
   ```
   `kills ÷ (timeMs/1000)` is kills/sec → ×3600 = kills/hour. Feed that back
   into step 2. Note the **opening waves are deliberately weak** (worth less XP
   than `refMobHp`), so the very first ding takes more kills in play than the
   model's `refMobHp`-based estimate — watch `level`/`xpGained` in the bot's
   stats JSON to confirm the first ding lands early enough.
4. **Run the tests.** `npx vitest run tests/engine/leveling_test.ts
   tests/engine/arrival_test.ts` covers the curve directly; the derived
   dev-jump loadout tests (`tests/content/rift_test.ts`,
   `tests/content/mars_test.ts`) assert a floor on the campaign level a clear
   yields — a big pacing change shifts those, so update the floor if the intent
   holds. Then the full `make test`.
5. **Lint** (`make lint`) — a removed knob leaves unused imports.

## Feel targets

- **First ding in the opening minute** — the ramp exists so a new player sees
  the level-up, the stat chooser, and the golden burn fast. Verify the first
  ding lands before ~15–20 kills on EASY (the softest opening).
- **Gear stays relevant** — the pain that motivated the slow curve was
  out-leveling loot in a day. Early levels should NOT blow past whole gear tiers
  in minutes; the taper is what keeps a find useful.
- **Critical path lands ~level 60** — the 3-stage climb (one bottom lane →
  nightmare → jesus) should leave the hero around level 60 (`--campaign`), so the
  remaining ~39 levels to the cap are the grind endgame (bottom-lane / difficulty
  replay + boss runs), not the story. Check every bottom lane (`--start easy`,
  `--start hard`) lands within a level of medium's, and that `--full` (all three
  bottom lanes) doesn't over-level past it — the shared cap band is what holds
  both true.
- **A real climb to the cap** — reaching 99 is a weeks-of-play grind, not a day.
  The calculator's "to L99" total is the sanity check.

## Gotchas

- `xpToLevelUp` is exported from `@game/core` (src/index.ts) and used by
  `grantXp` (loot.ts), the initial bar (create.ts), and the arrival derivation
  (arrival.ts) — one curve everywhere. Don't re-implement it.
- The cap lives in `grantXp`'s level loop AND `arrival.ts`'s derive loop —
  both guard `level < LEVELING.maxLevel`.
- The website HUD reads `player.xpToNext` only (no formula), so a curve change
  needs no app change.
