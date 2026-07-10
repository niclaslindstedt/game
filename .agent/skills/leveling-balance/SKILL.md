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

## The knobs (`LEVELING` in `src/game/config.ts`)

| Knob | Does |
| --- | --- |
| `killsPerLevelBase` | Kills a mid level costs (the curve's height). Bigger = slower everywhere. |
| `killsPerLevelGrowth` | Per-level rise (the taper). `1.02` ≈ ×7 over 99 levels → ~10–20/day early easing to ~2/day at cap. Bigger = steeper taper. |
| `refMobHp` | The "typical minion hp" anchor kills-per-level is stated against. Keep near the common wave minions' catalog hp. Scales the whole curve's height with `killsPerLevelBase`. |
| `earlyRampStart` / `earlyRampLevels` | Onboarding ramp: level 1 costs this FRACTION of its curve value, lerping to full by `earlyRampLevels`. Makes the first ding land in a handful of kills to show off the level-up. |
| `maxLevel` | The Diablo-style cap (99). At the cap XP stops banking levels (bar pins full) — the endgame becomes the gear hunt. Enforced in `grantXp` (loot.ts). |
| `xpPerHp` | XP per point of a mob's max hp. The units the whole model rides on; rarely touched. |

`statPointsPerLevel`, `arrowXpShare`, `dingCelebrationMs`, `autoGainsPerLevel`
are ding *rewards/feel*, not pacing — leave them unless that's the change.

**Don't fight the auto-stat/mob balance.** `autoGainsPerLevel` (leveling.ts)
and `MENACE.mobHpPerLevel` are wired so free growth cancels against the horde
(`tests/engine/leveling_test.ts` asserts it). The kills-per-level model already
rides that cancellation — so tune the `LEVELING` pacing knobs, not the mob
scaling, to move pacing.

## Workflow

1. **Aim the pacing.** Decide the target: first-ding kills, early levels/day,
   levels/day at the cap. The design target is ~10–20 levels/day early tapering
   to ~2/day near 99, with the first ding in the opening minute.
2. **Model it** with the calculator — no game needed:
   ```sh
   node scripts/leveling-curve.mjs --difficulty medium --kills-per-hour 2000
   node scripts/leveling-curve.mjs --difficulty easy --to 20   # early game
   node scripts/leveling-curve.mjs --campaign                  # full playthrough
   ```
   The default table reads the live `LEVELING`/`MENACE` config and prints, per
   level: `xpToNext`, `kills/lvl`, `levels/day`, and cumulative kills/days to
   the cap. `--campaign` instead simulates clearing every level at every
   difficulty in order and reports the level after each rung — the check for the
   **"all difficulties → ~level 60"** target (`--clear-share` overrides the
   assumed roster fraction killed per clear, default 0.5). `killsPerLevelBase`
   is the height knob that moves that number; `killsPerLevelGrowth` the taper.
   Adjust and re-run until both the table and the campaign land where you want.
3. **Measure the real kill rate** — the calculator's kills/hour is an
   ASSUMPTION. Get the real number from a bot run (see the `playtest` skill):
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
- **Campaign lands ~level 60** — playing through all five difficulties'
  campaigns should leave the hero around level 60 (`--campaign`), so the
  remaining ~39 levels to the cap are the grind endgame (difficulty replay +
  boss runs), not the story.
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
