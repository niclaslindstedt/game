# engine-system — game-specific notes

Accumulated pattern instances for **this** game. The workflow and invariants
live in `SKILL.md`; this file is the log of how each system landed here. A
sequel truncates this file to a stub and rebuilds it as its own systems land.

## Pattern log

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
- **Cutscenes (2026-07, the prelude):** the beat-machine player is GENERIC
  (`src/lib/cutscene.ts`, deterministic, no RNG); scenes are data in
  `defs/cutscenes.ts`; a level opts in via `LevelDef.prelude`. The run
  opens in a `cutscene` phase advanced by `step()` on the sim clock (world
  frozen), with `tapCutscene`/`skipCutscene` mutators beside `dismissIntro`.
  Iteration tooling lives app-side: the `?cutscene=<id>` workbench + the
  beat-screenshot harness (`website/scripts/cutscene-preview.mjs`).
- **Deliberate architecture (2026-07, SPACEZ HQ walls):** hand-placed
  geometry is `LevelDef.walls` — segments expanded at creation into chains
  of overlapping obstacle circles (`buildWalls` in create.ts), so walls
  reuse ALL existing obstacle collision/AI/spawn-avoidance for free. Door
  gaps are part of the level data; scattered obstacles keep their spacing
  from walls, and walls skip the scatter clearance rules on purpose.
- **Def-driven rendering (2026-07):** decor/obstacle/landmark entities carry
  a resolved `sprite` name (landmarks also an `anchor`), the ground comes
  from a per-level `tiles` spec, and the player costume from
  `playerAppearance(state)` — so a new level/kind/biome/costume is data, not
  a `render.ts` edit.
- **Engine-rule tests pin the moon (2026-07):** `helpers.startGame`
  defaults to `"moon"` — the reference level the tuning suites were
  calibrated against — and skips any prelude first. Level-specific suites
  (`tests/spacez_test.ts`) pass their own id; `createGame()`'s real default
  (`LEVEL_ORDER[0]`) is covered there.
