---
name: leveling-balance
description: "Use when tuning how fast the hero levels — the XP curve, kills-per-level pacing, the level cap, the onboarding ramp, or the auto-stat/mob-scaling balance. Walks the kills-per-level model, the leveling-curve calculator, and the measure-with-a-bot loop."
---

# Leveling Balance

Leveling is the game's long-game pacing: how many levels a day of play buys,
how gear stays relevant, and how the climb tapers toward the level cap. Tune it
here — **only in `src/game/config/leveling.ts` `LEVELING`** — and verify with the
calculator and a bot run before it ships.

## The model — the curve is authored DATA (`content/leveling.yaml`)

The curve is a hand-authored TABLE, not a formula: `content/leveling.yaml`
holds the XP each level costs, per level up to the cap, compiled by
`make levels` (`scripts/generate-leveling.mjs`) into
`src/generated/leveling.ts`, which `xpToLevelUp(L, difficulty)` reads:

```
xpToLevelUp(L) = XP_TO_NEXT[L] × endgameSteepenMult(L) × tierLevelCostMult(difficulty)
referenceMobXp(L) = refMobHp × (1 + mobXpGrowthPerLevel)^(L-1) × xpPerHp
```

Kill XP is LEVEL-priced (`mobLevelXp`), COMPOUNDING at
`LEVELING.mobXpGrowthPerLevel` (8%/level to the cap) on the `referenceMobXp`
unit above — a mob is worth what a "typical" minion of its level would be,
NOT its actual hp (a tank and a squishy of the same level pay the same);
neither `autoPowerScale` nor the linear `MENACE.mobHpPerLevel` hp ramp is in
the XP pricing (toughness and reward scale on their own curves), so kill XP
never moves with the auto-stat dev flag. The shipped ENDGAME WALL lives in
the table's own tail (kills climb to ~1000 by L98); `endgameSteepenRate`
ships at 0, so the BALANCE › ENDGAME WALL slider is inert unless a rate is
restored. Every YAML row carries a `# ~N kills` annotation — the IN-PLAY
design target on the critical path (medium → nightmare → jesus), verified
against simulator ding data; keep it in step when editing, it is what makes
the curve reviewable. Because EVERY XP faucet is mob-priced (elites and
bosses pay a flat multiple of their own mob-level XP, arrows a flat few
reference-mob kills — the `eliteXpMobMult`/`bossXpMobMult`/`arrowXpKills`
knobs at the top of the YAML), the annotation is directly tunable — but the
raw XP behind a row is NOT `annotation × referenceMobXp(L)`: it embeds each
band's measured income factor (the WoW-style level-difference premium where a
rung's mob band sits above the hero, the elite/arrow drip, and the tier step
the row must compensate — the shipped rows ride factors of roughly ×1.2–1.8
on the bottom band, ×1.8–2.6 on nightmare, ×0.6–0.7 on jesus, which is also
why the raw cost legitimately DIPS at the L58 seam while the in-play curve
stays smooth). The CALIBRATION RECIPE when reshaping the curve: author the
target annotations first, price rows as `target × referenceMobXp(L) ×
bandFactor` (start from the shipped factors), then measure real dings with
the simulator battery and re-scale each band by the Gaussian-smoothed
(σ≈3, log-space, WITHIN a band: 1–39 / 40–57 / 58+) annotation/measured
ratio. One pass converges; further passes chase single-run noise. The
SIMULATOR's ding data stays the final yardstick — read it with
`scripts/leveling-pace.mjs` (below).

> **Mob HP toughness is a SEPARATE curve from XP.** A mob's actual health rides
> the GEOMETRIC `mobHpLevelFactor` (`MENACE.mobHpGrowthPerLevel`, eased past
> `mobHpGrowthKnee`), decoupled from the linear `mobHpPerLevel` XP ramp above —
> so mobs get tankier over the game (hits-to-kill rise to ~10 by L60) with **zero
> effect on leveling pace**. Tune toughness there, verify with
> `scripts/mob-hp-curve.mjs` (see the `simulate-run` skill); tune PACE with the
> `LEVELING` knobs below. The two no longer move together.

> **Balance is per-BUILD — always check all four.** The hero's damage,
> survivability, and hits-to-kill depend on the stat-distribution build
> (`melee`/`ranged`/`magic`/`balanced` — `src/game/builds.ts`), so any toughness
> or pace change must be verified across every build, not just the default. The
> **pace/XP curve itself is build-INVARIANT** (kills-per-level cancels the hero's
> damage — so `scripts/leveling-curve.mjs` needs no `--class`), but **the
> hits-to-kill / mob-hp reads are NOT**: pass `--class` to `scripts/mob-hp-curve.mjs`
> and overlay every build with `node scripts/progression-sim.mjs --class all`
> (one comparison graph, aligned by hero level — the read for which build leads
> at each stage). Run `node scripts/simulate-run.mjs --class all --verdict` as the
> matrix check. The goal is each build strongest in its own stretch, none walling
> or one-shotting where the others are on-curve.

**Golden XP arrows are a SECOND faucet — a small, flat one.** They drop from the
loot rain (`LOOT.dropChance × arrowDropShare × the difficulty's `arrowDropMult`)
and each pays a flat `arrowXpKills × referenceMobXp(L)` (`arrowXp` in
leveling.ts) — a few mob kills' worth at every level and difficulty, XP the
kill-count model above ignores. BOTH arrow levers — the drop share
(`arrowDropShare`) and the reward (`arrowXpKills`) — are authored at the top of
`content/leveling.yaml`, so the whole faucet dials from one file. There is no
share-of-bar and no hot/cold split, so the drip can never distort the table's
kills-per-level; it thins out up the difficulty ladder (zero on JESUS, via the
per-difficulty `arrowDropMult`). To tune the faucet, first read the curve with
it OFF (`simulate-run --no-arrow-xp`, or `leveling-pace.mjs --run
--no-arrow-xp`) — the pure kill grind — then dial the two levers to add the
drip you want on top. `LevelDef.loot.arrowCapByDifficulty` remains as each
map's PACING YARDSTICK (the level a normal run ends at — the campaign
simulator's realistic pacing and boss-level verdicts read it); when the curve
moves, re-read it off `--by-level` and update the level defs.

## The knobs (`LEVELING` in `src/game/config/leveling.ts`)

The per-level costs live in `content/leveling.yaml` (see its header for the
shape story: a monotone rise from the cheapest level at L1 onto the gentle
geometric, then the endgame tail). The remaining `LEVELING` knobs:

| Knob | Does |
| --- | --- |
| `tierLevelCostStep` | **Per-difficulty slowdown.** Each difficulty TIER above the three bottom lanes makes a level cost this fraction MORE, COMPOUNDING per tier (`(1+step)^tier`, tier = `difficultyDef.index−3`): nightmare ×1.25, jesus ×1.5625 at the shipped `0.25`. So harder rungs take "longer and longer" to level. Applied in `xpToLevelUp(level, difficulty)`; runtime-scalable via BALANCE › LEVEL SLOWDOWN. 0 = every difficulty alike. |
| `endgameSteepenFrom` / `endgameSteepenRate` | **Endgame wall.** Past level `endgameSteepenFrom` (70), every level costs an extra `endgameSteepenRate` (5%) COMPOUNDING on top of the authored table, so the grind to 99 walls up (D2's 90→99). Applies to EVERY difficulty (shared curve); runtime-scalable via BALANCE › ENDGAME WALL. Rate 0 = pure geometric tail. |
| `refMobHp` | The "typical minion hp" anchor mob XP is priced against (`mobLevelXp`) — the reference-mob unit the kills-per-level model reasons in. Keep near the common wave minions' catalog hp. |
| `maxLevel` | The Diablo-style cap (99). At the cap XP stops banking levels (bar pins full) — the endgame becomes the gear hunt. Enforced in `grantXp` (loot.ts). |
| `xpPerHp` | XP per point of a mob's max hp. The units the whole model rides on; rarely touched. |
| `xpAbovePlayerPerLevel` / `xpBelowPlayerPerLevel` / `xpAboveMaxMult` | **WoW-style level-difference XP** (`levelDiffXpMult`, folded into `mobLevelXp`). A mob ABOVE the hero pays a bonus (`+above` per level, capped at `xpAboveMaxMult`); a mob BELOW pays a penalty (`−below` per level) down to ZERO — the "grey" mob `1/below` levels under. A SAME-level mob is ×1, so `referenceMobXp` (the curve's anchor) is untouched — this only bites where a difficulty's mob-level CAPS push the horde off the hero's level. Runtime-scalable via BALANCE › REST XP. |

**Per-difficulty mob-level HARD CAPS** live on the difficulty, not `LEVELING`:
`DifficultyDef.mobLevelMin/mobLevelMax` clamp the horde level (`mobLevelFor`) into
a band — EASY 1–34, MEDIUM 2–36, HARD 3–38, NIGHTMARE 38–56, JESUS 58+. The
floor makes a freshly-arrived nightmare/jesus hero fight mobs a touch above him
(a level-difference XP bonus, catch-up); the ceiling stops mobs scaling once he
out-levels a tier (stuck, grey-XP mobs — an over-levelled farm can't grind for
pace or loot). The caps also gate LOOT: `lootLevel = mlvl − offset`, so the
bottom lanes cap loot below the legendary gate (mlvl 40) — top tiers come from
nightmare/jesus. `mobHpScaleFor`, `mobLevelXp`, and the loot gates all read the
clamped level. A difficulty that omits the caps is uncapped (test fixtures do).

`statPointsPerLevel`, `dingCelebrationMs`, `autoGainsPerLevel` are ding
*rewards/feel*, not pacing — leave them unless that's the change. The YAML's
`arrowXpKills` and `arrowDropShare` (and the per-difficulty `arrowDropMult`)
DO move pacing — the golden-arrow faucet above — and the calculator models them.

**Don't fight the auto-stat/mob balance.** `autoGainsPerLevel` (leveling.ts)
and `MENACE.mobHpPerLevel` are wired so free growth cancels against the horde
(`tests/engine/leveling_test.ts` asserts it). The kills-per-level model already
rides that cancellation — so tune the `LEVELING` pacing knobs, not the mob
scaling, to move pacing. Both sides of the cancellation run through the
**level-scaled stat cap** (`diminishStat`/`statCap` in leveling.ts, knobs
`STATS.statHardCap`/`statCeilingBase`/`statTaper`): effective stats are linear
up to a ceiling that RISES with level — the raw a full spec (all chosen points
in one stat) would reach — hard-capped at 250, then a diminishing tail past it,
and `autoPowerScale` applies the same curve to the auto-only sums — so the
cancellation holds, while GEAR that pushes a stat past the cap realizes a
little less each point (chosen placement hard-walls at the cap). That keeps a
spec dominant into the endgame while gear still pays off: leveling alone slowly
loses ground to the horde,
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
   to ~2/day near 99, with a classic-RPG opening: both XP costs AND
   kills-per-level rise monotonically from the cheapest level at L1 (neither
   ever dips), the first ding lands in under a minute, and each early ding
   comes slower than the last.
2. **Model it** with the calculator — no game needed:
   ```sh
   node scripts/leveling-curve.mjs --difficulty medium --kills-per-hour 2000
   node scripts/leveling-curve.mjs --difficulty easy --to 20   # early game
   node scripts/leveling-curve.mjs --luck 20                   # more arrows
   node scripts/leveling-curve.mjs --campaign                  # critical path
   node scripts/leveling-curve.mjs --by-level                  # per (stage × level), HALF clear
   node scripts/leveling-curve.mjs --by-level --clear-share 1  # FULL clear — the cap-sizing view
   node scripts/leveling-curve.mjs --by-level --start hard     # a different lane
   node scripts/leveling-curve.mjs --by-level --tier-entry nightmare:34,jesus:56  # tier entry pts
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
   the assumed roster fraction killed per clear, default 0.5). The
   `content/leveling.yaml` rows are the levers: raise a band of rows to slow
   that stretch, lower it to speed it up (run `make levels` after each edit).
   Adjust and re-run until the table and every `--start` lane land where you want.
3. **Measure the real pace and GRAPH it** — the calculator's kills/hour is an
   ASSUMPTION. Get the real number headlessly from the campaign simulator
   (see the `simulate-run` skill — the summary table's `k/min` column ×60 is
   kills/hour, its per-run `levelUps` carry the ding timestamps AND kill
   counts, and its per-rung hero `start→end` levels ARE the campaign
   progression the calculator only predicts):
   ```sh
   node scripts/simulate-run.mjs --difficulty easy --level spacez_hq --full
   node scripts/simulate-run.mjs               # the full campaign, easy → JESUS
   node scripts/simulate-run.mjs --verdict     # PASS/WARN/FAIL, incl. boss-level-vs-intended
   node scripts/simulate-run.mjs --no-arrow-xp # the pure kill grind (isolate the arrow levers)
   ```
   Then turn dumps into the per-level PACING GRAPH — minutes/level and
   kills/level per difficulty against the authored target, as a console table
   and a self-contained HTML page (smoothed curves over the raw dings, the
   measured/target ratio per band):
   ```sh
   node scripts/leveling-pace.mjs medium.json nightmare.json --html pace.html
   node scripts/leveling-pace.mjs --run              # runs the standard critical-path
                                                     # battery first (~20 min), then graphs
   node scripts/leveling-pace.mjs --run --no-arrow-xp
   ```
   The battery is the calibration sweep the shipped curve was tuned with: a
   medium lane from L1, a nightmare farm from the L40 arrival, and two JESUS
   clear-chains (58 and 65 on moon — short per-map budgets keep them at
   clear-pace). Per-band measured/target ratios near 1.0× mean the yaml
   annotations are telling the truth.
   To probe a pace change BEFORE editing `LEVELING`, the simulator's `--balance
   xpGain=…` knob scales kill XP live (no rebuild) and `--verdict` flags the
   first-visit-XP and boss-level bands (see the `simulate-run` skill's knob
   loop). It's a fast directional probe — the shipped pace still lives in
   `config.ts`, so commit the change there and re-verify at `1×`.
   or from a browser bot run (see the `playtest` skill):
   ```sh
   cd pwa && npx vite --port 5199 &
   node pwa/scripts/playtest.mjs --strategy survivor --difficulty easy
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

- **A classic-RPG opening** — the cheap first rows exist so a new player sees
  the level-up, the stat chooser, and the golden burn early, while the
  monotone rise (in BOTH raw XP and kills-per-level — neither ever dips)
  keeps every following ding slower than the last: the first ding lands in
  under a minute and levels 1–4 take a couple of minutes rather than
  seconds. To slow the opening further without breaking monotonicity, raise
  row 1 and flatten the opening slope — never dip a later row. Verify with a
  `simulate-run` opener (the ding timestamps in `levelUps`), not just the
  calculator.
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
