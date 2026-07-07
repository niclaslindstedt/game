# Game content — _Gone in Space_

This document describes the **content** of the current game: its story,
levels, and enemy roster. It sits beside [`architecture.md`](./architecture.md),
which describes the engine that carries any content. A sequel **replaces this
file wholesale** — none of it is engine, all of it is data under
`src/game/defs/`.

## Premise

Ada went out for chips and soda on movie night and never came back — the
tracking beacon sewn into her jacket points off-planet. The hero, a
spaceship builder, raids SpaceZ for the drive ingredient, then follows the
beacon to the moon, where something is not dead enough. The prelude cutscene
(`defs/cutscenes.ts`) sets up that night; each level's `intro` text and its
elites' `dialogue` carry the thread forward.

## Levels (`src/game/defs/levels/`)

Each level is one file under `src/game/defs/levels/` (one `LevelDef` apiece),
merged and ordered by `levels/index.ts` (which owns `LEVEL_ORDER`). A level
names its in-run music with an optional `music` id (a key into the app's
`LEVEL_TRACKS` registry; omitted falls back to the default theme).

- **Level 1 — SPACEZ HQ** (`levels/spacez_hq.ts`). A cleanroom raid for the
  interplanetary drive's one missing ingredient. `spacez` biome (polished lab
  tiles + floor vents), ~800 px/s² gravity (hoppable desks and crates), rooms
  carved by `walls` with door gaps and two locked `doors` (storage, vault).
  The hero opens in plain clothes (`heroSuited: false`) and loots the EVA suit
  here. Music: `hq_lockdown` ("LOCKDOWN", a tense infiltration theme).
- **Level 2 — THE MOON** (`levels/moon.ts`). The beacon dies near the old
  flag. `moon` biome (regolith + gravel patches), ~340 px/s² gravity (jumps
  soar), moonrock ridge `walls` the haunting phases straight through. Music:
  `regolith_ride` ("REGOLITH RIDE", the heroic action theme).

### Campaign progression & what carries across levels

Each run is **standalone**: `createGame(seed, levelId, difficulty)` builds a
fresh state — the player starts back at level 1 stats with the plain blaster,
and nothing (XP, gear, inventory) carries between levels. The only thing
threaded across a session is the chosen **difficulty**. This is deliberate —
a survivors-style run is a self-contained arc — and stays this way unless the
story later demands a persistent loadout.

What the campaign _does_ persist is **completion**, on-device and per
difficulty (`website/src/game/progress.ts`): clearing a level records it, the
victory splash offers **NEXT LEVEL** (advancing along `LEVEL_ORDER` carrying
the difficulty), and the title menu's level-select screen (NEW GAME →
difficulty → level) unlocks the next level once its predecessor is cleared at
that difficulty. The `?level=` dev override bypasses the unlock gate.

Difficulty-exclusive content lives with the level that uses it: a `spawns` or
`waves.budget` line can carry an optional `minDifficulty`, and it only appears
from that rung of the ladder up (see `meetsMinDifficulty`).

## Enemy roster (`src/game/defs/enemies/`)

The roster is split one file per level/biome under `src/game/defs/enemies/`
(`spacez.ts`, `moon.ts`, …), merged into `ENEMY_DEFS` by `enemies/index.ts`
(which throws on a duplicate id).

- **Level 1** ships the SpaceZ night shift (intern → lab scientist →
  propulsion engineer → security guard → hazmat tech), four elites who know
  too much (THE NIGHT MANAGER, CHIEF OF SECURITY, DR. NOVA, THE JANITOR),
  plus MUSKRAT, the mutant rat under the prototype rocket (the boss).
- **Level 2** ships wisp → moon ghost → wraith, four ghost elites (MISSION
  SPECIALIST, THE PROSPECTOR, QUARANTINE MEDIC, THE CARTOGRAPHER), plus
  ARMSTRONG, the giant astronaut ghost guarding the flag (the boss).

Every unique mob (elite/boss) carries `dialogue` played on arrival and
`lastWords` played as it dies; minions are the nameless horde streamed in by
each level's `waves` spawner.

## Story items & costume

Plot pieces (`src/game/defs/story.ts`) — keycards that open the locked doors,
the recovered anti-grav unit — bank into `state.storyItems` and play their
`lore`. The EVA space suit is looted gear (`spacesuit`); once worn, the
player's `playerAppearance` flips from the plain-clothes `hero` sprites to
the astronaut `player` sprites.
