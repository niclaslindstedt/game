---
name: test-scenario
description: "Use when a bug repro, an fps probe, or a visual judgement needs the game in an EXACT situation — the hero at the boss with 2 hp and no weapon, 60 mobs in a ring, a specific build. Covers the ScenarioSpec (`?scenario=` / applyScenario), the FPS meter, and the recipes for staging with the playtest bot."
---

# Test Scenarios

Playing your way into a situation is slow and unrepeatable. The engine's
scenario support (`src/game/scenario.ts`) **declares** the situation instead:
a JSON `ScenarioSpec` applied over a freshly created run — position, vitals,
build, gear, and the field's exact population. Use it whenever you are:

- **reproducing a bug** ("dies twice from one hit when at low hp near the
  boss") — stage low hp near the boss and step;
- **probing performance** — spawn the worst-case horde and read the FPS
  meter;
- **eyeballing a context** ("how does the new boss sprite read next to the
  hero?", "is the HUD legible over 60 mobs?") — stage it, screenshot it.

## The spec

Every field optional — describe only what differs from a normal run.

| Field | Effect |
| --- | --- |
| `place` | `"boss"` (a stand-off from the level's boss, facing it) or `{x, y}`. Map revealed around the landing spot |
| `hp`, `stamina` | Vitals, clamped to `[1, maxHp]` / `[0, maxStamina]`, applied AFTER gear/stats resolve so "2 hp" sticks |
| `level`, `stats`, `coins` | Player level (xp curve re-derived), ABSOLUTE stat allocations, purse |
| `weapon` | A `WEAPON_DEFS` id minted plain — or `null` for the unbreakable fallback sidearm (the game's "no weapon") |
| `disarmed` | `true` holsters entirely: the auto-attack sits out, the hero cannot fight at all |
| `gear` | Per-slot (`head/chest/legs/feet/charm/bag`): a `GEAR_DEFS` id minted plain, or `null` to strip the slot |
| `abilities` | Powerups banked into the dock, capped at its size |
| `clearEnemies` | Empty the field — bosses are KEPT (deleting the objective would clear the level on the spot) |
| `stopWaves` | Exhaust the wave budget so the horde spawner stays silent — the field holds exactly what you placed |
| `spawns` | Rings of extra mobs: `{enemy, count, minDistance, maxDistance, at?, mlvl?, hpMult?}` — around the player (post-`place`), at least `minDistance` out (default 60 world units, ~1.5 body lengths past melee reach) |
| `skipOpening` | Default `true`: prelude + intro + opening strike skipped, straight into `playing` |

Distances are **world units** (the phone viewport is ≈422×195 world units).
Ring positions draw on the run's seeded rng — **pin `?seed=` and the staged
layout reproduces exactly** (see the debug-game skill).

## Driving it

| Route | How |
| --- | --- |
| Browser (headed) | `?scenario=<url-encoded json>` — combine with `?level=`, `?seed=`, `?debug`, `?bot=`. Applied once at run start (not to resumed/checkpointed runs) |
| Playtest harness | `node website/scripts/playtest.mjs --strategy idle --scenario '{"place":"boss","hp":2}' --seed 42` — the harness URL-encodes and forwards it; screenshots land as usual (see the playtest skill) |
| Engine tests | `applyScenario(state, spec)` right after `createGame` — see `tests/engine/scenario_test.ts` |
| DevTools, live | With `?debug`, `window.__scenario(spec)` re-shapes the CURRENT run mid-flight |

An invalid def id inside the spec never throws — the line is skipped with an
engine `warn(...)` (check the console / `recentLogs()`), so a typo'd enemy id
shows up as "nothing spawned", not a crash.

## The FPS meter

The DEVELOPER menu's **DEBUG MODE** toggle (persisted) or the `?debug` param
shows a small FPS readout bottom-center during runs (`GameScreen.tsx`
`showFps` — an EMA of real frame deltas, written straight to the DOM).
`?debug` is what the playtest harness passes, so **the meter is visible in
every playtest screenshot** — an fps probe is: stage the horde, screenshot,
read the corner. Judge at the phone-landscape viewport (844×390), the
mobile-first baseline; a desktop-sized window renders more world and lies
about the phone's frame budget.

## Recipes

```sh
# Boss fight on a knife's edge: 2 hp, no weapon, at the boss.
node website/scripts/playtest.mjs --strategy idle --seed 42 \
  --scenario '{"place":"boss","hp":2,"weapon":null}'

# FPS worst case: a 200-mob ring, waves silenced so the count is exact.
node website/scripts/playtest.mjs --strategy idle --seed 42 --level moon \
  --scenario '{"clearEnemies":true,"stopWaves":true,"spawns":[{"enemy":"ghost","count":200,"minDistance":60,"maxDistance":200}]}'

# A specific build at a specific spot (visual check of gear on the hero).
node website/scripts/playtest.mjs --strategy idle \
  --scenario '{"place":{"x":1200,"y":800},"level":12,"stats":{"strength":6},"gear":{"chest":"kevlar_vest"}}'
```

Shipped def ids live in `src/game/defs/` (enemies, equipment, abilities);
engine tests use the fixture ids (`test_minion`, `test_vest`, …) instead.

## Rules of thumb

- **Stage, don't play.** If a repro script starts with "walk to the boss",
  replace the walk with `place`.
- **Silence what you're not testing.** `clearEnemies` + `stopWaves` gives a
  field that holds exactly what the spec placed — fps numbers and repro
  steps stop drifting with the wave ramp.
- **One spec per bug report.** Paste the full URL (level + seed + scenario)
  into the issue/test comment — it IS the repro.
- **Lock engine bugs with a test**, not a scenario URL: reproduce via
  `applyScenario` in `tests/engine/`, then fix (see the debug-game skill).
- Scenario state is throwaway: victory/death from a staged run still banks
  the character build, so use a throwaway character for destructive stages.

## Skill self-improvement

When a staging need doesn't fit the spec (a new field, a new default), grow
`src/game/scenario.ts` + its test, then document the field in the spec table
above and in `docs/configuration.md`. Add recurring stagings as recipes.
