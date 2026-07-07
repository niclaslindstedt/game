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

## Levels (`src/game/defs/levels.ts`)

- **Level 1 — SPACEZ HQ.** A cleanroom raid for the interplanetary drive's
  one missing ingredient. `spacez` biome (polished lab tiles + floor vents),
  ~800 px/s² gravity (hoppable desks and crates), rooms carved by `walls`
  with door gaps and two locked `doors` (storage, vault). The hero opens in
  plain clothes (`heroSuited: false`) and loots the EVA suit here.
- **Level 2 — THE MOON.** The beacon dies near the old flag. `moon` biome
  (regolith + gravel patches), ~340 px/s² gravity (jumps soar), moonrock
  ridge `walls` the haunting phases straight through.

## Enemy roster (`src/game/defs/enemies.ts`)

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
