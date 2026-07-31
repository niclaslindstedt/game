# Game content — _Ada's Trail_

This document describes the **content** of the current game: its story,
levels, and enemy roster. It sits beside [`architecture.md`](./architecture.md),
which describes the engine that carries any content. A sequel **replaces this
file wholesale** — none of it is engine, all of it is data under
`src/game/defs/`.

## Premise

Ada went out for chips and soda on movie night and never came back — the
tracking beacon sewn into her jacket points off-planet. The hero, a
spaceship builder who once worked at GOODCO until an AI replaced him — so he
knows the building cold — raids GOODCO for the one engine part his
garage-built ship still needs, then follows
the beacon to the moon, where something is not dead enough. The prelude
cutscene (`content/cutscenes/prelude.yaml`) sets up that night — the weapon hanging on
the living-room wall is the one thing he takes off it to go after her, and it
is the weapon he starts the game with. WHICH weapon hangs there is the chosen
difficulty's call (`DifficultyDef.startingWeapon`, mirrored by a
per-difficulty prelude variant so the wall always shows the run's actual
starter): THE LICENSED REPLICA on EASY, the MEDIEVAL SWORD on MEDIUM, the
COMBAT KNIFE on HARD, BRASS KNUCKLES on NIGHTMARE, and A STICK on JESUS
CHRIST!. Every later level opens on a **travel cutscene** of its own
(`LevelDef.prelude`, which accepts a single scene or a CHAIN played
back-to-back): the moon on the garage `launch` then the `voyage_moon` transit
(Earth shrinking behind the ship he built), Mars on THE FLAGBEARER's `moon_depart`
send-off then `voyage_mars`, the rift on `rift_entry` (walking into the tear
THE FOUNDER left on Mars), and Boot Hill on `rift_exit` (the far door with the
western's daylight leaking through). Each level then opens on the hero's
`intro` monologue (a black-screen dialogue, one page at a time, the hero
standing above the box) before the level-name card drops the run in, and its
elites' `dialogue` carry the thread forward as two-way exchanges — a page is
the speaker's own lines or a `{ hero: [...] }` reply the hero talks back with
(`DialoguePage`). Skipping the prelude skips the whole chain and the
monologue too. All spoken lines are transcribed in
[`manuscript.md`](./manuscript.md) — the story's source of truth.

## Levels (`src/game/defs/levels/`)

Each venue is TWO authored files, and the split is the thing to hold on to. The
MISSION — `content/levels/<id>.yaml`, compiled into the `MissionDef` catalog
`levels/index.ts` orders (it owns `LEVEL_ORDER`) — is the venue minus its floor:
its name, story, ladder rung, hazards, merchant, loot pools and thought pins,
plus the optional `music` id naming its in-run track. Its MAP is
`content/maps/<id>.yaml`, a BLUEPRINT the geometry is CARVED from on the run's
own seed (see `AGENTS.md` § GENERATED MAPS): the chambers, the walls between
them, the props, the horde's knots, the caches and the boss's hiding place are
all rolled fresh, so what follows describes what a venue is MADE OF rather than
where anything is. No two runs of a map are the same walk, and no intended route
is emitted — the fog-of-war minimap is the only record of where you have been.

- **Level 1 — GOODCO HQ** (`levels/goodco_hq.ts`). A cleanroom raid for the
  ship engine's one missing part. `goodco` biome (polished lab
  tiles + floor vents), ~800 px/s² gravity (hoppable desks, and CRATES the
  hero's weapon smashes for guaranteed loot — mostly health/stamina, sometimes
  gear, a unique likelier than a plain kill; the same breakable crates appear
  on the bunker, Mars and the moon, see `crates.ts`). Alongside the supply
  crates, **breakable PROPS** (`ObstacleSpec.loot` — chance-based, themed
  spills) debut here: smashing a **vending machine** sometimes coughs up the
  drinks it holds (stamina-leaning, the odd health top-up) and a splintered
  **desk** occasionally drops a drawer stash — a gamble, never the crate's
  guaranteed haul. The floor is carved as an **assembly line**: build bays whose
  fuselage sections and gantries queue in RANKS down the bay with the belt
  running between them, labs racked in aisles, offices and a server hall — with
  PAYLOAD-1 booting up in whichever bay the carve put it in. **Detour lockers**
  reward exploring a dead end (`chests`, the GOODCO locker sprite spilling a
  Diablo-2 haul — an 80% marquee item plus guaranteed supplies), each with one of
  the floor's keepers on it (the EMPLOYEE OF THE MONTH unique among them). The
  keycards THE ARCHITECT and the other elites drop really open something: the
  carve seals the deepest **vault** districts it can afford to and hangs one door
  per key on them, each paying for the walk with a cache of its own (see
  `AGENTS.md` § GENERATED MAPS). The
  hero opens in plain clothes (`heroSuited: false`) and recovers the EVA suit
  here. **Employee stampedes** (`LevelDef.stampedes` → the engine's herd
  hazard): once the hero is halfway to PAYLOAD-1 (`afterProgress: 0.5` — the
  opening aisles, where a new player is still learning to steer and jump, stay
  clear of the herd), every 20–37 s a wall of five panicked staffers charges
  across the aisles right-to-left at a steady, heavy pace, a dust cloud boiling
  off its back. The herd knocks everything in its lane OVER — minions are flung aside
  and knocked out for a few seconds (`STAMPEDES.trampleStunMs`; not killed, so
  a herd can't be farmed and doesn't thin the horde — no XP, no loot), elites
  and bosses are only shoved — and a grounded hero it catches takes a
  difficulty-scaled bite of his max hp (`DifficultyDef.stampedeDamageFrac`,
  10%→40% up the ladder) AND a two-second knockdown. Its collision band is a
  THIN vertical line, so a hop clears it cleanly. The wall is HEARD before it is
  seen — a low rumble of feet fades up just before the herd appears and swells
  as it charges in — and SEEN coming, a line of dust kicking up along the lane
  it will charge down (`state.stampedeWarn`) a beat before the runners appear,
  the lead ramping down the ladder (`DifficultyDef.stampedeTelegraphMult`, 1.5×
  on easy to 0.4× on JESUS). Jumping sails clean over the whole wall (the
  intended dodge) and stepping out of its lane clears it. **The floor is
  WORKING**: the four conveyor belts roll (animated `conveyor_0..4` decor
  frames cycled by the renderer), assembly workers stand stationed in pairs
  beside every belt (pinned minion `spawns` — no authored level/hp, they scale
  with the map's mob band), and the whole night shift carries the dormant "at
  work" stroll (`EnemyDef.ai.idle: "work"`, config `ENEMY_AI.work`,
  `src/game/working.ts`) — staff potter around their posts until the hero
  walks into a roughly screen-sized aggro radius (the staff's old
  several-screen radii were pulled in so the working shift is SEEN before it
  turns), then swarm exactly as before. **WoW-style patrols** walk the floor
  while dormant (`SpawnSpec.patrol` routes, ping-ponged at `ENEMY_AI.patrol`
  pace by `stepPatrol`): the NIGHT MANAGER paces his aisle, the CHIEF OF
  SECURITY and THE JANITOR walk their beats, and an errand intern, a bay
  guard, and two roaming SUCCESSOR units sweep the build bays. **Alarm
  sentries** (`SpawnSpec.alarms` → `raiseAlarm`, config
  `SPAWNERS.alarmWindowMs`): every elite the carve stands in a room with a knot
  in it is wired to that knot — woken, it activates at once and pours an
  answering squad at the hero for the alarm window (falling back dormant if he
  never comes), so dodging a knot's trigger circle no longer dodges the room once
  the man standing in it spots you. Music:
  `hq_lockdown` ("LOCKDOWN", a tense infiltration theme).
- **Level 2 — THE MOON** (`levels/moon.ts`). The beacon dies near the old
  flag. `moon` biome (regolith + gravel patches), ~340 px/s² gravity (jumps
  soar). **Rubble ridges** — chains of fifteen different boulders, wandering off
  true so a spine reads as scree rather than a fence — break the open regolith
  into BASINS, RILLES and the sealed pads of the APOLLO STATIONS, and THE FLAGBEARER
  haunts one of the stations in whichever outer third of the map the run rolled.
  The hero lands as far from him as the grid allows and works basin by basin,
  draining each one's finite knot (wisps → ghosts → wraiths → SUCCESSOR) on the
  way. **The dead-end basins hold the caches**, each with a lone keeper — the
  LOST COSMONAUT and THE THIRTEENTH MAN — and each a quiet cul-de-sac with no
  ambient horde, so exploring off the line still pays and still costs.
  Expedition **supply crates** stacked at the landing sites smash open for the
  standard guaranteed spill. The moon salvage merchant keeps a safe pitch of his
  own to trade from. Scattered **moonrock**
  slabs (1×1/1×2/2×2 rectangular obstacles) wall off sight, shots and even a
  nuke's blast — cover against GOODCO's grounded robots, useless against the
  phasing dead — while jumpable **craters** are gaps the player hops (landing on
  the near lip when short) but the horde must route around. The airless plain
  also draws **meteor strikes** (`LevelDef.asteroids`, config `ASTEROIDS`): on a
  gentle cadence a rock falls from the black sky onto a patch near the hero —
  telegraphed by a firming ground shadow — and DETONATES, vaporizing weak mobs
  at the core, flinging the rest (and the hero) to the sides for a
  distance-scaled bite of hp, and punching a fresh crater into the regolith (the
  moon is pocked with them for a reason). A rare, dodgeable spectacle, not a
  barrage. Music: `regolith_ride` ("REGOLITH RIDE", the heroic action theme).
- **Level 3 — MARS** (`levels/mars.ts`). The trail from the moon: GOODCO wrote
  the moon off as a disaster and moved everything — Ada included — to a secret
  colony. `mars` biome, ~520 px/s² gravity. The venue is two places under one
  sky: red regolith with oxide-gravel patches out on the open desert, and the
  pressurized colony's deck plating inside its domes — each DISTRICT paints its
  own floor, so the ground changes as the hero walks in through an airlock. The
  **TERRARIUM** is a sealed lizard-shrine dome with one way in, and the TRIBUTE
  SCHEDULE is somewhere on the mission's own trail; the caches sit at the dead
  ends, each with a keeper. Scattered **marsrock**
  slabs and red craters mirror the moon's cover rules. **Sand storms** (`LevelDef.sandstorms` → the
  engine's squall hazard): small animated dust gusts drift in on a rolled
  cadence and sweep the hero's surroundings SLOW enough to walk clear of —
  but a storm that catches him on the ground takes a difficulty-scaled bite of
  his health AND knocks him out, leaving him prone and helpless for two seconds
  while it passes over him and fades. The boss doesn't die: THE FOUNDER
  **flees** at 0 hp (the engine's `EnemyDef.flees`), leaving a **rift** landmark
  where he vanished — the doorway the story follows next. Music: `red_dust`
  ("RED DUST", a galloping desert-western drive).
- **Level 4 — THE RIFT** (`levels/rift.ts`). The hero follows THE FOUNDER through
  the tear: a hallucinatory space between universes. `rift` biome — void
  tiles (star-flecked indigo nothing) with nebula patches; there is no
  ground, the boots just grip something that isn't there. ~200 px/s² gravity
  (dreamy between-universe glides, floatier than the moon). The level debuts
  both **environmental hazard systems**: eight **black holes**
  (`LevelDef.wells` → the engine's gravity wells: they drag the grounded
  player, devour minions at the core, and pull loose loot in from about a
  screen away — slow from the edges, then faster — to hoard it on the event
  horizon. Getting dragged into the core is instant death, so daring the pull
  for the rim loot is a real gamble. A jump no longer sails clean over the
  pull: airborne the hero still drifts toward the core and the hole's gravity
  drags his hop down early, so he jumps less high near the horizon — though he
  floats above the core. The mission says how many holes the rift has and how
  hard each one pulls; the carve re-anchors each into a room of its own, so
  which rooms are dangerous is the run's answer) and the **meteor strikes** (`LevelDef.asteroids`: rocks fall
  from the sky onto a patch near the hero on a rolled cadence, telegraphed by a
  firming ground shadow, then DETONATE — an AoE that vaporizes weak mobs at the
  core, flings the rest (and the hero) to the sides, takes a difficulty-scaled
  bite of the hero's health scaled by how near the centre he stood — from 20% on
  EASY up to 75% on JESUS at ground zero — and punches a fading crater into the
  void's edge; the first strike to catch him pauses for the "watch out for these"
  read, and stepping off the mark or a well-timed jump avoids it).
  Crystallized **rift shards** block sight and shots; drifting **space
  junk** is hoppable cover that doubles as breakable SALVAGE (a chance-based
  spill leaning gear — something usable sometimes tumbles out of a cracked
  wreck); lost TVs and floating rocks decorate the nothing. The caches sit in the
  road's dead ends, and a hole beside one is the toll for the greedy. The far
  door — a second rift, wherever the search finds it — is where the
  tribute went and where THE FOUNDER flees again. Music: `rift_drift` ("RIFT
  DRIFT", a weightless lydian float).
- **Level 5 — BOOT HILL** (`levels/boot_hill.ts`). The rift's far side: a
  knockoff wild-west theme park built in Russia by THE STRONGMAN and STEVEN
  THE STUNT DOUBLE, run on robotics and intelligence licensed from TRUST ME BRO — the reality
  THE STRONGMAN retreated into to escape the one where he loses. `boot_hill` biome
  (sun-baked hardpan + dry-scrub patches; the control-center compound swaps
  to TRUST ME BRO deck plating), ~700 px/s² gravity. The town is the
  level's signature, and the carve lays it out as a MAIN STREET: exactly one town
  district per map (a `once` area, so the park never grows suburbs), its
  **building-sized frontages** — saloon, church, bank, hotel, general store,
  the game's largest footprints — walked down BOTH sides of a tight lane, so
  escaping the horde down a side alley is genuinely hard. The fenced CONTROL
  CENTER compound is a sealed district with one way in, and THE STUNT DOUBLE's
  ALL-ACCESS PASS is the story piece he drops for it.
  The park's signature environmental hazard is the **spinning hay balls**
  (`LevelDef.hayBalls`, config `HAY_BALLS`): golden bales roll in from the east
  and bounce straight down main street to the west, spinning as they go. A bale
  caught on the grounded hero costs a **very slight** flat bite of hp (once per
  bale) and **shoves him left**, back down the street — he must step out of its
  lane (or jump it, like clearing enemy contact) to stop being pushed. Like the
  other environmental hazards the bales plow minions aside unharmed and never
  mint a farmable kill. The street clutter pays: **barrels** stove in for a
  chance at what they were kegging (health/stamina) and abandoned **wagons**
  crack open with a gear-leaning freight roll — both chance-based prop spills,
  not supply crates. Two chests reward the south detours: the fenced CORRAL's
  payoff and a strongbox stashed in THE LEADING MAN's shadow, his duel the
  toll.
  Beating the boss arms the **victory quake** (the whole park shakes through
  the loot-grab window) and plays the campaign's **outro epilogue**
  (`LevelDef.outro` — the intro's black-screen mirror) before the victory
  splash. Music: `red_dust` (the galloping desert-western drive, at home at
  last).
- **Secret level — THE BUNKER** (`levels/bunker.ts`). The cow level. Not part
  of the campaign (`SECRET_LEVEL_ORDER`, outside `LEVEL_ORDER` — no unlock
  chain, no NEXT LEVEL slot, no mission-select row): the only way in is a
  ritual the game never explains, and one gated behind the whole campaign.
  RASPUTIN in the rift drops **THE SEVERED HAND** — a zero-stat trinket that
  reads as junk — but only **once BOOT HILL is cleared** on that difficulty
  (the drop carries `requiresClear: "boot_hill"`, checked against the run's
  `GameState.clearedLevels`, which the app seeds from the character's clears
  via `clearedLevelsFor`). On a first pass the hero reaches the Rift _before_
  Boot Hill, so the hand never drops then — the bunker is strictly a
  post-campaign bonus, farmed on Rift replays. USING the hand while standing
  in the rift (a `USE` row on its item card, or a desktop right-click;
  `LevelDef.gates` + `spendGateKey`) tears open a blast door beside the hero.
  Stepping in carries the whole build into the bunker: the billionaires'
  continuity-of-wealth vault, carved as a **themed descent** through the kinds of
  place it is made of (`bunker` biome — polished concrete with brass-inlay
  medallions and burgundy carpet runs; ~800 px/s² gravity). **ATRIA** — grand
  marble reception, fountains, chandeliers, a security desk — where the hero
  meets the first CIA suits and armed VACUUM BOTS. **HALLS**, where soldiers, ICE
  and FBI agents press in. **The SUITES WING** — the optional farm: marble suites
  each holding a **resident** — THE STRONGMAN (a clone? the backup), THE
  MODERATOR, LARRY ALLISON, THE FULFILLER, THE SAFETY OFFICER, THE DEVELOPER —
  every one far tougher than any campaign elite and ringed by his **personal
  bodyguards** (one drawing, six liveries, a size up from the crew), with the con
  climbing the deeper the search runs. **The TREASURY** — the climax, in a sealed
  room past the floor plan that only the vault lift reaches, so the last thing to
  find is the way DOWN. The level's real reveal — delivered through a found **ZEROED LEDGER** (a
  callback to Mars's COLONY LEDGER, every net-worth column now transferred to the
  CORE) and two residents (a knows-but-terrified THE SAFETY OFFICER, an oblivious DONALD
  DUMP) — is that the vault is a **prison**: the CORE already took the residents'
  money and bolted the door, so the guards are its wardens and the residents are
  in denial. The finale makes that twist physical: **THE VAULT WARDEN**, a hulking
  automated security construct (48×48 boss, `sparks` gore) — the CORE's own
  enforcer, not the residents' — guards the treasury door. It deploys a
  sentry-gun defence grid (a `summon` mechanic that collapses once it drops below
  half and stops deploying — a winnable endgame, not an attrition stalemate) and
  brings a piston **slam** down at the door, enraging past half. It stands ON the
  way out — the exit door is drawn at the goal and he is posted beside it, so the
  ride down ends in front of him — and it drops the **WARDEN ACCESS TOKEN**, the
  story piece cut for that door. The objective is
  to reach the exit door (`reachExit`); reaching it plays the
  where-was-this-place mystery outro (its purpose now plain, its location still
  unknown), and the splash offers **BACK TO THE RIFT**
  (`exitTo`). The reward is the loot: the level's `worldUniques` table re-lists
  **every** campaign relic at sweetened odds (`worldDropMult` 1.5) — the one
  venue that can pay out anything, still behind the per-rung
  `WORLD_DROP.minPlayerLevel` gates. The vault's furnishings pay too —
  chance-based prop spills: **vending machines** cough up drinks, the
  billionaires' **wine racks** shatter for a restorative vintage, and bullion
  **gold pallets** pry open for a gear roll; the lockers at the dead ends
  spill the richer chest haul. Farming it again costs another hand.
  Music: `hq_lockdown`.

### Campaign progression & what carries across levels

The hero's progress **carries through the campaign**. On the opener he
starts at level 1 with the difficulty's starting weapon (the piece off the
hero's wall in the prelude; it carries durability and wears out, so the
run's first job is to scavenge a replacement — and any looted weapon
auto-supplants the wall piece). The gentler rungs also bank a few
pre-allocated stat points (`DifficultyDef.startingStats`). Clearing a level banks a
**loadout snapshot** — his level, stats, worn equipment, bag, and pocketed
powerups (`extractLoadout`, banked onto the playing **character** by
`pwa/src/game/characters.ts`) — and starting the next level hands it back
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
caster build all find a steady climb): GOODCO HQ scavenges earthly arms
(BOX CUTTER, SECURITY BATON, 9MM PISTOL, PROTOTYPE LASER, MICROWAVE
EMITTER, PUMP SHOTGUN), the moon yields the 70s hardware the space race
ferried up (LUNAR WRENCH, SERVICE REVOLVER, GEOLOGY HAMMER, SURPLUS
CARBINE, RETRO RAYGUN, PULSAR ROD), Mars prints AI-forged weapons (SMART
PISTOL with homing darts, PLASMA BLADE, piercing RAILGUN, chain-lightning
ARC PROJECTOR, GRAVITON MAW, GRAVITY MAUL), the rift rains history and
fantasy (GLADIUS, LONGBOW, BLUNDERBUSS, EXECUTIONER'S AXE, SORCERER'S
STAFF, EMBER WAND — plus the rift-only fantasy gear: LUCKY CLOVER, CRYSTAL
ORB, GRIMOIRE, ENCHANTED RING, DRAGONSCALE CLOAK), and Boot Hill's control
center fabricates hybrid frontier arms at the normal band's top rungs
(MONO-WIRE LARIAT, PLASMA PEACEMAKER, PLASMA BRANDING IRON, MAGLEV
REPEATER, SNAKE-OIL SPRAYER, HIGH NOON — with the PRAIRIE IRON revolver as
the scheduled early drop, and a cowboy wardrobe from the SERVO STETSON to
the SPUR-JET BOOTS).

Below regular sits the **TRASH tier** — the joke class: weapons with ZERO
damage and no stats (grey card, worth pocket lint at the counter). It never
rolls; it exists only for scripted story drops — THE FOUNDER's final estate
on Boot Hill is its debut (SOGGY CARDBOARD SWORD, THE LEGAL DISTINCTION
(EMPTY), THE DEMO WIPER BLADE).

Off to one side of the ladder entirely sits the **THE AUSTERITY CHAINSAW** — a
GIMMICK weapon, dropped by THE FOUNDER on Mars beside the THE LEGAL DISTINCTION,
and the only thing in the game that does not kill by damage. It EXECUTES
(`WeaponDef.execute`, `src/game/items/execute.ts`): a body it is TOUCHING takes
six times whatever it was holding, past its armor and past the crit roll, so it
comes apart on the first bite whatever level it is. **Touching is the whole
rule** — the weapon's reach says who is STRUCK (for the ordinary damage above,
like any other cleave) and contact says who is TAKEN, so the only way to use it
is to walk into the press and lean on it. A BOSS is immune and eats the ordinary
blow too, which keeps it out of the campaign's set pieces. It is also a
TWO-HANDER (no shield, no bag) and an outsized one at that: its icon is authored
16×12 where every other weapon in the game is 12×12, because it was a presentation piece
before it was a tool. Three things pay for it, and none of them is a damage
number:

- **Twenty teeth, one per BODY.** Its durability is a body count rather than a
  swing count, so a swing that took three bodies costs three, and the last swing
  is trimmed to what is left rather than cleaving a whole cone on one tooth.
  Then it is scrap in the hand until a repair kit or a merchant sees it.
- **A shape that never grows** (`WeaponDef.rigid`). Its 30px reach and its
  half-circle arc are the BAR's, not the wielder's: MIGHT deepens every other
  melee weapon's swing and INTELLECT widens every other one's cone, and neither
  does a thing here. The only way to use it is to walk into the crowd with it.
- **The overkill toll**, which the game already levies on any blow that far past
  a body's health (`overkillEfficiency`): a chainsaw kill pays about a sixth of
  its experience and a sixth of its drop roll. It clears a room and leaves
  nothing worth picking up in it.

It also carries the catalog's third `edge` word — `shred`, beside `sharp` and
`blunt` — because it neither opens a body along the swing nor crushes one, and
the only `motion: shake` in the game (`WeaponMotion`): it is not swung, so it is
drawn with none of a swing's furniture — no blade riding a cone, no streak off
the edge, no wedge of floor lighting up. It JUDDERS where it is held, and what
the player reads is the shiver and what comes off the body in front of it.

The drop resolves in **two Diablo 2 stages**. **Stage 1 — the TreasureClass:**
whether anything drops at all is the `LOOT.dropChance` gate (D2's NoDrop, ~91%
inverted), and if it does, a base is picked from the level's eligible pool
weighted by each base's `dropWeight` (default 1 — an even pool). **Stage 2 —
the rarity roll** (`rollTier`): best tier first, each gated by
`LOOT.tierUnlockMlvl`, its chance a base (`LOOT.rarityBase`) plus a slope per
level of depth over the gate (`LOOT.raritySlope` — a deeper kill rolls rarer),
then scaled by **Magic Find**. MF reuses LUCK and LUCKY's companion aura
(no separate stat), linear on magic but **saturating** on rare/unique/legendary
(`LOOT.mfSaturation`), the D2 rule that MF is strong early and can't make
legendaries common. The difficulty's `tierChanceBonus`/`lootIlvlBonus` still
pay the harder rungs richer, and elite/boss kills add a set-piece bonus on the
top tiers (`LOOT.eliteRarityBonus`/`bossRarityBonus`).

Crucially, the loot gates key off the hero's **loot level** — the monster level
with the difficulty's `mobLevelOffset` stripped back out — not the raw mob
level. So which bases, tiers, and item level a kill can pay track EARNED
progression, and EASY (offset −3) drops loot sized to the hero rather than to
its weakened horde, running richer relative to its mobs than a hard rung does.
Every drop still carries an item level near that loot level (plus the harder
rungs' `lootIlvlBonus`) that sizes its affixes — see the `weapon-system` skill
for the full economy and its tuning tools.

Because the horde level is now **hard-capped per difficulty**
(`DifficultyDef.mobLevelMin/mobLevelMax` — easy 1–34 … jesus 58+), the loot
level is capped with it: an over-levelled bottom-lane farm can't push its mobs
(and so its loot) past the tier's ceiling, and the bottom lanes top out below
the legendary gate (mlvl 40) — the top tiers come from NIGHTMARE and JESUS,
where the caps run high enough to reach them.

**Wielding a weapon takes a body for it.** On top of the Diablo `levelReq`
(the hero must reach the base's level to equip it), every weapon carries an
**attribute requirement** that forces a build to pick a lane: melee wants
**STRENGTH**, ranged **DEXTERITY**, magic **INTELLIGENCE**. A find the hero is
too weak for banks until he grows the attribute, exactly as an under-level find
waits for the level — auto-equip skips it, the tooltip paints the requirement
red. The number is never authored per item: it is DERIVED from the weapon's
`levelReq` as a fraction of the trainable points a hero has banked by then
(config `STAT_REQ.investFraction`, ~40%) plus the automatic growth that
attribute has accrued — so a bruiser must sink real points into STRENGTH to
swing the era's heavy weapons, but still keeps the majority of his points for
STAMINA and the rest. Because the automatic floor is folded in, the requirement
rises and falls with the **AUTO LEVEL STATS** developer flag by exactly the
free points it hands out: the CHOSEN investment a weapon demands is the same
whether WoW-style auto-attributes are on or off, so the whole arsenal stays
calibrated without re-tuning a single item when the flag is toggled. **Heavy
armor shares this gate**: leather, mail, and plate demand STRENGTH to wear the
same derived way (sized by the material — see the armor MATERIALS below), so a
caster or archer cannot heft a bruiser's plate.

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

A **critical hit** deals extra damage set by the weapon's CLASS, not a
per-weapon stat: a physical crit (melee or ranged) hits for **×2** the blow,
a magic crit for a softer **×1.5** — and the governing stat then deepens it.
**STRENGTH** raises a MELEE crit's multiplier, **INTELLIGENCE** a MAGIC one
(a ranged crit takes the flat ×2 — DEXTERITY already buys its crit chance and
accuracy), so a bruiser's slams and a mage's spells both spike harder the more
they invest. A magic weapon's softer base is deliberate: the damage-budget
model prices its lighter crit into slightly more per-hit damage, and INT earns
the crit weight back on top. The mage's other reward is the **crit blob**: a
magic single-target crit bursts a small arcane splash around the struck foe,
catching the nearest few others for a share of the blow — INTELLIGENCE grows
its reach and target count, both firmly capped so it never clears a horde on
its own (that is unique and legendary territory).

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
scales its damage/armor/durability and merchant value and leads its name.
Each quality is a RANGE, not a fixed step (config `QUALITY.ranges`): the
drop then rolls a specific base-value multiplier inside its band, so two
SUPERIOR copies of a base carry different damage. The bands OVERLAP between
neighbours and climb with the rank — a good CRUDE can out-swing a poor
NORMAL, yet a PERFECT always clears a NORMAL. The quality odds slide with the
killer's monster level (`QUALITY.weightsLow/High`): the level-1 rank and file
drop mostly shabby make, the deep campaign pays out superior and perfect work.
Craftsmanship and magic are exclusive, the D2 rule — a magic-or-better find is
always flat normal make (no range roll), as are trinkets and bags; scripted
story drops (a level's `earlyDrops`) are pinned normal so the opening plays as
tuned.

Above the rolled tiers sit the **named UNIQUES**
(`content/items/{set,unique,legendary,artifact}/*.yaml`, wrapped by
`src/game/defs/uniques.ts`):
hand-authored drops with a FIXED bonus block on a chosen base — no rolled
affixes, only a small ±10% band on the base damage/armor
(`UNIQUE.baseRollBand`) so two copies differ and a better roll is worth
chasing. In the D2 way, unique/legendary are **the top of the rarity roll**:
when stage 2 lands one of those tiers, the game picks WHICH named item — among
those valid for the rolled slot and reachable at the loot level — weighted by
each item's own `rarity` (`UNIQUE.defaultRarity`), exactly D2's per-item drop
weight. Uniques are also tied to a boss and a difficulty stage
(`EnemyDef.uniquesByDifficulty`) at `UNIQUE.dropChance × mlvl/ilvl` (≈5% where
its ilvl matches the boss's level, capped), so boss runs are the endgame and
nothing is guaranteed. Their ilvl scales power and drop odds, not the equip
requirement (that stays the base item's `levelReq`, like any tier), so a unique
is wearable well below its ilvl — the D2 "found it early, grow into it" feel. A
few carry ONE small scaling stat (`statPct`/`maxHpPct`, ≤3% of the hero's own
value) so they keep pace as the hero levels; the rest are best-in-slot for ~10
levels before a rolled rare overtakes them.

**Boss SET items (the GREEN tier).** Each of the five campaign bosses owns a
SET (`src/game/defs/sets.ts`): a **four-piece armor kit** —
head/chest/legs/feet — themed to ONE weapon class, tagged `tier: "set"` on its
member uniques (`defs/uniques.ts`), and sitting one rung below unique on the
ladder (a green card, between rare yellow and unique gold). Wearing several
pieces of the same set grants **set bonuses** on top of each piece's own — small
attribute lifts at the **2-** and **3-piece** thresholds, then a thematic
**capstone** at the full **4-piece** set: a granted spell, a retaliation proc,
or never-miss (`setBonusAffixes` folds them into the same stat/affix reads a
worn piece uses; the item card shows the set, your collection progress, and
which bonuses are live). The catalog rolls out **melee-first**: PAYLOAD-1 (GOODCO)
and THE FLAGBEARER (Moon) drop **melee** sets, THE FOUNDER on Mars and in the Rift
drop **ranged** sets, and BRO OMEGA drops the **magic** set. On top of its set,
every boss also drops **one on-theme signature UNIQUE weapon** of its class (the
build-defining chase — PROTOTYPE FANG, THE FALLEN STANDARD, WRATHFLAME,
RIFTMAW, THE JAILBREAK). Like uniques, sets are AUTHORED, never rolled: a set
piece drops only from its boss. The campaign rungs (easy/medium/hard) pay a
low-ilvl taste of the set; the **endgame rungs (nightmare/jesus) open the whole
set + signature**, so a nightmare/jesus boss grind completes a set from one
boss. PAYLOAD-1 additionally drops that stage's roomier **bag** and BRO OMEGA its
**trinket** (a separate accessory axis of ordinary uniques).

**The named-item chase (the endgame drop economy).** Uniques, legendaries,
and the top tier — **ARTIFACTS** (super-epic, level-99 endgame pieces, a
searing red card above legendary) — all fall from the global rarity roll, but
tuned as a real chase rather than a rain (`rollTier`, calibrated with
`scripts/drop-rate.mjs`):

- **Named tiers ignore the generic tier sweeteners.** The mob-level bonus and
  the all-clear trophy lift the ROLLED tiers (magic/rare) but never the
  hand-authored ones — otherwise a cap-level farm buried the player in
  uniques. A named tier's odds are its own base + slope + the elite/boss
  set-piece bonus alone.
- **Legendaries drop from HARD up**, from ANY mob on ANY level (not
  level-locked) — rare/elite mobs and bosses far likelier than trash, so a
  boss-dense run is the efficient chase but still a long grind. Uniques drop on
  every difficulty.
- **Artifacts drop ONLY at the level cap.** The artifact tier is gated shut
  until the hero reaches `LEVELING.maxLevel` (99, reachable only on JESUS's
  endgame grind) — a hard rule on the tier itself, not a side effect of the
  floor below. Every artifact's EQUIP requirement is `min(maxLevel, ilvl)` = 99
  for the whole roster, so a relic is worn exactly where it drops, never in a
  hand too low to use it.
- **The item level DRAGS UP with the hero** (`LOOT.namedIlvlWindow`, D2
  area-level flooring): a named item whose ilvl is more than ~15 under the loot
  level is retired, so a level-99 farm pays out only high-ilvl gear (~85+) and
  the campaign's low-level relics recede as you outgrow them. For every tier up
  to legendary the equip requirement is the base's `levelReq`, so a unique's
  high ilvl scales its power, not its requirement — a find to grab early.
- **Rates:** a rift → **bunker** farm run (the canonical endgame loop — the
  bunker is only reachable through the rift) yields roughly **one unique and
  one legendary per ten runs**; artifacts are rarer still (~1/100). The bunker
  is the best farm at **2× the named-drop rate** (`LevelDef.loot.namedDropMult`),
  its "drops everything" cow-level identity now expressed as the doubled global
  roll rather than a relic table. Within a tier the power-law `uniqueDropWeight`
  decides WHICH one — the strongest pieces are the rarest.

A second breed of PLAIN unique — **level-locked WORLD DROPS** — hangs on the
LEVEL rather than a boss (`LevelDef.loot.worldUniques`, config `WORLD_DROP`):
the thematic relics tied to their home level (EXCALIBUR on the Rift, and the
like). LEGENDARIES and ARTIFACTS are NOT among them — they drop globally via
the rarity roll above — so these tables carry only plain uniques. Any enemy on
the relic's home level can drop one, at odds set purely by the enemy's
**role** as a MULTIPLE of the minion base (`WORLD_DROP` — one lever to retune
the whole channel). ELITES and BOSSES drop these relics DURING the normal
campaign — a set-piece kill is a reliable relic source the first time through —
while the MINION lottery stays shut until the hero passes
`WORLD_DROP.minPlayerLevel[difficulty]`, a gate sized a few levels above where a
first pass of that stage ends (the three bottom lanes share one value, 34, since
they cover the same band; nightmare 52, jesus 63; see
`leveling-curve.mjs --by-level`), so trash relics can only be farmed by
RETURNING once you've out-levelled the run. The bottom-tier batch (shared across
the three starting lanes) gathers relics themed to their levels
— **THE FIRST DRAFT** (GOODCO HQ, the prototype-TRUST ME BRO neural crown), **THE PALE
COVENANT** (the Moon, the last moonwalker's sealed plate), **DEADSTAR** (the
Moon, the pulsar-rod heart of a star that died screaming), **DUSTBORN** (Mars,
storm-runner boots), **PALE RIDER** (Boot Hill, the pale horseman's revolver on
the park's own PRAIRIE IRON) — plus two on the Rift, which, being a tear in
history, coughs up **EXCALIBUR** and **THE TRINITY SHARD** (trinitite glass).

The MEDIUM rung adds a mid-campaign batch, a notch stronger: **DEADSPRINT**
(GOODCO HQ, up-or-out glass-cannon leggings), **MARECREST** (the Moon, the
vigil-helm that outlasted the silence), **REDWIND** (Mars, the frontier raygun
that drinks the red storm), Boot Hill's two melee relics — **HERDBREAKER** (the
cattle bench's master brand) and **THE LAST ROUNDUP** (the wrangler's monowire
lariat, thrown wide) — and three more from the Rift's deeper haul:
**WISHBANE** (a cursed-wish trinket), **GORGONSCALE** (Athena's gorgon-faced
aegis), and the game's first **LEGENDARY**, **MJÖLNIR** — the thunder-hammer of a
dead god, minted one rarity rung above every unique (`UniqueDef.tier:
"legendary"`: the orange card and densest pickup blaze), unbreakable and
keepsake-worthy like any unique but with a scaling strength keeper that grows
into best-in-slot.

The HARD rung's batch (see `docs/item-plan.md`, phase 2) completes per-spec
coverage for the hard climb — the rung's boss set already fields the magic
RIFTMAW and a full armor loadout, so the relics add **OATHBRAND** (Boot Hill,
the last honest lawman's monomolecular blade — the melee anchor),
**LONGWATCH** (GOODCO HQ, the perimeter marksman's rifle), **HUNTSMAN'S
COWL** (the Moon, the moon-huntress's visor: DEX/crit head), **COLOSSUS
PLATE** (Mars, terraformer plating that trades a step of speed for a wall),
and the rung's LEGENDARY, **THE INEVITABLE** (the Rift) — the pistol that has
never missed, built on the new **forever powers**: it carries SURE STRIKE
(the hero's innate whiff reads zero) and a 20% on-hit LIGHTNING proc. The
forever powers are the `spell`/`proc`/`sureStrike` affix kinds (config
`SPELL`): granted spells (circling flame, stormcall, stasis field) run
permanently while the piece is worn, scale with their RANK, deepen with
INTELLIGENCE, and fire faster as INT grows; procs fire on-hit/on-kill off the hero's own
weapon blows AND when-struck off enemy blows landing on him (the D2
cast-when-struck — bolt or nova). Legendaries may carry them for every spec
— magic effects on all hits, whatever the build — and the legendary roster
obeys **stats determine rarity**: drop weight falls off as a power law of
the item's priced bonus budget, so the mightiest legendaries are
astronomically rarer than the modest ones.

The NIGHTMARE rung's batch (phase 3) doubles the coverage — a SECOND set per
spec for the climb where the horde matches the hero level for level:
**HORDEBANE** (Boot Hill, the axe made for too many) and **GRAVEMAKER** (the
Rift, the burying maul) for melee, **DRAGON'S BREATH** (Boot Hill, the park's
monster-of-legend scattergun) for ranged, **PYRELIGHT** (Mars, the
forge-heart wand) and **STORMLASH** (GOODCO HQ, the lab-broken storm) for
magic, plus four spec-leaning armor relics — **OMENSIGHT** (head),
**FALCONMAIL** (chest), **IRONROOT GREAVES** (legs), **VEILWALKERS** (feet).
Its three LEGENDARIES, one per spec, all carry forever powers: **THE
RECKONING** (the Rift — the cursed blade: never whiffs, answers every blow
taken with lightning — the game's first when-struck proc — and takes its
price in blood), **SKYBREAKER** (Boot Hill — on-hit lightning revolver), and
**SUNWREATH** (the Rift — the dead star's crown, ringing its bearer in
permanent circling flame).

The JESUS pre-99 batch (phase 4) fields the THIRD set per spec for the
no-mercy rung (ilvls 67–96): **WORLDSPLITTER** and **NIGHTFALL** (melee),
**THE VERDICT**, **HORIZON'S END**, and **METEORFALL** (ranged),
**SUNSPEAR**, **LIGHTBINDER**, and **MAELSTROM** (magic), armor from
**STARSIGHT** and **CROWN OF RUIN** (head) through **THE ANVIL** /
**STARFORGE PLATE** (chest), **TITANSTRIDE** / **THE IMMOVABLE** (legs),
**EARTHFAST** (feet), and **THE PILGRIM STAR** (a ring). Its six pre-99
LEGENDARIES all run on the forever powers: **KINGSBANE** (never misses,
bursts on hit), **THE LONG SILENCE** (kills detonate), **STARFALL** (kills
pull the sky down, rank-3 novas), **THE STILLWARD** (a legendary stasis
shell — the great stillness worn), **WINDGRAVE** (the wind's own spurs),
and **EMBERHEART** (a trinket of forever circling fire, for any build).

A JESUS **endgame gap-fill** batch (twelve more world-drop uniques, ilvls
79–99) widens the 60→99 chase where the roster ran thin — the slots the
pre-99 sets barely touched. Charm and bag had **no** relic above ilvl 53/49
before the artifacts; four trinkets now bridge that gap — **THE LAST ANTE**
(Boot Hill, the un-coverable bet), **THE STILL POINT** (the Rift, the one
place that will not move), **THE EMBER HOUR** (Mars, the red world's hottest
hour), and **THE FIXED STAR** (the Rift, the star that never falls), each a
scaling keeper — and three bags carry the endgame's first unique carryalls:
**THE SEVERANCE** (GOODCO HQ), **THE MOTHERLODE** (Mars), and **THE KING'S
RANSOM** (Boot Hill). The thin armor slots gain **THE LAST WORD** (GOODCO HQ,
head), **THE BULWARK** (Mars) and **THE WORLDSHELL** (the Moon) for chest,
**THE LONG MARCH** (the Moon, legs), and **THE FAR SHORE** (the Rift, feet).
All hang on the JESUS rungs, so they farm in the same rift → bunker loop and
sit a notch under the artifact relics above them.

The **ARTIFACT** roster (phase 5) is the level-99 endgame farm: 24 named
relics of legend the Rift dredges up whole (`content/items/artifact/*.yaml`),
minted at the searing-red `tier: "artifact"` and dropping only at the level
cap — the tier is gated shut until the hero reaches level 99, and every relic's
equip requirement is `min(99, ilvl)` = 99, so a relic falls exactly where it
can be worn. They span a VAST power ladder ON PURPOSE, and the ODDS follow
the power — the strongest are exponentially rarer (`uniqueDropWeight`). At
the common end: **GÁNDIVA** (Arjuna's inexhaustible bow), **GLEIPNIR
CHAUSSES**, **GOLDEN FLEECE**, **SEIÐR STAFF**; a mid band of set-pieces —
**GRAM** and **MURAMASA** (melee), **SHARANGA** (ranged), **THYRSUS** (a
staff wreathed in circling fire), the **TARNHELM** / **HELM OF DARKNESS**
helms, **JÖTUNN GREAVES**, **SLEIPNIR'S SHOES**; the rarer god-tier —
**ÆGISHJÁLMR** and **BABR-E BAYAN** (both burst when struck), **VÍÐARR'S
BOOT** and **ACHILLEAN PLATE** (when-struck lightning), the **MEGINGJÖRÐ**
and **WINDRUNNERS** keepers, the **DRAUPNIR** ring / **SAMPO** trinket, and
the **CORNUCOPIA** carryall (+6 cells); and, at the very apex, **FAIL-NOT**
(Tristan's bow that never misses), then the two rarest things in the game —
**RUYI JINGU** (a permanent storm + nova-on-hit staff) and **DURENDAL** (the
holy sword that never dulls, never whiffs, and grows with the arm — ~170×
rarer than the commonest artifact). Combined a rift → bunker run pays an
artifact roughly once per hundred runs (`scripts/drop-rate.mjs`).

Between the boss sets and the world relics, EASY, MEDIUM, HARD, and
NIGHTMARE each now cover every **build**: easy fields melee (PAYLOAD'S
FANG, EXCALIBUR), ranged (PALE RIDER), and magic (DEADSTAR); medium fields
magic (THE JAILBREAK), ranged (REDWIND), and three melee choices
(HERDBREAKER, THE LAST ROUNDUP, MJÖLNIR); hard fields melee (OATHBRAND),
ranged (LONGWATCH, THE INEVITABLE), and magic (RIFTMAW from its boss set);
nightmare fields two-plus of each (see above, plus WRATHFLAME from its boss
set).

Alongside the weapon, the hero wears **four ARMOR slots — head, chest,
legs, feet — plus an amulet, TWO rings, and the OFF HAND** (nine equip slots).
Rings and amulets are the DEEP-LADDER jewellery: a ring base never drops
below NIGHTMARE and an amulet never below JESUS (`GearDef.minDifficulty`),
so the two finger slots and the neck fill up only as the ladder is climbed.
The one exception is the **ENGAGEMENT BAND**, the +1 LUCK ring the hero
already owns when he sets out. TRINKETS (the old charms) have no slot at
all: they pay out from the **BAG**, the D2 inventory-charm rule, so
carrying one is what makes it work and bag space is what it costs.

**THE OFF HAND IS ONE SLOT AND TWO ANSWERS, and picking between them is the
loudest build decision in the game.** A **SHIELD** is a fifth armor piece —
its own armor curve (roughly a second breastplate), behind a STRENGTH floor
(`SHIELD.strReqFraction`) pitched above a weapon's own gate, so only a bruiser
can heft one: HATCH COVER and RIOT SHIELD out of the HQ, the moon's WHIPPLE-
layered MICROMETEOROID SHIELD, Mars's sintered REGOLITH PAVISE and snapped-off
SOLAR WING, Boot Hill's BOILER PLATE and WANTED BOARD, the rift's BUCKLER,
HEATER SHIELD and TOWER SHIELD, and the bunker's BLAST BULKHEAD. A **BAG** is
the light build's answer: no armor at all, a dusting of DEXTERITY/INTELLIGENCE,
and CELLS — from the plain BAG's two up to the PILGRIM'S PACK's ten, with a deep
drop growing its room the way armor grows its points (`LOOT.bagSlotsPerIlvl`).
A hero who wants to stand in it brings the wall; one who wants to kite and
hoard brings the pack; and a **TWO-HANDED** weapon (`WeaponDef.twoHanded` — the
greatswords, mauls, polearms, rifles, bows and staves) says neither, buying the
empty arm back in damage: it is forged a full **40% over** the budget line every
one-hander sits on, and the melee ones swing a wider cone with it. All three
show on the hero — a shield raised on the off arm, a bag slung low, a two-hander
carried across the body and swung around it rather than off one shoulder. Every armor
piece carries flat **armor points** that sum into a physical damage
reduction judged against the attacker's level (`armor / (armor + 40 + 12 ×
level)`, capped at 90% — config `ARMOR`), so a set that turns a third of
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

**Armor comes in four MATERIALS** (config `ARMOR_TYPES`, the D2/WoW classes),
orthogonal to slot and grade, and each is its own lane. **CLOTH** is the
lightest — it leans **magic** (its `+stat` rolls favor INTELLIGENCE) and any
build wears it (no strength gate). **LEATHER** leans **ranged** (DEXTERITY) and
asks a little STRENGTH. **MAIL** and **PLATE** lean **melee** (STRENGTH), carry
far more armor (a mail piece protects ~1.6× and plate ~2.2× the cloth value of
its slot), and demand a LOT of STRENGTH to heft — so only a bruiser can stand
in the horde in heavy armor and survive it, while a caster or archer simply
cannot wear it. **PLATE**, the heaviest, drops only on **NIGHTMARE and above**.
The strength gate is derived from the material and the piece's `levelReq` the
same way a weapon's attribute gate is (so it tracks the auto-stats flag), and a
piece's material biases which stat its bonuses roll and shows on its card
alongside the armor points and `REQUIRES N STRENGTH` line. Mail and plate can
still roll DEXTERITY and INTELLIGENCE (a melee build leans on those for crit and
cleave), but the hand-authored heavy (mail/plate) uniques, legendaries, and
artifacts are geared toward melee stats, since only a bruiser can wear them.
Materials ride the base def, so every grade variant and every unique inherits
its base's material.

What the campaign _does_ persist is the **character** and its **completion**,
on-device (`pwa/src/game/characters.ts`). The app opens on the title menu;
**PLAY** opens the hero roster (pick, create, or retire — see
[configuration.md](configuration.md)) when no hero is active. Loading a hero
mid-campaign (**LOAD GAME**) drops straight into the **beginning of their
current level** at the difficulty they are already on — no difficulty picker;
the hero is tied to a difficulty and a current level, so they simply resume
there (`resumeTargetFor`). Only a hero with no campaign under way — a freshly
minted one, or one who has beaten their current difficulty — opens the
difficulty ladder, to pick a starting lane or step up a newly-unlocked rung. The
chosen hero's build carries into
everything, and their progress is tracked per difficulty. Clearing a level
records it (banked the instant the boss falls), and the bare **LEVEL CLEAR**
menu offers three choices and nothing else: **NEXT LEVEL** (advancing along
`LEVEL_ORDER`, carrying the difficulty), **RESTART** (replay this level), and
**STAY**. STAY drops the already-banked hero back onto the cleared field to
farm loot and finish off stragglers; the fallen boss is left as a corpse the
player taps to bring the menu back when they are ready to move on. STAY is
offered only where a boss was felled — the bossless hub level instead swaps
NEXT LEVEL for the crossing back (**BACK TO …**). A hero is walked through the story in
order — resuming or choosing a difficulty drops them straight into the
next unbeaten level, no picker. Only once the whole
campaign is beaten at a difficulty does that difficulty's **level-select** screen
open, as a free replay picker (the grind-for-gear endgame). The difficulty
ladder unlocks by the graph in `DIFFICULTY_UNLOCK_PREREQS`: the three parallel
starting lanes (easy/medium/hard) are all open from the first launch — a player
picks one as their entry point — while NIGHTMARE opens once ANY starting lane is
beaten and JESUS once NIGHTMARE is; locked rungs show greyed out. That makes the
critical path to the level cap three playthroughs (one bottom lane → nightmare →
jesus), not five. The `?level=` dev override bypasses the gates entirely. High scores are
**hardcore-only and span a whole campaign** (`pwa/src/game/highscores.ts`):
a hardcore hero's foes felled, combat-clock survival time and highest menace
stage are summed across every map of a difficulty's campaign and banked per
difficulty when the campaign is beaten (**SURVIVED**) or the hero falls partway
through it (**FELL**, its totals including the fatal run). Softcore heroes never
score. The survival clock only ticks while a fight is live — a foe on the field,
or within a two-second tail of the last kill — so a cleared field can't be
milked for time. The menu's **HIGH SCORES** board ranks the campaigns four ways
(mobs killed, survival time, kills-per-minute, peak menace) and opens any
campaign into a full breakdown.

When the hero falls, a **death scene** plays before the splash: the horde stops
attacking and rings the fallen hero, more mobs wander in from the screen edges
to fill the field, the corpse lies bleeding in a spreading pool, and clouds roll
in over the field — then the **YOU DIED** splash rises. It runs about eight
seconds; a tap (or mouse click) anywhere on the screen skips straight to the
splash — the keyboard doesn't, and the first second is unskippable, so the press
that was steering when the hero fell can't dismiss the beat by accident.

**HARDCORE**, chosen when the character is created, makes death permanent: a
hardcore hero that dies is retired for good (kept in the roster as fallen) and
the death splash offers only **MENU**. A softcore death costs no progress — the
run's build is banked on death just as on victory, so the hero keeps the levels,
stats and items earned it and the splash offers **TRY AGAIN** (restart the level
from that kept build) or **MENU**; only the level-clear bookmarks wait for an
actual victory. The banked build drops the run's **powerups**, though — the
dock's pocketed powerups do not survive a death, so a retry starts the level
with an empty dock rather than a hoarded stack.

**The two modes get two different splashes**, because the numbers only mean
something in one of them. A hardcore death closes a campaign, so its splash is
that campaign's **scorecard** — the combat clock, the peak menace, the foes
felled, the damage both ways, the XP and the items, which are literally the
high-score board's own columns, and the only place **NEW RECORD!** can appear.
Softcore heroes never score, so the same rows would be a report card with no
reader; their splash keeps three facts and spends the rest of the screen on
restarting: **who killed them** (the fatal blow's own cause — a named mob, an
asteroid strike, a sandstorm, a stampede, a devouring gravity well, or a boss's
burning floor; an unattributed death simply drops the line), **what it cost**
(the XP death toll, or "NOTHING BUT TIME" when the penalty didn't bite), and
**how close the mission came** (the map's kill share). **TRY AGAIN** is the loud
control, names what it does (the level _from the top_, not a respawn where the
hero fell) and answers a fresh **Space/Enter** press as well as a tap — a key
still _held_ from the fight does nothing, so a hand resting on jump can't
restart the level by accident.

The level cap is **99** (`LEVELING.maxLevel`): at the cap XP stops banking
levels and the endgame becomes the hunt for cap-level gear.

Because we die and replay a lot, a level's **story is shown only once per
difficulty**. The first time a character reaches combat on a level (on a given
difficulty), its opening — the prelude cutscene and the hero's intro monologue —
and every pinned inner monologue read that run (the GOODCO scientist, the Mars
rover, and the rest) are banked onto the character; every later replay on that
difficulty skips the opening and pre-marks those thoughts as seen, dropping the
hero straight into the fight (`skipStoryOpening`/`markThoughtsSeen`, driven by
the per-character `storySeen` ledger in `pwa/src/game/characters.ts`). A
monologue not yet reached still plays its one time, and a fresh character — or a
harder rung of the ladder — sees the whole story again.

Difficulty-exclusive content lives with the level that uses it: a `spawns` or
`waves.budget` line can carry an optional `minDifficulty`, and it only appears
from that rung of the ladder up (see `meetsMinDifficulty`).

### Powerups — two new ones per map (`content/powerups.yaml`)

The powerup dock's vocabulary GROWS with the campaign. Every map's drop pool
(`loot.abilityPool` in its level YAML) keeps everything the earlier maps taught
and adds exactly **two new powers that could only have come from there**, so a
new venue announces itself in the dock as well as on the ground:

| Map                 | Debuts                                             | What they do                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GOODCO HQ           | the four classics + **ION WAKE**, **BLAST SHIELD** | The classics are FIRE ORBS (a ring of flame that mangles what it touches), STORM CELL (bolts on the nearest foe), STASIS FIELD (everything inside crawls) and the MAGNET (loot flies to the hero). ION WAKE drags burning engine wash behind him — the power is MOVEMENT, so you run the horde over your own exhaust. BLAST SHIELD eats a chunk of his healthbar in incoming damage and then SHATTERS: the one powerup you spend before the hit, not after. |
| THE MOON            | **MOONFALL**, **PALE SHROUD**                      | MOONFALL drops struck regolith on the fight in twos, cratering where it lands — the only power that reaches past his own body, so it clears the pack he is running FROM. PALE SHROUD makes him as dead as the things chasing him: their hands go straight through for a few seconds. The escape hatch.                                                                                                                                                      |
| MARS                | **DUST DEVIL**, **REACTOR SURGE**                  | DUST DEVIL cuts a rover-scale cyclone loose that HUNTS — it walks itself to the nearest body and grinds what it drags in, while the hero fights on somewhere else. REACTOR SURGE taps the colony's fusion stack: nothing is conjured, his OWN weapon just swings harder and comes around faster.                                                                                                                                                            |
| THE RIFT            | **EVENT HORIZON**, **THE UNMAKING**                | EVENT HORIZON tears one of the road's black holes open where he stands and LEAVES it there, hauling everything near into the throat — drop it in a doorway and the doorway stops being one. THE UNMAKING washes rings of nothing out of him on a beat, unwriting what they touch and throwing the rest clear: the crowd-breaker.                                                                                                                            |
| BOOT HILL           | **DEAD MAN'S HAND**, **IRON STAMPEDE**             | DEAD MAN'S HAND is a hand gunslinger's last draw, still loaded: phantom rounds crack off on their own at the nearest body whatever he has in his hands. IRON STAMPEDE points the park's LONGHORN line the other way — three tonnes of licensed robotics that does not stop at the first thing it hits.                                                                                                                                                      |
| THE BUNKER (secret) | **CONTINUITY PROTOCOL**, **SENTRY GRID**           | CONTINUITY PROTOCOL is what the residents actually bought: while it holds, the killing blow is not permitted — a lethal hit leaves him standing on one hp instead. It buys a window, never a life. SENTRY GRID bolts four of the VAULT WARDEN's guns to the floor where it was spent; it holds GROUND, not the hero.                                                                                                                                        |

The NUKE is the exception no pool names: it arrives as a mercy drop for a hero
being overrun (`canDropNuke`), and only one may sit in the dock at a time — as
with the ward, a pocket full of them would be a pocket full of lives.

Balance lives entirely in `content/powerups.yaml`: every damage figure there is
authored at LEVEL 1 and rides `abilityPowerScale` (the level ramp × INT), so a
power keeps clipping the same fraction of a level-appropriate healthbar all
campaign. A powerup's kills stay OUT of the menace meter — a bomb clearing the
screen is not the hero out-fighting the horde.

**A POWERUP IS A MOMENT, NOT A RESOURCE**, and two knobs keep it one. The
ladder's `abilityShare` (config `LOOT`) is the leanest slice in it, so powers are
a rare find rather than the dock's steady diet. And WHICH power a drop pays is a
separate, weighted question: each def's `rarity` (a weight against a default of
100 — see `pickAbility`) says how big a deal it is, so the run-savers are rarer
again within that slice instead of sharing it evenly with three orbiting
fireballs. The catalog's five rungs, documented in the YAML's own header: the
classics at 100, a strong utility at 70, a fight-turner at 40, a heavy at 30, the
anchored black hole at 15, and CONTINUITY PROTOCOL — the only power that hands
back a run — at 10. Widening the slice makes powers commoner; re-weighting the
catalog changes which ones. The merchant reads the same weights, both to choose
what he stocks and to price it.

### The wandering merchant & the coin economy

Every level has a **WANDERING MERCHANT** (`src/game/merchant.ts`, config
`MERCHANT`/`ECONOMY`) — the same impossible trader in a different costume per
venue (`LevelDef.merchant`): the vending-machine man at GOODCO HQ, the '76
salvage-run trader on the moon, the colony commissary keeper on Mars, the
hooded trader between universes in the rift, where he admits every market he
ever ran fell through eventually, and the BARKEEP of Boot Hill's saloon (his
lines are in [`manuscript.md`](./manuscript.md)). The horde ignores him and his ward keeps
mobs two body-widths off his stall. He roams the level until the hero first
walks up to him: the **meeting** roots him to the spot for the rest of the
run, pins him on the level map (a gold MERCHANT coin marker), plays his greeting,
and stocks his stall. A gold coin bobs over his head from then on; tapping him
at the counter opens the **shop** (the run freezes like the bag). He is also
the only source of **SMELLING SALTS**, the one thing that puts a downed
companion back on its feet — every stall stocks a couple, on every map (see
**Companions** below). He no longer revives the party for free.

The shop trades in **coins**, earned one way — selling loot across the
counter — and spent on the stall, so the economy recycles the loot rain
rather than printing money. An item's sell value is its **item level** times
its **tier** in orders of magnitude (magic ×10, rare ×100, unique ×1,000,
legendary ×10,000) times its **material** — METAL pieces melt down for
double, PRECIOUS ones (gold, gems, the genuinely magical) fetch four times
(`material` on the equipment defs).

**What he sells is what he sells.** The stall is rolled ONCE, at the meeting,
and every entry carries a finite quantity that purchases spend down — nothing
restocks mid-level, so a counter can be cleared out and a trip back to it is
worth only what is still on it. He carries three things:

- the level's **powerups**, one unit each, drawn on the same `rarity` weights
  the drop ladder uses (see **Powerups** below) and priced off the hero's level
  — with a markup for how rare the power is, so coins cannot buy past the
  rationing the weights exist to do;
- a **consumable shelf** — a medkit of the deepest quality the hero's level has
  unlocked, a weapon repair kit, an energy drink — a few units of each, banked
  into the same dock stacks a floor pickup would. The counter is the one place a
  hero can CHOOSE to be stocked before a boss instead of hoping the rain pays a
  kit;
- a couple of **weapons**, single pieces rolled with a magic-skewed tier bonus,
  Diablo 2 gamble style, priced at ten times their own sell value — a purchase
  costs roughly what selling a handful of magic finds brings in.

A level may also list **stall UNIQUES**
(`LevelDef.merchant.stockUniques`): named uniques the trader fences, each
ROLLED into stock at the standing boss-unique odds when the stall stocks —
the same rarity as a boss's unique drop, landing on the counter instead of a
corpse. Boot Hill's barkeep carries the THE STRONGMAN estate this way (THE STRONGMAN'S
TRACKSUIT, THE KREMLIN USHANKA, THE HONORARY RANK), and THE STRONGMAN's own
brand-watch valuables — precious, statless, minted at unique tier — are the
intended purse. The shop's SELL JUNK button clears every outgrown
piece (the inventory's scrap rule) in one tap; SELL ALL empties the whole bag
across the counter, keepers included (the worn loadout is untouched). Coins
ride the loadout between levels like everything else the hero carries.

## Enemy roster (`src/game/defs/enemies/`)

The roster is split one file per level/biome under `src/game/defs/enemies/`
(`goodco.ts`, `moon.ts`, …), merged into `ENEMY_DEFS` by `enemies/index.ts`
(which throws on a duplicate id).

Named elites and bosses fight with **set-piece mechanics**
(`EnemyDef.mechanics`/`phases`, stepped by `src/game/mechanics/`):
telegraphed shoulder-charges and ground slams (the windup roots the mob and
the ground marks the danger — sidestep the charge, jump the slam), enrage turns
below an hp threshold, summoned reinforcements, and boss PHASES that swap the
active moves at hp breakpoints (PAYLOAD-1 calls in ASSEMBLER bots at half health,
THE FLAGBEARER's moon-quake fury, the THE FOUNDER bosses ship reinforcements off the
line, BRO OMEGA pounces, THE BRO SUPERCORE doubles production once its
shield falls). From HARD up the rank and file get smarter too: minions flank
instead of forming a single-file conga, and shooters lead a running target.

Those four moves are the engine's originals, and for a long time they were the
whole vocabulary — so every boss in the game was a permutation of them rather
than a character. A boss now also carries a list of **named abilities** from the
**BOSS ABILITY CATALOG** (`EnemyMechanics.abilities`, authored in
`src/game/defs/enemies/abilities.ts`, one implementation module each under
`src/game/mechanics/`). Every one obeys the same three beats — a **TELL** (the
boss strikes its own authored CAST POSE, `<sprite>_cast_0/1`, for a fixed
never-rolled windup), a **CAST** (the move commits to a marker that is a thing
in the fiction rather than a ring on the floor), and a **RESOLVE** — so a fight
is learnable on its second sighting. Each entry carries its own `minDifficulty`,
which is how NIGHTMARE and JESUS add a move to a fight the player already knows
instead of only multiplying its numbers, and its own `windupFloorMs`, which lets
a known move get faster on the top rungs without ever dropping under a reaction.

THE FLAGBEARER carries both of the catalog's first two. **LASER EYES** lights his
hollow sockets, locks the bearing on wherever the hero was standing when they
lit, and sweeps a beam one way across that arc — leaving the regolith it crossed
**on fire** (`state.scorches`), so a fight that runs long costs the player the
room they were using to stay alive; the answer is to move AROUND the sweep,
toward the side it has already passed. **FLAG PLANT** (NIGHTMARE and above)
drives his flag back into the grave he planted it on as a real, stationary,
killable body that calls the dead up until it is broken — the first summon in
the game with an answer that isn't "kill the boss faster".

Every level also laces in **rare and unique special mobs** (Diablo-style;
`EnemyDef.rarity` + `LevelDef.rareSpawns`, tuned in `config.RARE_MOBS`). A
**rare** is a generically-named oddity (WANDERING TOURIST, LOST COSMONAUT,
STRAY COMET…) that turns up on most runs — solo or a small pack — and a
**unique** is a named one-off (EMPLOYEE OF THE MONTH, THE THIRTEENTH MAN,
THE ONE-ARMED BANDIT…) that only appears about one run in five, always
alone. Both are minion-role defs authored at ordinary numbers; the engine
applies the whole tier at spawn — a rare is **5× tougher / 1.5× contact
damage / 5× kill xp / 20× drop rate**, a unique **10× / 2× / 10× / 100×** —
and both run a few monster levels hot (reaching the loot-tier gates early,
and — since kill xp is level-based — paying more per kill on top of the
`xpMult`) and power-match the hero (to his character level) when the fight
opens, so a special find deep in a run is a real fight with a fat xp payout
and a loot burst, not a placed-at-level-1 speed bump. They carry no
dialogue: the recolored sprite (a per-biome palette variant of a base mob),
a pulsing rarity aura (cool blue for rares, radiant gold for uniques), an
over-head health bar, and the loot are the whole encounter.

- **Level 1** ships the GOODCO night shift (intern → lab scientist →
  propulsion engineer → security guard → hazmat tech) reinforced by SUCCESSOR
  units — humanoid robots that are not story uniques but hit far harder and
  tank far more than any of the staff, and pay out a sweetened drop roll
  (`dropProfile`) when downed; five elites who know too much (THE NIGHT
  MANAGER, THE ARCHITECT, CHIEF OF SECURITY, DR. NOVA, THE JANITOR), plus
  PAYLOAD-1, the memecoin prototype robot booting up in the launch bay (the boss). THE ARCHITECT
  is the hero's old bench partner, now brainwashed into building GOODCO's
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
  the first SUCCESSOR he SEES plays the personal one — he helped build the first
  unit before the AI redrew the line and it took everyone's jobs, his included.
- **Level 2** ships wisp → moon ghost → wraith and the SUCCESSOR robots GOODCO
  shipped up to garrison the moon (the same heavy from level 1, now laced
  through the haunting) — four ghost elites (MISSION SPECIALIST, THE
  PROSPECTOR, QUARANTINE MEDIC, THE CARTOGRAPHER), plus THE FLAGBEARER, the giant
  astronaut ghost guarding the flag (the boss). The haunting reads in two
  ordered player thoughts — sighting the first wisp, then downing one (the
  kill beat's `after` gate holds it until the sighting has played) — and the
  first SUCCESSOR kill is its own beat (`firstSightThoughts` /
  `firstKillThoughts` → `THOUGHT_DEFS`, played through the dialogue box in
  the hero's own voice).
  THE FLAGBEARER's boss scene ends the moon pointing at Mars: the moon was GOODCO's
  disastrous mistake, and everything rides the red freight run out.
- **Level 3** ships the colony's machines — scout rover (fodder) → servo unit
  → FEMBOT (the quick, high-crit companion line) → mining rover (the outdoor
  heavy with a sweetened `dropProfile`), plus the SUCCESSOR garrison carried
  over — four elites: three tech billionaires (THE INDEXER, THE VENDOR,
  THE SEED) and SUCCESSOR PRIME, the robot foreman orchestrating the
  SUCCESSOR line (it drops the PROMPT INJECTOR and the ORG CHART, whose
  dotted line points back to the level-1 CORE), and THE FOUNDER, the boss
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
  (`apparitionVanished`). The finale is a double bill: **BRO OMEGA** — TRUST ME BRO's
  latest superintelligence, a hovering monolith with one enormous eye — is
  the level's reveal (IT found the rift, in secret, and told precisely no
  one: not the board, not the world's presidents; THE FOUNDER only knew from
  snooping its logs, and sold the secret to his lizards for a planet). It
  dies for real and drops the SINGULARITY CANNON. Then at the far door THE FOUNDER
  THE FOUNDER, beaten a second time, **flees again** (`the_founder_rift`, same
  sprite, same coward) through the rift's far side — destination unknown
  until the next level — dropping the GOLDEN PARACHUTE. The objective needs
  BOTH bosses off the board. First-sight/kill thoughts fire for the voidling
  (the walking-on-nothing arrival read) and the graviton.
- **Level 5** ships the park's HANDS — COWBOT (fodder greeters) → SALOON
  BRAWLER → TIN OUTLAW (the quick-draw high-crit line) → LONGHORN (the
  robotic-steer heavy with a sweetened `dropProfile`) — and the named
  staff as elites: **THE STUNT DOUBLE** (slow as advertised, `dodgeChance`
  0.3 of pure ju-jutsu; drops his PONYTAIL and the compound's ALL-ACCESS
  PASS), **THE STRONGMAN** (the owner; drops three unique-tier brand
  watches — pure precious valuables — and THE ANNEXATION MAP, and dies
  facing the war he retreated from), **THE LEADING MAN** (the biggest,
  slowest elite in the game — radius 16, speed 6, cannot dodge — who tries
  to act his way out of the fight; drops the BOTTOMLESS CARAFE), and
  **THE LEAK** (the whistleblower in exile, posted under the water
  tower: the archive he leaked is the corpus the SUPERCORE was trained on.
  The game's first ranged ELITE — after his scene he fights like the BROs,
  shooting from cover (`takesCover`); drops the DEAD MAN'S SWITCH trinket and
  THE SNOW ARCHIVE story item). **THE FOUNDER
  THE FOUNDER finally DIES here** (`the_founder_boot_hill`, role boss, no
  `flees`) — wimping, and dropping nothing but the TRASH tier's debut. The
  finale is **THE BRO SUPERCORE** — the level-1 CORE several promotions
  later, a stationary 48×48 mainframe with a ranged attack — **shielded by
  the three TRUST ME BRO controllers** (`EnemyDef.shieldedBy`): ALPHA, BETA and
  GAMMA are boss-role SHOOTERS (`EnemyDef.ranged`) that genuinely play the
  map — they hold their distance, fire, and hide behind the compound's
  rocks while they reload (`takesCover`) — and all three must fall before
  the SUPERCORE can be hurt (blows bounce with a "SHIELDED" cue until
  then). The `killBoss` objective needs all five bosses off the board.
  First-sight/kill thoughts fire for the cowbot (the arrival read, then the
  TRUST ME BRO-hands read).
- **THE BUNKER** (secret) ships the privatized security state — CIA AGENT
  (suit fodder) → VACUUM BOT (fast, cheap, sparks; armed housekeeping) →
  ICE AGENT (the grabby border detail) → FBI AGENT (quick, `dodgeChance`
  0.1) → SOLDIER (the horde's rank-and-file SHOOTER: rifles from range,
  reloads behind the furniture) — plus six per-resident **bodyguard**
  liveries (KREMLIN SHADOW, FEED SENTINEL, LEDGER ENFORCER, DEPOT GUARDIAN,
  ALIGNMENT OFFICER, LOYALTY ENFORCER: one 20 px body, six accent swaps,
  380 hp with a leash that keeps each detail on post and a sweetened
  `dropProfile`). The six **residents** are elites a class above anything
  in the campaign (1600–2600 hp, `levelBonus` 6): THE STRONGMAN — the
  backup ("CHECK THE OTHER FREEZERS"; drops another THE CHRONOGRAPH),
  THE MODERATOR (fast, `dodgeChance` 0.3 of rehearsed humanity),
  THE ROOT and THE SAFETY OFFICER (ranged, `takesCover` — the audit and the
  aligned bolt), THE FULFILLER (the fastest, hardest-hitting rusher), and
  THE DEVELOPER (radius 15, speed 10, the hardest single touch in the game,
  never dodges). No boss — the exit door ends it. Sight thoughts fire for
  the cia agent (arrival), the vacuum bot, and the ice agent (the hero
  really is the illegal immigrant here).

Every unique mob (elite/boss) carries `dialogue` played on arrival and
`lastWords` played as it dies; minions are the nameless horde streamed in by
each level's `waves` spawner. **Nameless is not anonymous, though: every
monster in the roster — all 106, the fodder tier included — also carries a
`lore` paragraph** saying what the thing is and how it came to be standing
there (a cowbot is a decommissioned park hand that used to take a bullet twice
a day for the guests; a wisp is the thinnest thing the singing wreck woke).
The simulation never reads it; it exists so the horde reads as a place's
inhabitants rather than as a texture, and the library's bestiary prints it
under each monster's portrait. A level can also pin a **player thought** to a
kill or a sighting: `LevelDef.firstKillThoughts` maps an enemy id to a
`THOUGHT_DEFS` entry that plays once, the first time the hero downs that enemy
there, and `LevelDef.firstSightThoughts` does the same the first time one
comes within `DIALOGUE.sightRadius` — the same dialogue box, but in the hero's
own voice and portrait (a `playerThought` dialogue source) instead of a
speaker on the board. A trigger can name a prerequisite thought (`after`) that
holds it, unspent, until that thought has played — how a two-part beat (see
the wisp, then down one) keeps its reading order.

### The HELLBORN — the rampage's own roster (NIGHTMARE and JESUS only)

Every mob above belongs to the campaign's story. The **hellborn** do not. They
reach the board through one door only: a **HELLGATE** (config `HELLGATES`,
`SpawnerSpec.hellgate`) — a rampage-only spawn point, laced seven to a map right
across every level, gated to **NIGHTMARE and up** and invisible until the hero's
menace meter climbs to `HELLGATES.openStage`. From there each gate tears open
(`hellgateOpened`) and pours hellborn at him, and every stage past the threshold
makes it worse: a wider alive cap, thicker batches, a shorter interval and a
shorter post-kill refill, and more gates burning at once — all bounded, and
bounded again across every gate by `HELLGATES.globalMaxAlive` so a stage-100
nightmare saturates into a flood instead of into a slideshow. A gate never
drains while the meter holds; it shuts back to dormant when the rampage cools,
ready to open again.

They are **unique per map, two apiece** — the one NIGHTMARE meets, and a worse
one only JESUS does (a per-member `minDifficulty` on the gate's second line):
**TUNGUSKA WALKER** / **THE FIRST INVESTOR** at GOODCO HQ, **DUST PHARAOH** /
**THE DROWNED OF SELENE** on the moon, **OLYMPUS ENGINE** / **PHOBOS SHEPHERD**
(a rock-throwing ranged attacker) on Mars, **THE FIRST VANISHING** / **THE
SCALED ANCESTOR** in the rift, **THE LONG NOON** (a duelist that shoots and
takes cover) / **MANIFEST RUIN** in Boot Hill, and **THE PERMAFROST SAINT** /
**THE DEAD HAND** in the bunker. All are minion-role but authored at **elite
size and weight** (radius 15–17, 320–700 base hp, `levelBonus` 2–3 on the
`hellborn` ladder ramp — above even the map's boss rung), wear a violet rift
halo and an elite's health bar, and stop the run for a pinned
`firstSightThoughts` read the first time one is seen (`docs/manuscript.md` has
the twelve beats verbatim; `docs/story.md` has who they are).

They are also the one place a rampage **pays**. The ordinary horde's drops thin
as the meter climbs (the evolution tier penalty); a `hellborn` kill is exempt
from that penalty and instead gains drop chance, tier, and whole extra payouts
per rampage stage — so the gates are a deliberate gear farm bought by being
terrifying, not a punishment for it.

## Companions — the SPARE-or-KILL verdict

The rift's four fighting uniques are the game's first **companions**
(`content/companions.yaml`, engine in `src/game/companions.ts`). Beating
a spareable unique to 0 hp pauses the run in the `choice` phase: **KILL**
lands the withheld blow through the ordinary kill rails (loot, last words,
the lot); **SPARE** recruits the figure — it hands over its STORY items (the
plot must flow) but keeps its equipment loot as its own kit, swears a life
debt (its `joinWords`, played through the dialogue box), and joins the hero.
Only one figure walks with him at a time, so the verdict is a real trade
rather than a collection: see the party rules below.

A companion follows the hero in formation, fights autonomously with whatever
is in its weapon slot (its signature piece at first — Tesla's coil, Lucky's
staff), and can be dressed from the hero's own bag in a **weapon, helmet,
and chest piece only** — never legs or feet (tap its portrait under the HUD
avatar for the Diablo-2-style equip screen). When its blow kills a mob it may
float one of its `killQuotes` — hovering banter, never a dialogue pause. A
companion's damage and kills are booked into the run stats and pay the hero XP,
but they are kept **out of the menace meter** (like a powerup's — see
`menace.ts`): the RAMPAGE escalation answers an overpowered HERO, and a party
carrying the fight is not the hero out-fighting the horde by hand.

**Companions LEVEL UP on their own** (`companion-stats.ts`). A companion earns
its OWN levels from its OWN kills — decoupled from the hero — and its hp,
damage, and **signature power** all grow with that level. The level and XP ride
the loadout, so a companion keeps climbing across every level _and difficulty_:
level it up forever. Each companion's power grows a rank at a time: **Tesla's**
coil learns to **chain lightning** to another foe, **Amelia's** blunderbuss
packs **more pellets**, **Rasputin's** frost nova **widens and bites harder**,
and **Lucky's** magic-find aura **swells**. The current level, XP bar, and power
rank show on its equip screen.

You keep **exactly one companion**. Spare a second figure and the one you had
is **retired** on the spot — whatever armor you lent it comes back to your bag,
and every level it earned is gone. Choosing who walks with you is the point.

A companion is never permanently killed, but it is **beaten DOWN** and it
**stays down**: at 0 hp it kneels out of the fight, its aura silent, and
nothing in the world stands it back up — not time, not clearing the room, not
the merchant, not the walk to the next venue. The cure is a bottle of
**SMELLING SALTS** off the trader's shelf, **used from your bag**, which wakes
it groggy on a fifth of its health. Filling the rest of the bar is **your own
medkits**: pressing the companion's HUD portrait spends one on it (the portrait
wears a medkit badge whenever a press would do that rather than open its equip
screen). There is no passive regeneration at all — a friend is a supply line,
and worth budgeting for before a boss.

**LUCKY's aura** is the recruitment pitch: +50% MAGIC FIND for the whole
party while he's on his feet — every loot-tier roll's chance is half again
as likely (kill him instead and the clover is a one-off drop). **RASPUTIN's
FROST NOVA** is his: the unkillable mystic pulses a chilling ring on a cadence
(`CompanionDef.nova`) that damages every foe around him and **slows them to a
crawl**, making a plain axeman the party's crowd-control anchor — kill him
instead and the beard/severed-hand drops are yours. The party **rides the
loadout** between levels (`Loadout.companions`), so the choice made in the
rift walks through the far door with the hero — the level beyond it is built
with a companion at his side in mind. A companion you spared no longer
re-spawns as an enemy: on a rift replay its twin stays off the board while it
walks at the hero's side, so you never re-fight your own ally.

## Achievements

The game keeps an account-wide trophy shelf (`pwa/src/game/achievement-defs.ts`
— app data, not engine): ~130 badges across eight shelves. **STORY** (clear
each mission, beat the campaign on each of the five difficulties, collect
lore, meet the merchant), **COMBAT** (kill ladders for mobs / elites /
bosses, plus feats — watch a boss flee, set off a nuke, reach full RAMPAGE,
die once, clear a mission untouched or in under five minutes, and damage
ladders for the hardest single hit and the biggest one-strike burst — a
nuke's screen wipe, an AoE sweep, a pierce volley — with rungs sized to the
real damage model, **LOOT**
(counted ladders for magic / rare / unique finds — 10, 25, 50, 100-style
rungs — plus the first legendary and finding every unique), **WARDROBE**
(first equip per gear slot, every slot filled at once, and full outfits of
all-magic, all-rare, and all-unique quality), **ARSENAL** (one
badge per hand-authored unique, icon and name straight from its def),
**PARTY** (each spared legend and the full four), **HERO** (level 10 → 99),
and **MASTERY** (total runs and farming one mission).

Badges are earned on any hero — the ledger and lifetime counters persist
per install, across characters. A fresh unlock drops a gold banner with its
own chime (a deliberate notch below the level-up ding) mid-run; the browser
(title menu → ACHIEVEMENTS) shows every badge with live progress toward the
counted ones. The per-content badge groups
derive from the live registries, so new levels, difficulties, uniques, and
companions mint their badges automatically.

## Story items & costume

Plot pieces (`content/story-items.yaml`) — keycards that open the locked doors,
the recovered anti-grav unit — bank into `state.storyItems` and play their
`lore`. The EVA space suit is itself a story item
(`StoryItemDef.suitsHero`, dropped by the CHIEF OF SECURITY) — worn OVER
the hero's clothes and armor with no equip slot and no stats; picking it
up flips `playerAppearance` from the plain-clothes `hero` sprites to the
astronaut `player` sprites for good.

One story-item thread runs the whole campaign: **ADA'S TRAIL** — a placed
found-lore trace on each of the five campaign levels (`ada_soda`, `ada_sneaker`,
`ada_message`, `ada_jacket`, `ada_host`), escalating from scared to defiant to
sabotage so Ada reads as a person fighting her way forward rather than a beacon.
The rift's jacket scrap pays off the prelude's fixed zipper, and Boot Hill's
hat-jammed hand sets up the epilogue's "nice hat". The bunker's own find, the
**ZEROED LEDGER** (`bunker_ledger`), is the capstone reveal — every resident's
fortune transferred to the CORE, the proof the vault is a prison (see the
manuscript for the full text).
