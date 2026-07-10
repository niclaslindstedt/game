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
  plain clothes (`heroSuited: false`) and recovers the EVA suit here. Music:
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
powerups (`extractLoadout`, banked onto the playing **character** by
`website/src/game/characters.ts`) — and starting the next level hands it back
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

The **loot is Diablo-shaped, and each level introduces its own base
weapons** (`LevelDef.loot.weaponPool`, six per level at stepped level
requirements — two melee, two ranged, two magic, so a melee, ranged, or
caster build all find a steady climb): SpaceZ HQ scavenges earthly arms
(BOX CUTTER, SECURITY BATON, 9MM PISTOL, PROTOTYPE LASER, MICROWAVE
EMITTER, PUMP SHOTGUN), the moon yields the 70s hardware the space race
ferried up (LUNAR WRENCH, SERVICE REVOLVER, GEOLOGY HAMMER, SURPLUS
CARBINE, RETRO RAYGUN, PULSAR ROD), Mars prints AI-forged weapons (SMART
PISTOL with homing darts, PLASMA BLADE, piercing RAILGUN, chain-lightning
ARC PROJECTOR, GRAVITON MAW, GRAVITY MAUL), and the rift rains history and
fantasy (GLADIUS, LONGBOW, BLUNDERBUSS, EXECUTIONER'S AXE, SORCERER'S
STAFF, EMBER WAND — plus the rift-only fantasy gear: LUCKY CLOVER, CRYSTAL
ORB, GRIMOIRE, ENCHANTED RING, DRAGONSCALE CLOAK). A base only drops from
monsters whose LEVEL has reached its requirement, tiers unlock by monster
level (config `LOOT.tierUnlockMlvl`), and every drop carries an item level
near its killer's (plus the difficulty's `lootIlvlBonus` on the harder
rungs) that sizes its affixes — see the `weapon-system` skill for the full
economy and its tuning tools.

Every weapon deals its damage as a **range**, not a fixed number: each
blow rolls inside a band around the catalog average (config
`WEAPON.damageVariance`, ±20% by default; a def may widen its own with
`damageVariance`), so a weapon written at 10 hits for ~8–12 and a crit off
it lands higher still. Chaotic pieces roll wide for the fun of it — the
BLUNDERBUSS (±50%) and the SINGULARITY CANNON (±55%) swing for the
fences — while precision tools (the SMART PISTOL, the RAILGUN) hold a
tight ±10%. The average is unchanged, so the whole damage-budget model is
untouched; the spread is rolled off a separate `fxRng` flavor stream so it
never perturbs loot rolls.

Two more axes complete the item tables (`src/game/defs/grades.ts`, config
`QUALITY`). **Base grades**: every pool weapon and armor piece exists in
three versions, D2-style — the NORMAL base, an **EXCEPTIONAL** version
(requirements 25–52), and an **ELITE** version (requirements 55–100) — same
look, renamed (GLADIUS → SPATHA → FALCATA; CHAINMAIL HAUBERK → LINKED MAIL
→ TIGULATED MAIL), with damage re-derived on the damage-budget line and
armor grown along the ilvl curve plus a native edge. The upgraded versions
are GENERATED from the normal defs and folded into each level's pool at
roll time, so the drop economy keeps introducing new bases to level 100
without the level defs naming them. **Make quality**: every PLAIN
(regular-tier) weapon/armor drop also rolls the craftsmanship of the
individual piece — BROKEN → CRUDE → NORMAL → SUPERIOR → PERFECT — which
scales its damage/armor/durability and merchant value (config
`QUALITY.mults`) and leads its name. The odds slide with the killer's
monster level (`QUALITY.weightsLow/High`): the level-1 rank and file drop
mostly shabby make, the deep campaign pays out superior and perfect work.
Craftsmanship and magic are exclusive, the D2 rule — a magic-or-better
find is always normal make, as are charms and bags; scripted story drops
(a level's `earlyDrops`) are pinned normal so the opening plays as tuned.

Above the rolled tiers sit the **named UNIQUES** (`src/game/defs/uniques.ts`):
hand-authored drops with a FIXED bonus block on a chosen base — no rolled
affixes, only a small ±10% band on the base damage/armor
(`UNIQUE.baseRollBand`) so two copies differ and a better roll is worth
chasing. Each is tied to a boss and a difficulty rung
(`EnemyDef.uniquesByDifficulty`) and gated to it — an easy unique only drops
on easy — at `UNIQUE.dropChance × mlvl/ilvl` (≈5% at its home rung, capped),
so boss runs are the endgame and nothing is guaranteed. The 35 span the five
bosses × five difficulties as a slot Latin square: every rung is the home of
one full weapon-and-armor set (a weapon plus a head/chest/legs/feet piece,
one per boss), and MUSKRAT also drops that rung's roomier **bag** while GROK
OMEGA drops its **charm** — seven uniques per difficulty. Their ilvl scales
power and drop odds, not the equip requirement (that stays the base item's
`levelReq`, like any tier), so a unique is wearable well below its ilvl — the
D2 "found it early, grow into it" feel. A few carry ONE small scaling stat
(`statPct`/`maxHpPct`, ≤3% of the hero's own value) so they keep pace as the
hero levels; the rest are best-in-slot for ~10 levels before a rolled rare
overtakes them.

A second breed of unique — **level-locked WORLD DROPS** — hangs on the LEVEL
rather than a boss (`LevelDef.loot.worldUniques`, config `WORLD_DROP`). Any
enemy on the relic's home level can drop it, but at odds set purely by the
enemy's **role**: a trash minion is a 0.015% long shot, an elite ~2%, the boss
a fat 10% single kill — so across a whole ~1,200-mob floor the chance amasses to
roughly 30%, yet one fast **boss run** is by far the best drops-per-minute. The
table stays shut until the hero passes `WORLD_DROP.minPlayerLevel[difficulty]` —
a PER-RUNG gate sized a few levels above where a first pass of that difficulty
ends (easy 20, medium 34, hard 46, nightmare 56, jesus 60; see `leveling-curve.mjs
--by-level`), so a rung's relics can only be farmed by RETURNING for boss runs
once that difficulty is beaten. The first batch is the EASY rung, one relic themed to each level
— **THE FIRST DRAFT** (SpaceZ HQ, the prototype-GROK neural crown), **THE PALE
COVENANT** (the Moon, the last moonwalker's sealed plate), **DUSTBORN** (Mars,
storm-runner boots) — plus two on the Rift, which, being a tear in history,
coughs up **EXCALIBUR** and **THE TRINITY SHARD** (trinitite glass).

The MEDIUM rung adds a mid-campaign batch, a notch stronger: **DEADSPRINT**
(SpaceZ HQ, up-or-out glass-cannon leggings), **MARECREST** (the Moon, the
vigil-helm that outlasted the silence), **REDWIND** (Mars, the frontier raygun
that drinks the red storm) — and three more from the Rift's deeper haul:
**WISHBANE** (a cursed-wish charm), **GORGONSCALE** (Athena's gorgon-faced
aegis), and the game's first **LEGENDARY**, **MJÖLNIR** — the thunder-hammer of a
dead god, minted one rarity rung above every unique (`UniqueDef.tier:
"legendary"`: the orange card and densest pickup blaze), unbreakable and
keepsake-worthy like any unique but with a scaling strength keeper that grows
into best-in-slot.

Alongside the weapon, the hero wears **four ARMOR slots — head, chest,
legs, feet — plus a charm and a bag** (seven equip slots). Every armor
piece carries flat **armor points** that sum into a physical damage
reduction judged against the attacker's level (`armor / (armor + 40 + 12 ×
level)`, capped at 75% — config `ARMOR`), so a set that turns a third of
every blow decays as the horde outlevels it, WoW-style; a rolled instance
grows its base armor with its item level (`ARMOR.armorPerIlvl`), so deep
drops genuinely out-arm early ones. Armor **wears**: each landed hit costs
every worn piece a durability point, and a piece at zero goes INACTIVE —
still worn, contributing nothing — until a repair kit (which now mends
weapon and wardrobe together) restores it. Each level drops its own
wardrobe, cut from the same cloth as its weapon pool: HQ's office/security
kit (BASEBALL CAP → RIOT HELMET, LAB COAT, KEVLAR VEST, STEEL-TOE BOOTS),
the moon's 70s program surplus (MISSION CAP, APOLLO VISOR, FLIGHT JACKET,
MICROMETEOROID VEST, MOON BOOTS), Mars's AI-printed shells (TARGETING
MONOCLE, NEURAL VISOR, PRINTED HELM, NANOWEAVE PLATE, AEGIS EXOPLATE, MAG
BOOTS), and the rift's medieval armory (VIKING/KNIGHT'S/GREAT HELM,
CENTURION CUIRASS, CHAINMAIL HAUBERK, PLATE GREAVES, SABATONS). The hero
starts in his own street clothes — a T-SHIRT, JEANS, and LEATHER BOOTS
(`DifficultyDef.startingGear`): no bonuses, a whisper of armor, head bare.
The **BAG** is a gear piece that widens the carry
by two cells while worn (`GearDef.bagSlots`, on top of the STRENGTH-scaled
floor); it drops from every level's gear pool and is the first of a family —
roomier bags arrive later as their own defs. The character modal keeps the
stat sheet tucked behind the portrait (hover or tap it) so the bag grid
owns the screen.

What the campaign _does_ persist is the **character** and its **completion**,
on-device (`website/src/game/characters.ts`). The app opens on the title menu;
**PLAY** opens the hero roster (pick, create, or retire — see
[configuration.md](configuration.md)) when no hero is active, then drops into
the difficulty ladder for the chosen one. The chosen hero's build carries into
everything, and their progress is tracked per difficulty. Clearing a level
records it, and the victory splash offers **NEXT LEVEL** (advancing along
`LEVEL_ORDER`, carrying the difficulty). A hero is walked through the story in
order — choosing a difficulty (PLAY → difficulty) drops them straight into the
next unbeaten level, no picker. Only once the whole
campaign is beaten at a difficulty does that difficulty's **level-select** screen
open, as a free replay picker (the grind-for-gear endgame). The difficulty
ladder itself unlocks in order per character: a rung opens once the one before
it is beaten, and locked rungs show greyed out. The `?level=` dev override
bypasses the gates entirely. Every finished run is banked per difficulty
(`website/src/game/highscores.ts`) with its survival time, kills, player level
reached, and a full end-of-run session snapshot; the end-of-run screen shows
that difficulty's best survival time, and the menu's **HIGH SCORES** board ranks
the runs four ways (survival time, kills-per-minute, mobs killed, level reached)
and opens any banked run into a detail card of the whole session.

**HARDCORE**, chosen when the character is created, makes death permanent: a
hardcore hero that dies is retired for good (kept in the roster as fallen) and
the death splash offers only **MENU**. A softcore death costs no progress — the
run's build is banked on death just as on victory, so the hero keeps the levels,
stats and items earned it and the splash offers **RETRY** (restart the level
from that kept build) or **MENU**; only the level-clear bookmarks wait for an
actual victory. The banked build drops the run's **powerups**, though — the
dock's pocketed powerups do not survive a death, so a RETRY starts the level
with an empty dock rather than a hoarded stack. The
level cap is **99** (`LEVELING.maxLevel`): at the cap XP stops banking levels
and the endgame becomes the hunt for cap-level gear.

Because we die and replay a lot, a level's **story is shown only once per
difficulty**. The first time a character reaches combat on a level (on a given
difficulty), its opening — the prelude cutscene and the hero's intro monologue —
and every pinned inner monologue read that run (the SpaceZ scientist, the Mars
rover, and the rest) are banked onto the character; every later replay on that
difficulty skips the opening and pre-marks those thoughts as seen, dropping the
hero straight into the fight (`skipStoryOpening`/`markThoughtsSeen`, driven by
the per-character `storySeen` ledger in `website/src/game/characters.ts`). A
monologue not yet reached still plays its one time, and a fresh character — or a
harder rung of the ladder — sees the whole story again.

Difficulty-exclusive content lives with the level that uses it: a `spawns` or
`waves.budget` line can carry an optional `minDifficulty`, and it only appears
from that rung of the ladder up (see `meetsMinDifficulty`).

### The wandering merchant & the coin economy

Every level has a **WANDERING MERCHANT** (`src/game/merchant.ts`, config
`MERCHANT`/`ECONOMY`) — the same impossible trader in a different costume per
venue (`LevelDef.merchant`): the vending-machine man at SpaceZ HQ, the '76
salvage-run trader on the moon, the colony commissary keeper on Mars, and the
hooded trader between universes in the rift, where he admits every market he
ever ran fell through eventually (his lines are in
[`manuscript.md`](./manuscript.md)). The horde ignores him and his ward keeps
mobs two body-widths off his stall. He roams the level until the hero first
walks up to him: the **meeting** roots him to the spot for the rest of the
run, pins him on the level map (a gold MERCHANT coin marker), plays his greeting,
and stocks his stall. A gold coin bobs over his head from then on; tapping him
at the counter opens the **shop** (the run freezes like the bag).

The shop trades in **coins**, earned one way — selling loot across the
counter — and spent on the stall, so the economy recycles the loot rain
rather than printing money. An item's sell value is its **item level** times
its **tier** in orders of magnitude (magic ×10, rare ×100, unique ×1,000,
legendary ×10,000) times its **material** — METAL pieces melt down for
double, PRECIOUS ones (gold, gems, the genuinely magical) fetch four times
(`material` on the equipment defs). The stall sells the level's **powerups**
(restocked, priced off the hero's level) and a couple of one-off **weapons**
rolled with a magic-skewed tier bonus, Diablo 2 gamble style, priced at ten
times their own sell value — a purchase costs roughly what selling a handful
of magic finds brings in. The shop's SELL JUNK button clears every outgrown
piece (the inventory's scrap rule) in one tap; SELL ALL empties the whole bag
across the counter, keepers included (the worn loadout is untouched). Coins
ride the loadout between levels like everything else the hero carries.

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
  sprints ahead of the pack and reaches him — `openingStrike.radius` is tuned to
  a contact gap, so the swing lands with the scientist right on top of him,
  which draws whatever he took off the wall ("good thing I came armed") and
  turns combat on. The rusher outruns the hero (`ai.rushSpeed` > `PLAYER.speed`),
  so a fleeing hero still gets run down rather than kiting the opening beat into
  a stall. The beat is **ordered**: the vanguard HOLDS at its post (it doesn't
  even break from the pack — `moveEnemy`) until the hero's arrival read has
  played, so the scene always runs monologue-first, then the lone scientist
  rushing in and striking. Two sight-pinned inner monologues also fire here
  (`firstSightThoughts` — on view, before any blow): the first intern the hero
  SEES plays that arrival read on a building fully staffed at midnight, pinned
  to a **wide, drop-in `radius`** so it lands the instant the packed opening
  ring is on screen (and gates the vanguard's rush via `openingStrike.after`);
  the first OPTIMUSK he SEES plays the personal one — he helped build the first
  unit before the AI redrew the line and it took everyone's jobs, his included.
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
  here. Four fight as elites with signature drops — NIKOLA TESLA (drops the
  TESLA COIL and the WARDENCLYFFE NOTES), AMELIA EARHART (saw Ada carried
  through to the far door; drops the AVIATOR GOGGLES), GRIGORI RASPUTIN
  (the unkillable mystic: `dodgeChance` 0.35, drops RASPUTIN'S BEARD), and
  LUCKY — folklore's missing, a slippery leprechaun parked off the main
  road who drops the LUCKY CLOVER — and every fighter is **SPAREABLE**
  (`EnemyDef.spareable`): beaten to 0 hp it kneels for the SPARE-or-KILL
  verdict (see **Companions** below). Two more are the game's first
  **APPARITIONS** (`EnemyDef.apparition`): HARRY
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

## Companions — the SPARE-or-KILL verdict

The rift's four fighting uniques are the game's first **companions**
(`src/game/defs/companions.ts`, engine in `src/game/companions.ts`). Beating
a spareable unique to 0 hp pauses the run in the `choice` phase: **KILL**
lands the withheld blow through the ordinary kill rails (loot, last words,
the lot); **SPARE** recruits the figure — it hands over its STORY items (the
plot must flow) but keeps its equipment loot as its own kit, swears a life
debt (its `joinWords`, played through the dialogue box), and joins the party.

A companion follows the hero in formation, fights autonomously with whatever
is in its weapon slot (its signature piece at first — Tesla's coil, Lucky's
staff), and can be dressed from the hero's own bag in a **weapon, helmet,
and chest piece only** — never legs or feet (tap its portrait under the HUD
avatar for the Diablo-2-style equip screen). Companions are never killed:
at 0 hp one goes DOWN, kneels out of the fight (its aura silent), and stands
back up on its own. When its blow kills a mob it may float one of its
`killQuotes` — hovering banter, never a dialogue pause.

**LUCKY's aura** is the recruitment pitch: +50% MAGIC FIND for the whole
party while he's on his feet — every loot-tier roll's chance is half again
as likely (kill him instead and the clover is a one-off drop). The party
**rides the loadout** between levels (`Loadout.companions`), so the choice
made in the rift walks through the far door with the hero — the level beyond
it is built with a companion at his side in mind.

## Achievements

The game keeps an account-wide trophy shelf (`website/src/game/achievement-defs.ts`
— app data, not engine): ~100 badges across seven shelves. **STORY** (clear
each mission, beat the campaign on each of the five difficulties, collect
lore, meet the merchant), **COMBAT** (kill ladders for mobs / elites /
bosses, plus feats — watch a boss flee, set off a nuke, reach full RAMPAGE,
die once, clear a mission untouched or in under five minutes), **LOOT**
(counted ladders for magic / rare / unique finds — 10, 25, 50, 100-style
rungs — plus the first legendary and finding every unique), **ARSENAL** (one
badge per hand-authored unique, icon and name straight from its def),
**PARTY** (each spared legend and the full four), **HERO** (level 10 → 99),
and **MASTERY** (total runs and farming one mission).

Badges are earned on any hero — the ledger and lifetime counters persist
per install, across characters. A fresh unlock drops a gold banner with its
own chime (a deliberate notch below the level-up ding), and a pulsing gold
star appears under the HUD's MAP button until the shelf is opened; the
browser (title menu → ACHIEVEMENTS, or the star mid-run) shows every badge
with live progress toward the counted ones. The per-content badge groups
derive from the live registries, so new levels, difficulties, uniques, and
companions mint their badges automatically.

## Story items & costume

Plot pieces (`src/game/defs/story.ts`) — keycards that open the locked doors,
the recovered anti-grav unit — bank into `state.storyItems` and play their
`lore`. The EVA space suit is itself a story item
(`StoryItemDef.suitsHero`, dropped by the CHIEF OF SECURITY) — worn OVER
the hero's clothes and armor with no equip slot and no stats; picking it
up flips `playerAppearance` from the plain-clothes `hero` sprites to the
astronaut `player` sprites for good.
