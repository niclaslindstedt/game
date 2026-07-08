# Game content — _Gone in Space_

This document describes the **content** of the current game: its story,
levels, and enemy roster. It sits beside [`architecture.md`](./architecture.md),
which describes the engine that carries any content. A sequel **replaces this
file wholesale** — none of it is engine, all of it is data under
`src/game/defs/`.

## Premise

Ada went out for chips and soda on movie night and never came back — the
tracking beacon sewn into her jacket points off-planet. The hero, a
spaceship builder who once worked at SpaceZ until an AI replaced him — so he
knows the building cold — raids SpaceZ for the drive ingredient, then follows
the beacon to the moon, where something is not dead enough. The prelude
cutscene (`defs/cutscenes.ts`) sets up that night — the crude sword hanging on
the living-room wall is the one thing he takes off it to go after her, and it
is the weapon he starts the game with. Each level then opens on the hero's
`intro` monologue (a black-screen dialogue, one page at a time, the hero
standing above the box) before the level-name card drops the run in, and its
elites' `dialogue` carry the thread forward. Skipping the prelude skips the
monologue too.

## Levels (`src/game/defs/levels/`)

Each level is one file under `src/game/defs/levels/` (one `LevelDef` apiece),
merged and ordered by `levels/index.ts` (which owns `LEVEL_ORDER`). A level
names its in-run music with an optional `music` id (a key into the app's
`LEVEL_TRACKS` registry; omitted falls back to the default theme).

- **Level 1 — SPACEZ HQ** (`levels/spacez_hq.ts`). A cleanroom raid for the
  interplanetary drive's one missing ingredient. `spacez` biome (polished lab
  tiles + floor vents), ~800 px/s² gravity (hoppable desks and crates), rooms
  carved by `walls` with door gaps and three locked `doors` (storage, vault,
  and the AI CORE — THE ARCHITECT's keycard opens the last). The hero opens in
  plain clothes (`heroSuited: false`) and loots the EVA suit here. Music:
  `hq_lockdown` ("LOCKDOWN", a tense infiltration theme).
- **Level 2 — THE MOON** (`levels/moon.ts`). The beacon dies near the old
  flag. `moon` biome (regolith + gravel patches), ~340 px/s² gravity (jumps
  soar), moonrock ridge `walls` the haunting phases straight through. Scattered
  **moonrock** slabs (1×1/1×2/2×2 rectangular obstacles) wall off sight, shots
  and even a nuke's blast — cover against SpaceZ's grounded robots, useless
  against the phasing dead — while jumpable **craters** are gaps the player
  hops (landing on the near lip when short) but the horde must route around.
  Music: `regolith_ride` ("REGOLITH RIDE", the heroic action theme).
- **Level 3 — MARS** (`levels/mars.ts`). The trail from the moon: SpaceZ wrote
  the moon off as a disaster and moved everything — Ada included — to a secret
  colony. `mars` biome, ~520 px/s² gravity. The level TRANSITIONS mid-map: red
  regolith with oxide-gravel patches on the western desert half, and the first
  use of **tile zones** (`TileSpec.zones`) swaps everything east of the dome
  wall to the base's deck plating. The dome wall (two airlock gaps) and an
  interior divider carve the base into chambers; the **TERRARIUM** — a locked
  lizard-shrine room in the SE corner — opens with PETER SEAL's keycard and
  holds the TRIBUTE SCHEDULE. Scattered **marsrock** slabs and red craters
  mirror the moon's cover rules. The boss doesn't die: ELON MOSQUE **flees**
  at 0 hp (the engine's `EnemyDef.flees`), leaving a **rift** landmark where
  he vanished — the doorway the story follows next. Music: `red_dust` ("RED
  DUST", a galloping desert-western drive).

### Campaign progression & what carries across levels

The hero's progress **carries through the campaign**. On the opener he
starts at level 1 with the CRUDE SWORD (the melee blade off the hero's wall
in the prelude — his default weapon; it carries durability and wears out, so
the run's first job is to scavenge a replacement). Clearing a level banks a
**loadout snapshot** — his level, stats, worn equipment, bag, and pocketed
powerups (`extractLoadout`, persisted per difficulty by
`website/src/game/progress.ts`) — and starting the next level hands it back
to `createGame(seed, levelId, difficulty, loadout)`, which dresses the run
in it (`applyLoadout` in `src/game/arrival.ts`): ids re-minted, bag re-sized
to the carried STRENGTH, and the hero arriving rested (full health/stamina,
plating fastened). A **dev jump** to a mid-campaign level with nothing
banked (`?level=`, playtest bots, wiped storage) falls back to
`deriveArrivalLoadout` — a realistic stand-in derived from the earlier
levels' rosters (every mob's XP through the real leveling curve, discounted
by config `ARRIVAL.clearShare`; stat points auto-spent round-robin; the
previous level's signature weapon, issue gear, and a couple of its powerups)
— so testing Mars means arriving with roughly what a moon clear would have
banked. Losing a run never erases the banked loadout: retry restarts the
level with the same carry-over.

What the campaign _does_ persist is **completion**, on-device and per
difficulty (`website/src/game/progress.ts`): clearing a level records it, and
the victory splash offers **NEXT LEVEL** (advancing along `LEVEL_ORDER`
carrying the difficulty). A first-timer is walked through the story in order —
choosing a difficulty (NEW GAME → difficulty) drops them straight into the
next unbeaten level, no picker. Only once the whole campaign is cleared at a
difficulty does the title menu's **level-select** screen open, as a replay
picker. The `?level=` dev override bypasses the gate entirely. Every finished
run is banked per difficulty (`website/src/game/highscores.ts`) with its
survival time, kills, and a full end-of-run session snapshot; the end-of-run
screen shows that difficulty's best survival time, and the menu's **HIGH
SCORES** board ranks the runs two ways (survival time, kills-per-minute) and
opens any banked run into a detail card of the whole session.

Difficulty-exclusive content lives with the level that uses it: a `spawns` or
`waves.budget` line can carry an optional `minDifficulty`, and it only appears
from that rung of the ladder up (see `meetsMinDifficulty`).

## Enemy roster (`src/game/defs/enemies/`)

The roster is split one file per level/biome under `src/game/defs/enemies/`
(`spacez.ts`, `moon.ts`, …), merged into `ENEMY_DEFS` by `enemies/index.ts`
(which throws on a duplicate id).

- **Level 1** ships the SpaceZ night shift (intern → lab scientist →
  propulsion engineer → security guard → hazmat tech) reinforced by OPTIMUSK
  units — humanoid robots that are not story uniques but hit far harder and
  tank far more than any of the staff, and pay out a sweetened drop roll
  (`dropProfile`) when downed; five elites who know too much (THE NIGHT
  MANAGER, THE ARCHITECT, CHIEF OF SECURITY, DR. NOVA, THE JANITOR), plus
  MUSKRAT, the mutant rat under the prototype rocket (the boss). THE ARCHITECT
  is the hero's old bench partner, now brainwashed into building SpaceZ's
  superintelligence; he begs off the plea to quit ("humans are obsolete") and
  drops the **PASSAGE CHIP** he cut into his own skull — a passive `+1 INT`
  trinket that pays out while it merely rides in the bag (`GearDef.passive`).
  The first intern the hero downs fires a one-time inner monologue — his
  arrival read on a building fully staffed at midnight ("good thing I brought
  the sword").
- **Level 2** ships wisp → moon ghost → wraith and the OPTIMUSK robots SpaceZ
  shipped up to garrison the moon (the same heavy from level 1, now laced
  through the haunting) — four ghost elites (MISSION SPECIALIST, THE
  PROSPECTOR, QUARANTINE MEDIC, THE CARTOGRAPHER), plus ARMSTRONG, the giant
  astronaut ghost guarding the flag (the boss). First-kill thoughts fire for
  the wisp (the hero's arrival read on the haunting) and the OPTIMUSK
  (`firstKillThoughts` → `THOUGHT_DEFS`, played through the dialogue box in
  his own voice).
  ARMSTRONG's boss scene ends the moon pointing at Mars: the moon was SpaceZ's
  disastrous mistake, and everything rides the red freight run out.
- **Level 3** ships the colony's machines — scout rover (fodder) → servo unit
  → FEMBOT (the quick, high-crit companion line) → mining rover (the outdoor
  heavy with a sweetened `dropProfile`), plus the OPTIMUSK garrison carried
  over — three tech-billionaire elites (LARRY WEBPAGE, BUILD GATES, PETER
  SEAL), and ELON MOSQUE, the boss who **flees instead of dying**
  (`EnemyDef.flees`): at 0 hp he still pays XP and his guaranteed drops and
  gasps his parting words, but the engine books a `bossFled` event (never a
  kill) and leaves a `rift` landmark on the board; a `killBoss` objective
  still clears. First-kill thoughts fire for the scout rover (the tire
  tracks) and the fembot (the hero's flustered inner monologue).

Every unique mob (elite/boss) carries `dialogue` played on arrival and
`lastWords` played as it dies; minions are the nameless horde streamed in by
each level's `waves` spawner. A level can also pin a **player thought** to a
kill: `LevelDef.firstKillThoughts` maps an enemy id to a `THOUGHT_DEFS` entry
that plays once, the first time the hero downs that enemy there — the same
dialogue box, but in the hero's own voice and portrait (a `playerThought`
dialogue source) instead of a speaker on the board.

## Story items & costume

Plot pieces (`src/game/defs/story.ts`) — keycards that open the locked doors,
the recovered anti-grav unit — bank into `state.storyItems` and play their
`lore`. The EVA space suit is looted gear (`spacesuit`); once worn, the
player's `playerAppearance` flips from the plain-clothes `hero` sprites to
the astronaut `player` sprites.
