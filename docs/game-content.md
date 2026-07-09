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
cutscene (`defs/cutscenes.ts`) sets up that night — the weapon hanging on
the living-room wall is the one thing he takes off it to go after her, and it
is the weapon he starts the game with. WHICH weapon hangs there is the chosen
difficulty's call (`DifficultyDef.startingWeapon`, mirrored by a
per-difficulty prelude variant so the wall always shows the run's actual
starter): HAIRY POTTER'S WAND on EASY, the MEDIEVAL SWORD on MEDIUM, the
COMBAT KNIFE on HARD, BRASS KNUCKLES on NIGHTMARE, and A STICK on JESUS
CHRIST!. Each level then opens on the hero's
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
- **Level 4 — THE RIFT** (`levels/rift.ts`). The hero follows MOSQUE through
  the tear: a hallucinatory space between universes. `rift` biome — void
  tiles (star-flecked indigo nothing) with nebula patches; there is no
  ground, the boots just grip something that isn't there. ~200 px/s² gravity
  (dreamy between-universe glides, floatier than the moon). The level debuts
  both **environmental hazard systems**: seven **black holes**
  (`LevelDef.wells` → the engine's gravity wells: they drag the grounded
  player, devour minions at the core, burn the player standing in one, and
  hoard dragged loot on the event horizon — a jump sails clean over the
  pull) and the **asteroid rain** (`LevelDef.asteroids`: rocks streak across
  the player's surroundings on a rolled cadence, take a difficulty-scaled
  bite of the hero's health on contact — once per rock, from 20% on EASY up
  to 75% on JESUS — shove minions aside, and are dodged with the feet or a
  jump; the first strike pauses for the hero's "watch out for these" read).
  Crystallized **rift shards** block sight and shots; drifting **space
  junk** is hoppable cover; lost TVs and floating rocks decorate the
  nothing. The far door — a second rift at the east end — is where the
  tribute went and where MOSQUE flees again. Music: `rift_drift` ("RIFT
  DRIFT", a weightless lydian float).

### Campaign progression & what carries across levels

The hero's progress **carries through the campaign**. On the opener he
starts at level 1 with the difficulty's starting weapon (the piece off the
hero's wall in the prelude; it carries durability and wears out, so the
run's first job is to scavenge a replacement — and any looted weapon
auto-supplants the wall piece). The gentler rungs also bank a few
pre-allocated stat points (`DifficultyDef.startingStats`). Clearing a level banks a
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
survival time, kills, player level reached, and a full end-of-run session
snapshot; the end-of-run screen shows that difficulty's best survival time, and
the menu's **HIGH SCORES** board ranks the runs four ways (survival time,
kills-per-minute, mobs killed, level reached) and opens any banked run into a
detail card of the whole session.

Clearing a level also mints a **LEVEL TOKEN** for it at that difficulty
(`website/src/game/progress.ts`). A token is spent — once, it can't be used
again — to unlock the **same level at a higher difficulty** ahead of the
campaign there: the fast lane into the harder rungs' richer loot (their
tier/unique bonuses), while playing the difficulties in order remains the
full-reward path. The title menu surfaces it: a rung with a spendable token
opens its mission list ("LEVEL TOKEN READY"), and the locked mission shows
"SPEND THE <RUNG> LEVEL TOKEN" in gold. A token jump carries the hero's
loadout from the highest lower rung that banked one (mobs scale relative to
his level either way, via the difficulty's `mobLevelOffset`), and the unlock
persists — dying doesn't revoke it; a spent token is re-minted only by
re-clearing the level.

Because the jump drops the carried build into a tougher rung, spending a
token also hands the hero a **respec**: once the intro clears, the whole
banked build is refunded into a single pool and the run freezes on a
Diablo-style attribute screen (the `respec` phase, engine `beginRespec` →
`RespecOverlay`) where every point is re-placed from scratch — points move
both ways (`allocateStat` / `deallocateStat`) until CONFIRM commits the build
(`confirmRespec`). Only the token-jumped level respecs; advancing to the next
level does not.

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
  The hero walks in with his weapon **holstered** (`LevelDef.openingStrike` —
  `player.disarmed`): the auto-attack sits out until a lone VANGUARD scientist
  sprints ahead of the pack and lands a harmless first swing, which draws
  whatever he took off the wall ("good thing I came armed") and turns combat
  on. Two
  sight-pinned inner monologues also fire here (`firstSightThoughts` — on view,
  before any blow): the first intern the hero SEES plays his arrival read on a
  building fully staffed at midnight, and the first OPTIMUSK he SEES plays the
  personal one — he helped build the first unit before the AI redrew the line
  and it took everyone's jobs, his included.
- **Level 2** ships wisp → moon ghost → wraith and the OPTIMUSK robots SpaceZ
  shipped up to garrison the moon (the same heavy from level 1, now laced
  through the haunting) — four ghost elites (MISSION SPECIALIST, THE
  PROSPECTOR, QUARANTINE MEDIC, THE CARTOGRAPHER), plus ARMSTRONG, the giant
  astronaut ghost guarding the flag (the boss). The haunting reads in two
  ordered player thoughts — sighting the first wisp, then downing one (the
  kill beat's `after` gate holds it until the sighting has played) — and the
  first OPTIMUSK kill is its own beat (`firstSightThoughts` /
  `firstKillThoughts` → `THOUGHT_DEFS`, played through the dialogue box in
  the hero's own voice).
  ARMSTRONG's boss scene ends the moon pointing at Mars: the moon was SpaceZ's
  disastrous mistake, and everything rides the red freight run out.
- **Level 3** ships the colony's machines — scout rover (fodder) → servo unit
  → FEMBOT (the quick, high-crit companion line) → mining rover (the outdoor
  heavy with a sweetened `dropProfile`), plus the OPTIMUSK garrison carried
  over — four elites: three tech billionaires (LARRY WEBPAGE, BUILD GATES,
  PETER SEAL) and OPTIMUSK PRIME, the robot foreman orchestrating the
  OPTIMUSK line (it drops the PROMPT INJECTOR and the ORG CHART, whose
  dotted line points back to the level-1 CORE), and ELON MOSQUE, the boss
  who **flees instead of dying**
  (`EnemyDef.flees`): at 0 hp he still pays XP and his guaranteed drops and
  gasps his parting words, but the engine books a `bossFled` event (never a
  kill) and leaves a `rift` landmark on the board; a `killBoss` objective
  still clears. First-kill thoughts fire for the scout rover (the tire
  tracks) and the fembot (the hero's flustered inner monologue).
- **Level 4** ships the void's fauna — VOIDLING (fodder scraps of hungry
  dark) → STAR JELLY (a phasing translucent drifter) → UNRAVELER (a fast,
  high-crit glitch with an elevated `dodgeChance`) → GRAVITON (the slow
  collapsed-star heavy with a sweetened `dropProfile`) — and **history's
  missing** for uniques: everyone who ever vanished without a body fell in
  here. Three fight as elites with signature drops — NIKOLA TESLA (drops the
  TESLA COIL and the WARDENCLYFFE NOTES), AMELIA EARHART (saw Ada carried
  through to the far door; drops the AVIATOR GOGGLES), and GRIGORI RASPUTIN
  (the unkillable mystic: `dodgeChance` 0.35, drops RASPUTIN'S BEARD) — and
  two are the game's first **APPARITIONS** (`EnemyDef.apparition`): HARRY
  HOUDINI and THE KING are dialogue-only figures nothing can hit, whose
  touch is cold air, and who walk off and dissolve after their scene
  (`apparitionVanished`). The finale is a double bill: **GROK OMEGA** — ZAI's
  latest superintelligence, a hovering monolith with one enormous eye — is
  the level's reveal (IT found the rift, in secret, and told precisely no
  one: not the board, not the world's presidents; MOSQUE only knew from
  snooping its logs, and sold the secret to his lizards for a planet). It
  dies for real and drops the SINGULARITY CANNON. Then at the far door ELON
  MOSQUE, beaten a second time, **flees again** (`elon_mosque_rift`, same
  sprite, same coward) through the rift's far side — destination unknown
  until the next level — dropping the GOLDEN PARACHUTE. The objective needs
  BOTH bosses off the board. First-sight/kill thoughts fire for the voidling
  (the walking-on-nothing arrival read) and the graviton.

Every unique mob (elite/boss) carries `dialogue` played on arrival and
`lastWords` played as it dies; minions are the nameless horde streamed in by
each level's `waves` spawner. A level can also pin a **player thought** to a
kill or a sighting: `LevelDef.firstKillThoughts` maps an enemy id to a
`THOUGHT_DEFS` entry that plays once, the first time the hero downs that enemy
there, and `LevelDef.firstSightThoughts` does the same the first time one
comes within `DIALOGUE.sightRadius` — the same dialogue box, but in the hero's
own voice and portrait (a `playerThought` dialogue source) instead of a
speaker on the board. A trigger can name a prerequisite thought (`after`) that
holds it, unspent, until that thought has played — how a two-part beat (see
the wisp, then down one) keeps its reading order.

## Story items & costume

Plot pieces (`src/game/defs/story.ts`) — keycards that open the locked doors,
the recovered anti-grav unit — bank into `state.storyItems` and play their
`lore`. The EVA space suit is looted gear (`spacesuit`); once worn, the
player's `playerAppearance` flips from the plain-clothes `hero` sprites to
the astronaut `player` sprites.
