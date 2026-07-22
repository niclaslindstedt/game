---
name: engine-system
description: "Use when adding or changing a gameplay system (enemy type, weapon, item, movement rule, win condition, spawning…). Walks the engine-first workflow: tune config, extend types/state, implement in the step pipeline, emit events, test headlessly, then wire rendering and sound in the app layer."
---

# Adding a Gameplay System

Gameplay lives in the **engine** (`src/`, framework-free TypeScript); the
**app** (`pwa/`) only draws state and reacts to events. Keep that
direction: the engine never knows a renderer or a speaker exists. This is
what makes every game rule unit-testable in plain Node.

## Where the pieces go

| Piece | File |
| --- | --- |
| GLOBAL tuning (player, XP curve, stat effects, loot rules) | `src/game/config/` — cross-level knobs only, one module per system |
| A new level (geometry, gravity, intro, spawns, objective, loot table) | `src/game/defs/levels/<id>.ts` — one `LevelDef` module, registered in `levels/index.ts` (see the `level-design` skill) |
| A new monster (stats, AI radii, role, guaranteed drops) | `src/game/defs/enemies/<roster>.ts` — one `EnemyDef` entry + sprites named after it (see the `enemy-design` skill) |
| A new weapon/gear piece or affix | `content/items/<rarity>/<id>.yaml` (one YAML per item, compiled by `make levels`; affixes/types stay in `src/game/defs/equipment.ts`) — forge it via the `weapon-system` skill; add its id to level loot pools |
| State shapes & events | `src/game/types.ts` (entities reference defs by id — keep it that way) |
| Level/entity setup | `src/game/create.ts` (seeded RNG only — no `Math.random`, determinism is what makes bugs reproducible) |
| Player-driven mutations (equip, stat allocation, phase toggles) | `src/game/items.ts` — safe to call from UI outside `step()` |
| Per-tick behavior | `src/game/step.ts` — one `stepX()` function per system, called in a fixed order documented at the top |
| Generic helpers (any game could use) | `src/lib/` — earmarked for oss-framework extraction |
| Public surface | `src/index.ts` — export new types/constants the app needs |
| Tests | `tests/engine/<system>_test.ts` (Vitest, `_test` suffix mandatory) — engine rules run on the synthetic fixtures (`tests/engine/fixtures.ts` via `registerDefs`), never on shipped content ids; content suites live in `tests/content/` |
| Drawing | `pwa/src/game/render.ts` (+ new sprites via the `pixel-assets` skill) |
| Sound | `pwa/src/game/sfx/` (+ the `sound-effects` skill) |
| HUD/overlay | `pwa/src/game/GameScreen.tsx` |

## Workflow

1. **Config first.** Add the system's tuning block to its module under
   `src/game/config/` (a new module for a new system, re-exported from the
   `index.ts` barrel), with units in the comments (world px, ms, hp). If you
   can't express the knob there, the design isn't ready.
2. **Types.** Extend `src/game/types.ts`. Anything the app must react to
   (sound, flash, particles) becomes a `GameEvent` variant — events are the
   ONLY channel from simulation to presentation. Events are cleared and
   refilled by every `step()`, so the app never misses or double-plays one.
3. **Simulate.** Implement `stepX(state, …)` in `src/game/step.ts` and slot
   it into the documented order inside `step()`. Mutate state in place;
   respect `phase !== "playing"` freezing. Keep per-tick allocation near
   zero (this runs 60×/s).
4. **Test headlessly** in `tests/engine/`: build a state with
   `createGame(SEED)` (fixtures installed via `registerDefs` — see
   `tests/engine/fixtures.ts`), surgically arrange entities, run fixed
   `step(state, input, 16)` loops, assert on state + events. Every rule you
   claim ("cooldown blocks the second hit") gets an assertion.
   `npx vitest run tests/engine/<file>` to iterate.
5. **Export** what the app needs from `src/index.ts`.
6. **Present.** Sprites via the `pixel-assets` skill; draw order and
   animation in `render.ts`; event → sound mapping via the `sound-effects`
   skill; HUD numbers in `GameScreen.tsx`.
7. **Playtest** with the `playtest` skill — numbers that look right in a
   test can still feel terrible at 60fps.

## Invariants to preserve

- `step()` must stay deterministic for (seed, input sequence, dt sequence) —
  no wall clock, no `Math.random`, no DOM.
- The engine imports nothing from `pwa/`; `@game/core` is the only
  direction of dependency.
- Docs: a public API change means updating `docs/architecture.md` and the
  README per the sync table in `AGENTS.md`; new config knobs go in
  `docs/configuration.md` if they're user-facing.
- Source files stay under 1000 lines — split by concern before the cap.

## Skill self-improvement

When a new system forces a pattern not covered here (status effects, timed
spawners, projectile-vs-projectile collision…), record where it landed and
why as a lesson fragment under `.lessons/` (see
[`../LESSONS.md`](../LESSONS.md)) — never by appending to this file, which
conflicts across parallel sessions. Read past ones with
`node scripts/skill-lessons.mjs engine-system` before starting. During a
consolidation pass, promote the proven lessons:

- **Workflow patterns** (a new kind of system, a new invariant, a testing
  technique) into this `SKILL.md`, phrased generically so any game
  benefits.
- **Game-specific pattern instances** (which catalog a system landed in, the
  tunings that worked, references to this game's levels/enemies) into
  [`GAME_NOTES.md`](./GAME_NOTES.md) next to this file. A sequel resets that
  file, not this one.
