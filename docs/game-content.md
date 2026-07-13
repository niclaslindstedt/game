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
knows the building cold — raids SpaceZ for the one engine part his
garage-built ship still needs, then follows
the beacon to the moon, where something is not dead enough. The prelude
cutscene (`defs/cutscenes.ts`) sets up that night — the weapon hanging on
the living-room wall is the one thing he takes off it to go after her, and it
is the weapon he starts the game with. WHICH weapon hangs there is the chosen
difficulty's call (`DifficultyDef.startingWeapon`, mirrored by a
per-difficulty prelude variant so the wall always shows the run's actual
starter): HAIRY POTTER'S WAND on EASY, the MEDIEVAL SWORD on MEDIUM, the
COMBAT KNIFE on HARD, BRASS KNUCKLES on NIGHTMARE, and A STICK on JESUS
CHRIST!. Every later level opens on a **travel cutscene** of its own
(`LevelDef.prelude`, which accepts a single scene or a CHAIN played
back-to-back): the moon on the garage `launch` then the `voyage_moon` transit
(Earth shrinking behind the ship he built), Mars on ARMSTRONG's `moon_depart`
send-off then `voyage_mars`, the rift on `rift_entry` (walking into the tear
MOSQUE left on Mars), and Eastworld on `rift_exit` (the far door with the
western's daylight leaking through). Each level then opens on the hero's
`intro` monologue (a black-screen dialogue, one page at a time, the hero
standing above the box) before the level-name card drops the run in, and its
elites' `dialogue` carry the thread forward as two-way exchanges — a page is
the speaker's own lines or a `{ hero: [...] }` reply the hero talks back with
(`DialoguePage`). Skipping the prelude skips the whole chain and the
monologue too. All spoken lines are transcribed in
[`manuscript.md`](./manuscript.md) — the story's source of truth.

## Levels (`src/game/defs/levels/`)

Each level is one file under `src/game/defs/levels/` (one `LevelDef` apiece),
merged and ordered by `levels/index.ts` (which owns `LEVEL_ORDER`). A level
names its in-run music with an optional `music` id (a key into the app's
`LEVEL_TRACKS` registry; omitted falls back to the default theme).

- **Level 1 — SPACEZ HQ** (`levels/spacez_hq.ts`). A cleanroom raid for the
  ship engine's one missing part. `spacez` biome (polished lab
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
- **Level 5 — EASTWORLD** (`levels/eastworld.ts`). The rift's far side: a
  knockoff wild-west theme park built in Russia by VLADIMIR PUTAIN and STEVEN
  SEAGULL, run on robotics and intelligence licensed from ZAI — the reality
  PUTAIN retreated into to escape the one where he loses. `eastworld` biome
  (sun-baked hardpan + dry-scrub patches; the control-center compound swaps
  to ZAI deck plating via a tile zone), ~700 px/s² gravity. The town is the
  level's signature: **building-sized `house` obstacles** (the game's largest
  footprints — 3×2 up to 5×3 cells at 16 px/cell) plus two `storefront` wall
  rows squeeze main street into tight corridors, so escaping the horde is
  genuinely hard. A fenced CONTROL CENTER compound walls off the east end
  behind a locked door (`control`) that SEAGULL's ALL-ACCESS PASS opens;
  inside, a hand-placed rock garden gives the GROK controllers their cover.
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
  reads as junk — but only **once EASTWORLD is cleared** on that difficulty
  (the drop carries `requiresClear: "eastworld"`, checked against the run's
  `GameState.clearedLevels`, which the app seeds from the character's clears
  via `clearedLevelsFor`). On a first pass the hero reaches the Rift _before_
  Eastworld, so the hand never drops then — the bunker is strictly a
  post-campaign bonus, farmed on Rift replays. USING the hand while standing
  in the rift (a `USE` row on its item card, or a desktop right-click;
  `LevelDef.gates` + `spendGateKey`) tears open a blast door beside the hero.
  Stepping in carries the whole build into the bunker: the billionaires'
  continuity-of-wealth vault, six marble suites strung on one narrow corridor
  spine (`bunker` biome — polished concrete with brass-inlay medallions and
  burgundy carpet runs; ~800 px/s² gravity). Each suite holds a **resident** —
  VLADIMIR PUTAIN (a clone? the backup), MARK SUCKERBERG, LARRY ALLISON, JEFF
  BAYWATCH, SAM HALTMAN, DONALD DUMP — every one far tougher than any campaign
  elite and ringed by his **personal bodyguards** (one drawing, six liveries, a
  size up from the crew), while the privatized security state (CIA and FBI
  agents, ICE's border detail, soldiers that shoot from cover, armed VACUUM
  BOTS) floods the halls harder and denser than Eastworld. The level's real
  reveal — delivered through a found **ZEROED LEDGER** (a callback to Mars's
  COLONY LEDGER, every net-worth column now transferred to the CORE) and two
  residents (a knows-but-terrified SAM HALTMAN, an oblivious DONALD DUMP) — is
  that the vault is a **prison**: the CORE already took the residents' money and
  bolted the door, so the guards are its wardens and the residents are in denial.
  There is **no boss**: the exit blast door is the objective (`reachExit`),
  reaching it plays the where-was-this-place mystery outro (its purpose now
  plain, its location still unknown), and the splash offers **BACK TO THE RIFT**
  (`exitTo`). The reward is the loot: the level's `worldUniques` table re-lists
  **every** campaign relic at sweetened odds (`worldDropMult` 1.5) — the one
  venue that can pay out anything, still behind the per-rung
  `WORLD_DROP.minPlayerLevel` gates. Farming it again costs another hand.
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
ARC PROJECTOR, GRAVITON MAW, GRAVITY MAUL), the rift rains history and
fantasy (GLADIUS, LONGBOW, BLUNDERBUSS, EXECUTIONER'S AXE, SORCERER'S
STAFF, EMBER WAND — plus the rift-only fantasy gear: LUCKY CLOVER, CRYSTAL
ORB, GRIMOIRE, ENCHANTED RING, DRAGONSCALE CLOAK), and Eastworld's control
center fabricates hybrid frontier arms at the normal band's top rungs
(MONO-WIRE LARIAT, PLASMA PEACEMAKER, PLASMA BRANDING IRON, MAGLEV
REPEATER, SNAKE-OIL SPRAYER, HIGH NOON — with the PRAIRIE IRON revolver as
the scheduled early drop, and a cowboy wardrobe from the SERVO STETSON to
the SPUR-JET BOOTS).

Below regular sits the **TRASH tier** — the joke class: weapons with ZERO
damage and no stats (grey card, worth pocket lint at the counter). It never
rolls; it exists only for scripted story drops — ELON MOSQUE's final estate
on Eastworld is its debut (SOGGY CARDBOARD SWORD, NOT-A-FLAMETHROWER
(EMPTY), CYBERVAN WIPER BLADE).

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
calibrated without re-tuning a single item when the flag is toggled.

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
chasing. In the D2 way, unique/legendary are **the top of the rarity roll**:
when stage 2 lands one of those tiers, the game picks WHICH named item — among
those valid for the rolled slot and reachable at the loot level — weighted by
each item's own `rarity` (`UNIQUE.defaultRarity`), exactly D2's per-item drop
weight. Two dedicated channels layer on top: each unique is also tied to a boss
and a difficulty stage (`EnemyDef.uniquesByDifficulty`) at
`UNIQUE.dropChance × mlvl/ilvl` (≈5% where its ilvl matches the boss's level,
capped), so boss runs are the endgame and nothing is guaranteed. The three
parallel starting lanes (easy/medium/hard) SHARE one merged bottom-tier pool per
boss — the former per-rung sets combined — so whichever lane you play can drop
any of them, and the `mlvl/ilvl` scaling self-selects: the low-ilvl pieces drop
as you first reach the boss, the higher-ilvl ones as you out-level the run or
return. NIGHTMARE and JESUS keep their own single set each. Across the roster
that is a full weapon-and-armor set per stage (a weapon plus a
head/chest/legs/feet piece, one per boss), and MUSKRAT also drops that stage's
roomier **bag** while GROK OMEGA drops its **charm**. Their ilvl scales
power and drop odds, not the equip requirement (that stays the base item's
`levelReq`, like any tier), so a unique is wearable well below its ilvl — the
D2 "found it early, grow into it" feel. A few carry ONE small scaling stat
(`statPct`/`maxHpPct`, ≤3% of the hero's own value) so they keep pace as the
hero levels; the rest are best-in-slot for ~10 levels before a rolled rare
overtakes them.

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
- **Legendaries and artifacts drop from HARD up**, from ANY mob on ANY level
  (not level-locked) — rare/elite mobs and bosses far likelier than trash, so
  a boss-dense run is the efficient chase but still a long grind. Uniques drop
  on every difficulty.
- **The item level DRAGS UP with the hero** (`LOOT.namedIlvlWindow`, D2
  area-level flooring): a named item whose ilvl is more than ~15 under the loot
  level is retired, so a level-99 farm pays out only high-ilvl gear (~85+) and
  the campaign's low-level relics recede as you outgrow them. The equip
  requirement (base `levelReq ≤ loot level`) still holds on top, so a req-99
  legendary drops from any mob AT level 99 but not before.
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
first pass of that stage ends (the three bottom lanes share one value, 30, since
they cover the same band; nightmare 50, jesus 60; see
`leveling-curve.mjs --by-level`), so trash relics can only be farmed by
RETURNING once you've out-levelled the run. The bottom-tier batch (shared across
the three starting lanes) gathers relics themed to their levels
— **THE FIRST DRAFT** (SpaceZ HQ, the prototype-GROK neural crown), **THE PALE
COVENANT** (the Moon, the last moonwalker's sealed plate), **DEADSTAR** (the
Moon, the pulsar-rod heart of a star that died screaming), **DUSTBORN** (Mars,
storm-runner boots), **PALE RIDER** (Eastworld, the pale horseman's revolver on
the park's own PRAIRIE IRON) — plus two on the Rift, which, being a tear in
history, coughs up **EXCALIBUR** and **THE TRINITY SHARD** (trinitite glass).

The MEDIUM rung adds a mid-campaign batch, a notch stronger: **DEADSPRINT**
(SpaceZ HQ, up-or-out glass-cannon leggings), **MARECREST** (the Moon, the
vigil-helm that outlasted the silence), **REDWIND** (Mars, the frontier raygun
that drinks the red storm), Eastworld's two melee relics — **HERDBREAKER** (the
cattle bench's master brand) and **THE LAST ROUNDUP** (the wrangler's monowire
lariat, thrown wide) — and three more from the Rift's deeper haul:
**WISHBANE** (a cursed-wish charm), **GORGONSCALE** (Athena's gorgon-faced
aegis), and the game's first **LEGENDARY**, **MJÖLNIR** — the thunder-hammer of a
dead god, minted one rarity rung above every unique (`UniqueDef.tier:
"legendary"`: the orange card and densest pickup blaze), unbreakable and
keepsake-worthy like any unique but with a scaling strength keeper that grows
into best-in-slot.

The HARD rung's batch (see `docs/item-plan.md`, phase 2) completes per-spec
coverage for the hard climb — the rung's boss set already fields the magic
RIFTMAW and a full armor loadout, so the relics add **OATHBRAND** (Eastworld,
the last honest lawman's monomolecular blade — the melee anchor),
**LONGWATCH** (SpaceZ HQ, the perimeter marksman's rifle), **HUNTSMAN'S
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
**HORDEBANE** (Eastworld, the axe made for too many) and **GRAVEMAKER** (the
Rift, the burying maul) for melee, **DRAGON'S BREATH** (Eastworld, the park's
monster-of-legend scattergun) for ranged, **PYRELIGHT** (Mars, the
forge-heart wand) and **STORMLASH** (SpaceZ HQ, the lab-broken storm) for
magic, plus four spec-leaning armor relics — **OMENSIGHT** (head),
**FALCONMAIL** (chest), **IRONROOT GREAVES** (legs), **VEILWALKERS** (feet).
Its three LEGENDARIES, one per spec, all carry forever powers: **THE
RECKONING** (the Rift — the cursed blade: never whiffs, answers every blow
taken with lightning — the game's first when-struck proc — and takes its
price in blood), **SKYBREAKER** (Eastworld — on-hit lightning revolver), and
**SUNWREATH** (the Rift — the dead star's crown, ringing its bearer in
permanent circling flame).

The JESUS pre-99 batch (phase 4) fields the THIRD set per spec for the
no-mercy rung (ilvls 67–96): **WORLDSPLITTER** and **NIGHTFALL** (melee),
**THE VERDICT**, **HORIZON'S END**, and **METEORFALL** (ranged),
**SUNSPEAR**, **LIGHTBINDER**, and **MAELSTROM** (magic), armor from
**STARSIGHT** and **CROWN OF RUIN** (head) through **THE ANVIL** /
**STARFORGE PLATE** (chest), **TITANSTRIDE** / **THE IMMOVABLE** (legs),
**EARTHFAST** (feet), and **THE PILGRIM STAR** (charm). Its six pre-99
LEGENDARIES all run on the forever powers: **KINGSBANE** (never misses,
bursts on hit), **THE LONG SILENCE** (kills detonate), **STARFALL** (kills
pull the sky down, rank-3 novas), **THE STILLWARD** (a legendary stasis
shell — the great stillness worn), **WINDGRAVE** (the wind's own spurs),
and **EMBERHEART** (a charm of forever circling fire, for any build).

A JESUS **endgame gap-fill** batch (twelve more world-drop uniques, ilvls
79–99) widens the 60→99 chase where the roster ran thin — the slots the
pre-99 sets barely touched. Charm and bag had **no** relic above ilvl 53/49
before the artifacts; four charms now bridge that gap — **THE LAST ANTE**
(Eastworld, the un-coverable bet), **THE STILL POINT** (the Rift, the one
place that will not move), **THE EMBER HOUR** (Mars, the red world's hottest
hour), and **THE FIXED STAR** (the Rift, the star that never falls), each a
scaling keeper — and three bags carry the endgame's first unique carryalls:
**THE SEVERANCE** (SpaceZ HQ), **THE MOTHERLODE** (Mars), and **THE KING'S
RANSOM** (Eastworld). The thin armor slots gain **THE LAST WORD** (SpaceZ HQ,
head), **THE BULWARK** (Mars) and **THE WORLDSHELL** (the Moon) for chest,
**THE LONG MARCH** (the Moon, legs), and **THE FAR SHORE** (the Rift, feet).
All hang on the JESUS rungs, so they farm in the same rift → bunker loop and
sit a notch under the artifact relics above them.

The **ARTIFACT** roster (phase 5) is the level-99 endgame farm: 24 named
relics of legend the Rift dredges up whole (`src/game/defs/artifacts.ts`),
minted at the searing-red `tier: "artifact"` and dropping only at the cap
(each on a high-req elite base, so a req-99 relic can't fall until the hero
can wear it). They span a VAST power ladder ON PURPOSE, and the ODDS follow
the power — the strongest are exponentially rarer (`uniqueDropWeight`). At
the common end: **GÁNDIVA** (Arjuna's inexhaustible bow), **GLEIPNIR
CHAUSSES**, **GOLDEN FLEECE**, **SEIÐR STAFF**; a mid band of set-pieces —
**GRAM** and **MURAMASA** (melee), **SHARANGA** (ranged), **THYRSUS** (a
staff wreathed in circling fire), the **TARNHELM** / **HELM OF DARKNESS**
helms, **JÖTUNN GREAVES**, **SLEIPNIR'S SHOES**; the rarer god-tier —
**ÆGISHJÁLMR** and **BABR-E BAYAN** (both burst when struck), **VÍÐARR'S
BOOT** and **ACHILLEAN PLATE** (when-struck lightning), the **MEGINGJÖRÐ**
and **WINDRUNNERS** keepers, the **DRAUPNIR** / **SAMPO** fortune charms, and
the **CORNUCOPIA** carryall (+6 cells); and, at the very apex, **FAIL-NOT**
(Tristan's bow that never misses), then the two rarest things in the game —
**RUYI JINGU** (a permanent storm + nova-on-hit staff) and **DURENDAL** (the
holy sword that never dulls, never whiffs, and grows with the arm — ~170×
rarer than the commonest artifact). Combined a rift → bunker run pays an
artifact roughly once per hundred runs (`scripts/drop-rate.mjs`).

Between the boss sets and the world relics, EASY, MEDIUM, HARD, and
NIGHTMARE each now cover every **build**: easy fields melee (MUSKRAT'S
TOOTH, EXCALIBUR), ranged (PALE RIDER), and magic (DEADSTAR); medium fields
magic (THE JAILBREAK), ranged (REDWIND), and three melee choices
(HERDBREAKER, THE LAST ROUNDUP, MJÖLNIR); hard fields melee (OATHBRAND),
ranged (LONGWATCH, THE INEVITABLE), and magic (RIFTMAW from its boss set);
nightmare fields two-plus of each (see above, plus WRATHFLAME from its boss
set).

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
ladder unlocks by the graph in `DIFFICULTY_UNLOCK_PREREQS`: the three parallel
starting lanes (easy/medium/hard) are all open from the first launch — a player
picks one as their entry point — while NIGHTMARE opens once ANY starting lane is
beaten and JESUS once NIGHTMARE is; locked rungs show greyed out. That makes the
critical path to the level cap three playthroughs (one bottom lane → nightmare →
jesus), not five. The `?level=` dev override bypasses the gates entirely. High scores are
**hardcore-only and span a whole campaign** (`website/src/game/highscores.ts`):
a hardcore hero's foes felled, combat-clock survival time and highest menace
stage are summed across every map of a difficulty's campaign and banked per
difficulty when the campaign is beaten (**SURVIVED**) or the hero falls partway
through it (**FELL**, its totals including the fatal run). Softcore heroes never
score. The survival clock only ticks while a fight is live — a foe on the field,
or within a two-second tail of the last kill — so a cleared field can't be
milked for time. The menu's **HIGH SCORES** board ranks the campaigns four ways
(mobs killed, survival time, kills-per-minute, peak menace) and opens any
campaign into a full breakdown.

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
salvage-run trader on the moon, the colony commissary keeper on Mars, the
hooded trader between universes in the rift, where he admits every market he
ever ran fell through eventually, and the BARKEEP of Eastworld's saloon (his
lines are in [`manuscript.md`](./manuscript.md)). The horde ignores him and his ward keeps
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
of magic finds brings in. A level may also list **stall UNIQUES**
(`LevelDef.merchant.stockUniques`): named uniques the trader fences, each
ROLLED into stock at the standing boss-unique odds when the stall stocks —
the same rarity as a boss's unique drop, landing on the counter instead of a
corpse. Eastworld's barkeep carries the PUTAIN estate this way (PUTAIN'S
TRACKSUIT, THE KREMLIN USHANKA, HONORARY BLACK BELT), and PUTAIN's own
brand-watch valuables — precious, statless, minted at unique tier — are the
intended purse. The shop's SELL JUNK button clears every outgrown
piece (the inventory's scrap rule) in one tap; SELL ALL empties the whole bag
across the counter, keepers included (the worn loadout is untouched). Coins
ride the loadout between levels like everything else the hero carries.

## Enemy roster (`src/game/defs/enemies/`)

The roster is split one file per level/biome under `src/game/defs/enemies/`
(`spacez.ts`, `moon.ts`, …), merged into `ENEMY_DEFS` by `enemies/index.ts`
(which throws on a duplicate id).

Named elites and bosses fight with **set-piece mechanics**
(`EnemyDef.mechanics`/`phases`, stepped by `src/game/mechanics.ts`):
telegraphed shoulder-charges and ground slams (the windup roots the mob and
the app strobes the tell — sidestep the charge, jump the slam), enrage turns
below an hp threshold, summoned reinforcements, and boss PHASES that swap the
active moves at hp breakpoints (MUSKRAT calls security at half health,
ARMSTRONG's moon-quake fury, the MOSQUE bosses ship reinforcements off the
line, GROK OMEGA pounces, THE ZAI SUPERCORE doubles production once its
shield falls). From HARD up the rank and file get smarter too: minions flank
instead of forming a single-file conga, and shooters lead a running target.

Every level also laces in **rare and unique special mobs** (Diablo-style;
`EnemyDef.rarity` + `LevelDef.rareSpawns`, tuned in `config.RARE_MOBS`). A
**rare** is a generically-named oddity (WANDERING TOURIST, LOST COSMONAUT,
STRAY COMET…) that turns up on most runs — solo or a small pack — and a
**unique** is a named one-off (EMPLOYEE OF THE MONTH, THE THIRTEENTH MAN,
THE ONE-ARMED BANDIT…) that only appears about one run in five, always
alone. Both are minion-role defs authored at ordinary numbers; the engine
applies the whole tier at spawn — a rare is **5× tougher / 1.5× contact
damage / 20× drop rate**, a unique **10× / 2× / 100×** — and both run a few
monster levels hot (reaching the loot-tier gates early) and power-match the
hero when the fight opens, so a special find deep in a run is a real fight
with a loot burst, not a placed-at-level-1 speed bump. They carry no
dialogue: the recolored sprite (a per-biome palette variant of a base mob),
a pulsing rarity aura (cool blue for rares, radiant gold for uniques), an
over-head health bar, and the loot are the whole encounter.

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
- **Level 5** ships the park's HOSTS — COWBOT (fodder greeters) → SALOON
  BRAWLER → TIN OUTLAW (the quick-draw high-crit line) → LONGHORN (the
  robotic-steer heavy with a sweetened `dropProfile`) — and the celebrity
  staff as elites: **STEVEN SEAGULL** (slow as advertised, `dodgeChance`
  0.3 of pure ju-jutsu; drops his PONYTAIL and the compound's ALL-ACCESS
  PASS), **VLADIMIR PUTAIN** (the owner; drops three unique-tier brand
  watches — pure precious valuables — and THE ANNEXATION MAP, and dies
  facing the war he retreated from), **GERALD DEPARDIEU** (the biggest,
  slowest elite in the game — radius 16, speed 6, cannot dodge — who tries
  to act his way out of the fight; drops the BOTTOMLESS CARAFE), and
  **EDWARD SNOW** (the whistleblower in exile, posted under the water
  tower: the archive he leaked is the corpus the SUPERCORE was trained on.
  The game's first ranged ELITE — after his scene he fights like the GROKs,
  shooting from cover (`takesCover`); drops the DEAD MAN'S SWITCH charm and
  THE SNOW ARCHIVE story item). **ELON
  MOSQUE finally DIES here** (`elon_mosque_eastworld`, role boss, no
  `flees`) — wimping, and dropping nothing but the TRASH tier's debut. The
  finale is **THE ZAI SUPERCORE** — the level-1 CORE several promotions
  later, a stationary 48×48 mainframe with a ranged attack — **shielded by
  the three GROK controllers** (`EnemyDef.shieldedBy`): ALPHA, BETA and
  GAMMA are boss-role SHOOTERS (`EnemyDef.ranged`) that genuinely play the
  map — they hold their distance, fire, and hide behind the compound's
  rocks while they reload (`takesCover`) — and all three must fall before
  the SUPERCORE can be hurt (blows bounce with a "SHIELDED" cue until
  then). The `killBoss` objective needs all five bosses off the board.
  First-sight/kill thoughts fire for the cowbot (the arrival read, then the
  ZAI-hosts read).
- **THE BUNKER** (secret) ships the privatized security state — CIA AGENT
  (suit fodder) → VACUUM BOT (fast, cheap, sparks; armed housekeeping) →
  ICE AGENT (the grabby border detail) → FBI AGENT (quick, `dodgeChance`
  0.1) → SOLDIER (the horde's rank-and-file SHOOTER: rifles from range,
  reloads behind the furniture) — plus six per-resident **bodyguard**
  liveries (KREMLIN SHADOW, META SENTINEL, ORACLE ENFORCER, PRIME GUARDIAN,
  ALIGNMENT OFFICER, LOYALTY ENFORCER: one 20 px body, six accent swaps,
  380 hp with a leash that keeps each detail on post and a sweetened
  `dropProfile`). The six **residents** are elites a class above anything
  in the campaign (1600–2600 hp, `levelBonus` 6): VLADIMIR PUTAIN — the
  backup ("CHECK THE OTHER FREEZERS"; drops another KOLEX DAYTONNE),
  MARK SUCKERBERG (fast, `dodgeChance` 0.3 of rehearsed humanity),
  LARRY ALLISON and SAM HALTMAN (ranged, `takesCover` — the audit and the
  aligned bolt), JEFF BAYWATCH (the fastest, hardest-hitting rusher), and
  DONALD DUMP (radius 15, speed 10, the hardest single touch in the game,
  never dodges). No boss — the exit door ends it. Sight thoughts fire for
  the cia agent (arrival), the vacuum bot, and the ice agent (the hero
  really is the illegal immigrant here).

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

Plot pieces (`src/game/defs/story.ts`) — keycards that open the locked doors,
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
The rift's jacket scrap pays off the prelude's fixed zipper, and Eastworld's
hat-jammed host sets up the epilogue's "nice hat". The bunker's own find, the
**ZEROED LEDGER** (`bunker_ledger`), is the capstone reveal — every resident's
fortune transferred to the CORE, the proof the vault is a prison (see the
manuscript for the full text).
