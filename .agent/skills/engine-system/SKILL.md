---
name: engine-system
description: "Use when adding or changing a gameplay system (enemy type, weapon, item, movement rule, win condition, spawning…). Walks the engine-first workflow: tune config, extend types/state, implement in the step pipeline, emit events, test headlessly, then wire rendering and sound in the app layer."
---

# Adding a Gameplay System

Gameplay lives in the **engine** (`src/`, framework-free TypeScript); the
**app** (`website/`) only draws state and reacts to events. Keep that
direction: the engine never knows a renderer or a speaker exists. This is
what makes every game rule unit-testable in plain Node.

## Where the pieces go

| Piece | File |
| --- | --- |
| GLOBAL tuning (player, XP curve, stat effects, loot rules) | `src/game/config.ts` — cross-level knobs only |
| A new level (geometry, gravity, intro, spawns, objective, loot table) | `src/game/defs/levels.ts` — one `LevelDef` entry |
| A new monster (stats, AI radii, role, guaranteed drops) | `src/game/defs/enemies.ts` — one `EnemyDef` entry + sprites named after it |
| A new weapon/gear piece or affix | `src/game/defs/equipment.ts` — catalog entry; add its id to level loot pools |
| State shapes & events | `src/game/types.ts` (entities reference defs by id — keep it that way) |
| Level/entity setup | `src/game/create.ts` (seeded RNG only — no `Math.random`, determinism is what makes bugs reproducible) |
| Player-driven mutations (equip, stat allocation, phase toggles) | `src/game/items.ts` — safe to call from UI outside `step()` |
| Per-tick behavior | `src/game/step.ts` — one `stepX()` function per system, called in a fixed order documented at the top |
| Generic helpers (any game could use) | `src/lib/` — earmarked for oss-framework extraction |
| Public surface | `src/index.ts` — export new types/constants the app needs |
| Tests | `tests/<system>_test.ts` (Vitest, `_test` suffix mandatory) |
| Drawing | `website/src/game/render.ts` (+ new sprites via the `pixel-assets` skill) |
| Sound | `website/src/game/sfx.ts` (+ the `sound-effects` skill) |
| HUD/overlay | `website/src/game/GameScreen.tsx` |

## Workflow

1. **Config first.** Add the system's tuning block to `src/game/config.ts`
   with units in the comments (world px, ms, hp). If you can't express the
   knob there, the design isn't ready.
2. **Types.** Extend `src/game/types.ts`. Anything the app must react to
   (sound, flash, particles) becomes a `GameEvent` variant — events are the
   ONLY channel from simulation to presentation. Events are cleared and
   refilled by every `step()`, so the app never misses or double-plays one.
3. **Simulate.** Implement `stepX(state, …)` in `src/game/step.ts` and slot
   it into the documented order inside `step()`. Mutate state in place;
   respect `phase !== "playing"` freezing. Keep per-tick allocation near
   zero (this runs 60×/s).
4. **Test headlessly** in `tests/`: build a state with `createGame(SEED)`,
   surgically arrange entities, run fixed `step(state, input, 16)` loops,
   assert on state + events. Every rule you claim ("cooldown blocks the
   second hit") gets an assertion. `npx vitest run tests/<file>` to iterate.
5. **Export** what the app needs from `src/index.ts`.
6. **Present.** Sprites via the `pixel-assets` skill; draw order and
   animation in `render.ts`; event → sound mapping via the `sound-effects`
   skill; HUD numbers in `GameScreen.tsx`.
7. **Playtest** with the `playtest` skill — numbers that look right in a
   test can still feel terrible at 60fps.

## Invariants to preserve

- `step()` must stay deterministic for (seed, input sequence, dt sequence) —
  no wall clock, no `Math.random`, no DOM.
- The engine imports nothing from `website/`; `@game/core` is the only
  direction of dependency.
- Docs: a public API change means updating `docs/architecture.md` and the
  README per the sync table in `AGENTS.md`; new config knobs go in
  `docs/configuration.md` if they're user-facing.
- Source files stay under 1000 lines — split by concern before the cap.

## Skill self-improvement

When a new system forces a pattern not covered here (status effects, timed
spawners, projectile-vs-projectile collision…), record where it landed and
why, so the next system follows suit.

- **Content catalogs (2026-07, moon level):** levels/enemies/equipment are
  data registries under `src/game/defs/`; runtime entities carry a `defId`.
  New content = new entries, not engine changes. Paused sub-states (intro
  text, level-up chooser, inventory) are `GamePhase` values — `step()`
  freezes on anything but `playing`, and the UI resumes via exported
  mutators. Import `src/lib` through `@game/lib/*` (never relative) so
  oss-framework extraction stays a prefix swap.
- **Cross-level modifiers (2026-07, difficulty ladder):** a setting that
  scales EVERY level (difficulty) is its own defs catalog
  (`defs/difficulties.ts`) threaded through `createGame(seed, levelId,
  modifier)` and stored on the state (`state.difficulty`); spawn/loot code
  reads it via a lookup, never via globals. Keep the default entry an
  exact 1.0 baseline so existing tests and tuning stay untouched.
- **Player-timed consumables (2026-07, held ability items):** pickups the
  player triggers later are a queue on the player (`heldAbilities`) plus an
  input edge (`input.useItem`) consumed by a small `stepX()` — never an
  app-side mutation, so bots (`botAct` sets the edge) and tests drive the
  same path.
