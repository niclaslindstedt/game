---
name: engine-system
description: "Use when adding or changing a gameplay system (enemy type, weapon, item, movement rule, win condition, spawning…). Walks the engine-first workflow: tune config, extend types/state, implement in the step pipeline, emit events, test headlessly, then wire rendering and sound in the app layer."
---

# Adding a Gameplay System

Gameplay lives in the **engine** (`src/`, framework-free TypeScript); the
**app** (`pwa/`) only draws state and reacts to events. Keep that
direction: the engine never knows a renderer or a speaker exists. This is
what makes every game rule unit-testable in plain Node.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs engine-system --list`,
then the ones this task touches (`--scope=…`, `--concepts=…`). Reading them here and
reflecting on them before the commit is the **`skill-reflection`** skill's job — load
it at both ends of the session.

## Where the pieces go

| Piece | File |
| --- | --- |
| GLOBAL tuning (player, XP curve, stat effects, loot rules) | `src/game/config/` — cross-level knobs only, one module per system |
| A new level (geometry, gravity, intro, spawns, objective, loot table) | `src/game/defs/levels/<id>.ts` — one `LevelDef` module, registered in `levels/index.ts` (see the `level-design` skill) |
| A new monster (stats, AI radii, role, guaranteed drops) | `src/game/defs/enemies/<roster>.ts` — one `EnemyDef` entry + sprites named after it (see the `enemy-design` skill) |
| A new weapon/gear piece or affix | `content/items/<rarity>/<id>.yaml` (one YAML per item, compiled by `make levels`; affixes/types stay in `src/game/defs/equipment.ts`) — forge it via the `weapon-system` skill; add its id to level loot pools |
| State shapes & events | `src/game/types/` (one module per concern — entities reference defs by id, keep it that way) |
| Level/entity setup | `src/game/create.ts` (seeded RNG only — no `Math.random`, determinism is what makes bugs reproducible) |
| Player-driven mutations (equip, stat allocation, phase toggles) | `src/game/items/` (split by concern behind `index.ts`) — safe to call from UI outside `step()`, but reach them through `src/game/commands.ts` (`applyRunCommand`) so a multiplayer client can run them too |
| Per-tick behavior | `src/game/step/` — one `stepX()` function per system, each in its own module, called in a fixed order documented at the top of `index.ts` |
| Generic helpers (any game could use) | `src/lib/` — the pool a later game keeps as-is |
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
2. **Types.** Extend `src/game/types/`. Anything the app must react to
   (sound, flash, particles) becomes a `GameEvent` variant — events are the
   ONLY channel from simulation to presentation. Events are cleared and
   refilled by every `step()`, so the app never misses or double-plays one.
3. **Simulate.** Implement `stepX(state, …)` in the matching module under
   `src/game/step/` (a new module for a new system) and slot
   it into the documented order inside `step()` (`src/game/step/index.ts`). Mutate state in place;
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

## Composition — a power, and a talent's procs

**A POWER IS A COMPOSITION OF EFFECTS, AND THE EFFECT LIBRARY HAS TWO
CARRIERS.** `AbilityDef.kind` is a LABEL, never a dispatch key: it names the
effect a power leads with (for the surfaces that need one word for a whole
power — the dock, the bot's valuation, the ONE NUKE loot rule) while the engine
steps and the app draws whichever effect BLOCKS are present. So a def carrying
`trail` and `immolation` does both, and a mod can build a power the shipped
catalog has no equivalent of without the engine growing a member per idea.
Read `abilityBlocks(def)`, never `def.kind`, anywhere a power's BEHAVIOUR is
being judged. Composition is why `ActiveAbility.clocks` is keyed per block: one
shared cooldown was safe only while every def carried exactly one block, and
the moment one carries two, an orbit's bite resets a storm's strike timer.

The effects themselves live ONCE, in `src/game/ability-effects.ts`, because a
powerup and a GRANTED SPELL (the `spell` affix on gear, and the magic tree's
`conjure` talents) were two implementations of the same six things — same ring,
same prefilter, same `hitEnemy` path, in two files drifting apart. A carrier
supplies only what genuinely differs: where the numbers come from (a flat
authored block vs a rank curve that INT quickens — `<kind>SpellBlock` returns
the very block shape the YAML authors), the scratch, and the BILLING (a
powerup's output is exempt from the menace meter; a granted spell's heats it
like a weapon blow). Adding an effect means one function there plus a block on
`AbilityDef` plus its entry in `KIND_BLOCKS` — and both carriers get it.

**A POWER OWNS ITS LOOK AND ITS SOUND, because otherwise a mod's power can only
look and sound like whichever shipped power shares its effect.** The colour kit
is `AbilityDef.look` — authored in `content/powerups.yaml` beside the numbers it
colours, not in the app — and it is what makes two powers sharing an effect read
as different things (the DUST DEVIL and the EVENT HORIZON are both nothing but a
`well`). `pwa/src/game/powerup-fx.ts` is now only the accessor and the neutral
default an un-styled power falls back to. `AbilityDef.sfx` is the same idea for
audio, on the same seam `WeaponDef.sfx` rides: the id travels on the event and
the sound bus tries it before the event's own key. A burst carries its power's
kit onto the `Effect` (via the event's `defId`), so a mod's rain lands in its own
colours rather than in MOONFALL's grey.

The Workshop itself is the same three-file seam as cloud save and the
achievements: `electron/src/workshop.ts` is the ONLY module that knows Steam
exists, `electron/src/mods.ts` is the bridge above it, and what is uploaded is
the **authored folder**, not a compiled bundle, so a published mod stays
readable and forkable the way the game's own content is. The BUILD SYSTEM travels too: the three passive TALENT trees are
`content/talents.yaml`, so a conversion's hero no longer grows this game's
Warlord / Windrunner / Archon — and, because a talent's structured PROCS carry
their own numbers on the def and are found BY BLOCK rather than by id, a mod's
talent can fire one with its own tuning (one carrier per proc, checked over
base ∪ mod). Two things a mod may
NOT author, and both refusals are deliberate: a `grades:` ladder (minted at
engine load from a catalog compiled into the build, so there is no runtime seam
to add to) and the loot economy itself (`item_quality.yaml`/`item_rarity.yaml` —
a mod that moved the tier ladder would be rebalancing the campaign rather than
adding to it). A CONVERSION may also rename the game itself on the title screen
(`brand:` in its manifest) — the screen only, never the storage prefix, the
precache id or any discovery surface, and never for an addon. **THE COMPILER SHIPS OUTSIDE THE ASAR**, in a tree that MIRRORS
the repo's layout under `resources/modtools/` (`extraResources` in
`electron-builder.config.cjs`, resolved by `electron/src/resources.ts`): every
module in it finds its neighbours by relative path, so a flattened copy resolves
to nothing, and `yaml` has to travel with it because a package inside the asar
is not resolvable from a module outside it. Every `scripts/` directory the
compiler imports has to be listed there — a missing one is a mod that compiles in
the repo and fails on a player's machine with a resolve error, which is what
`tests/content/mod_toolchain_deps_test.ts` now walks the import graph to prove.


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

Load the **`skill-reflection`** skill at both ends of the session — it owns
recording what a pass learned (with a `scope` and `concepts`), fixing anything
here the pass proved WRONG, pruning the stale, merging the duplicated, and
promoting the always-true. When a new system forces a pattern not covered here
(status effects, timed spawners, projectile-vs-projectile collision…), record
where it landed and why. Promotion here has TWO destinations:

- **Workflow patterns** (a new kind of system, a new invariant, a testing
  technique) into this `SKILL.md`, phrased generically so any game
  benefits.
- **Game-specific pattern instances** (which catalog a system landed in, the
  tunings that worked, references to this game's levels/enemies) into
  [`GAME_NOTES.md`](./GAME_NOTES.md) next to this file. A sequel resets that
  file, not this one.
