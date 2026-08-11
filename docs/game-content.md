# Game content — the rules the catalogs don't state

Everything this game is made of is authored YAML under [`content/`](../content),
and that tree is the lookup source: what a weapon does, what a mob fields, what
a venue holds and what anyone says is **read from the file, never from here**.
The generated [`/library/`](../pwa/scripts/library) site is the same data as
browsable pages (bestiary, arsenal, mission guide, story), and the game teaches
its own controls in-game.

So this page carries only what a catalog cannot: the **rules the numbers sit
inside**, each with the file that owns it. A sequel replaces this file, because
none of it is engine.

- How a catalog compiles → [`content-pipeline.md`](./content-pipeline.md)
- How the engine is put together → [`architecture.md`](./architecture.md)
- The plot, and every spoken line → [`story.md`](./story.md), [`manuscript.md`](./manuscript.md)
- Authoring any of it → the skills in [`.agents/skills/`](../.agents/skills)

## A venue is two files, and its floor is rolled

The MISSION (`content/levels/<id>.yaml`) is the venue **minus its floor**: name,
story, ladder rung, hazards, merchant, loot pools, thought pins, music. Its MAP
(`content/maps/<id>.yaml`) is a BLUEPRINT the geometry is **carved from on the
run's own seed** — chambers, walls, props, the horde's knots, the caches and the
boss's hiding place all rolled fresh. No two runs are the same walk, and no
intended route exists.

The consequence is a rule that bites anything reading a level: inside a run, the
map is `runLevelDef(state)`, never `levelDef(state.level.id)`. Nothing outside a
run may import `mapgen/` — the menus reach levels through
`defs/levels/summary.ts`, because the generator would drag the whole catalog onto
the startup path.

The campaign is a hub (`objective.type: hub` — never clears, no horde, no
victory) plus the venues. A mission joins the ordered campaign with
`campaign: true` and takes its place from its own `index`; `secret: true` is the
off-campaign venue, which is what the hub itself is (`LEVEL_ORDER` /
`SECRET_LEVEL_ORDER` in `defs/levels/summary.ts`). What `ladder.yaml` owns is
the per-map, per-rung mob band, not the order. Travel is
authored on the hub as `travelDoors`, and **a road the player has not earned is
never named** — a door with no open destination either says so in the hero's own
voice (`unready`) or is not drawn at all.

## A door that only somebody else can open

Most of what a venue keeps behind a lock, it keeps behind a **keycard** — a story
item on a body, carried up to the chain (`LevelDef.doors`, `opens: "key"`). One
door in the campaign is the other kind: it has no key anywhere in the game, and
the only thing that ever opens it is **somebody else using it**.

That is `LevelDef.arrivals` (`engine/game/arrivals.ts`), and GOODCO's front door is
the case it exists for. The hero lands on the **staff lot** — an arrival district
(`MapArea.arrivals`) carrying no ambient horde at all — with the building's wall
in front of him and the fog over every inch of it. Every so often a car rolls in
off the road, parks in the rank, and a member of the night shift gets out and
walks to a door in that wall and badges through it. Following one is how the way
in is found, and it is the only way in there is.

Three rules hold the beat together and each is load-bearing:

- **The lot's whole cast is NEUTRAL** — the guards already standing on it and the
  staff arriving. The hero walks onto it holstered (the level's scripted first
  blow waits INSIDE, past the doors), so anything out there that could fight him
  would be a fight he cannot answer.
- **It may never stop happening.** The entrance is the only way on with the
  mission, so an arrival that starts walking always badges — a walker whose leg
  times out moves on rather than retrying — and a run whose door is still shut
  with nobody walking toward it pulls the next car forward.
- **It spends nothing off `state.rng`.** A car park is presentation, and a draw
  spent on presentation shifts every loot roll after it, so the lot's own
  decisions ride a private stream parked on `ArrivalPlan.rng`.

The autopilot knows the beat too (`bot/entrance.ts`): locked out, it falls in
behind whoever is crossing the tarmac instead of pressing the wall the objective
is behind.

## …and a venue you leave the way you arrived

The lot is also where the hero's **own car** is standing, because he drove here
(the trip in is the DRIVE minigame). One venue in the campaign therefore has no
LEVEL CLEAR button at all: `LevelDef.exitByCar`, and GOODCO is the case it exists
for. The part he came for is no use in the building it came out of and the ship
it goes into is on his own lawn, so what the story says happens after PAYLOAD-1
stops moving is that he walks the floor back out through the gate, crosses the
tarmac to the wagon and drives.

What the field changes is the END of the victory countdown and nothing else. The
objective clears, the loot window runs, and the `victory` event still fires on
the same tick — which is what banks the clear, unlocks the next venue and books
the campaign score. What does not happen is the phase change: the run stays
`playing` with the win banked (which is exactly `GameState.staying`), the level's
authored line is raised so the player is told where to go, and the car becomes a
door. A level authoring it owes itself a `car` travel door, because that is where
the destination comes from.

**The car is a door only while it IS one**, and that is one predicate every
surface reads: `carIsWayOut` (`engine/game/vehicles.ts`). A hub's car always
answers yes — home is a place you leave — and an `exitByCar` venue's answers no
until the venue is over. The gold "you can get in this" mark over the roof, the
tap that boards it and `enterCar` itself all ask it, so the mark is up exactly
when the press works.

**Boarding is the departure, not the start of a lap.** A hub's car is DRIVEN
out — there is a roll-up to open, a driveway to cross and a road at the end of it
(`LevelDef.driveOut`) — while a car park has none of that, and "drive around a
car park until the game agrees you have left" is a puzzle nobody set. So on an
`exitByCar` venue getting in hands straight over to the same DIM the roll-up
does, and the driving is the minigame on the far side of it.

**And the wagon is one object across the whole night.** He leaves the garage in
it, drives a minute of road in it, parks it on the lot, drives it home and leaves
it in his own bay — four objects, one car — so its condition travels as a
parameter at every seam: the dents, the shot wheels and the parts working free as
`CarDamage` (`RunParams.car` / `DriveParams.car`), and the blood a body left on
the paint in the app's own carrier beside it (`pwa/src/game/car-condition.ts`),
because the engine has never known a car can get dirty. The car standing in
GOODCO's staff lot is therefore visibly the car that went through the crowd on
the way there, and the leg home starts from it rather than from a replacement.
The ARCADE cabinet is deliberately outside all of this: it plays the same road
for a score, so every attempt gets a clean car.

The autopilot has a rung for this too (`bot/hub.ts` `exitCar`), placed BELOW the
loot and the errands: the ride finishes the job, then walks to the wagon and
leaves. Without it a botted or headlessly simulated campaign clears GOODCO and
stands on a swept factory floor until the clock runs out.

## Home knows what time it is

A venue may stand under a **sky** (`sky: earth` on the mission), and then its
light follows the player's own clock — bright at noon, dark by ten in the
evening, with a long ramp either side. **Exactly one venue opted in: the
GARAGE.** Everything else the campaign visits is airless, sealed or
underground, and a level that names no sky is never dimmed by anybody's watch.

Two rules hold it up, and both are about who owns which fact. The engine never
reads a clock — `step()` is deterministic, so the APP reads the hour once and
hands the run a `daylight` level as a session parameter, which is also what puts
a whole hosted party in ONE night rather than one per time zone. And **the story
outranks the clock**: the visit that plays a venue's opening is the night the
script says it is, so the campaign still starts on the evening Ada walks out for
chips, whatever time the player picked up the game. From the second visit home
keeps the player's own hours.

What burns in that dark is the blueprint's: the two barn lights bolted either
side of the roll-up door, the yard post out on the lawn, the trader's own
back-lit machine — and the BAY itself, which is lit as a room, up to its walls,
because it is a garage with the lights on. A driven car brings its headlights
with it. What the dark LOOKS like is the renderer's (`docs/rendering.md`), and
none of it touches a rule: sight, reach, aggro and spawns are exactly what they
are at noon.

## …and home is the one place the campaign leaves a mark on

Every other venue is the same venue whenever the hero walks into it, and it has
to be: a mission is a place the story visits. **The hub is a place the story
HAPPENS TO** — he keeps building rockets in the bay and lighting them on the
grass behind it — so the lawn out there climbs a ladder as the campaign goes by,
and nothing on it ever gets better:

| The run has cleared | The patch the ship stands on              | The four trees round it |
| ------------------- | ----------------------------------------- | ----------------------- |
| nothing yet         | grass, like the rest of the lawn          | in leaf                 |
| the moon            | charred — the launch AND the landing home | scorched, burnt through |
| Mars as well        | ash, cracked open — burnt past charring   | bare skeletons          |

Three rules make it a mark rather than a setting, and they are the ones a second
venue doing this would have to obey too:

- **THE LADDER IS THE SAME LADDER THE SCENES CLIMB.** The launch and the
  homecoming (`content/cutscenes/launch.yaml`, `earth_return.yaml`) stand their
  own house and their own trees on this lawn, off the SAME `cleared:<levelId>`
  tags the map reads (`MapStage` — `engine/game/mapgen/stages.ts`, authored as
  `stages:` in `content/maps/garage.yaml`). The player watches one lot and walks
  the other; a scene and a map with separate ladders would drift on the first
  edit to either.
- **A RUNG REDRESSES AND NEVER RESHAPES.** It may swap a district's ground and a
  prop's sprite, and nothing else — so the carve is identical on every rung and
  the trees stand in exactly the same places all campaign. That is what makes it
  read as the same trees after a fire rather than as a different lot.
- **THE FIRE STOPS AT THE EDGE OF THE PATCH IT WAS LIT ON.** Three more trees
  stand further out and never burn at all; after Mars they are the only green
  left on the lot. A lot where everything went black at once would just look
  like somewhere grim.

## What carries between levels

Clearing a level banks a **loadout snapshot** — level, stats, worn equipment,
bag, pocketed powerups and the ammunition pouch — onto the character
(`extractLoadout` → `pwa/src/game/characters.ts`). Starting the next hands it to
`createGame(...)`, which dresses the run in it (`applyLoadout`,
`engine/game/arrival.ts`): ids re-minted, bag re-sized to the carried STRENGTH,
hero arriving rested. Losing a run never erases it — a retry restarts the level
with the same carry-over.

A **dev jump** to a mid-campaign level with nothing banked (`?level=`, a
playtest bot, wiped storage) falls back to `deriveArrivalLoadout`: a stand-in
computed from the earlier levels' rosters through the real leveling curve, so
testing a late venue means arriving with roughly what clearing the earlier ones
would have banked. Anything measured on a dev jump is measured against that
stand-in, not against a real campaign.

**Loot pools accumulate.** Each venue's `loot.weaponPool` keeps what the earlier
maps taught and adds its own, so the arsenal grows across the campaign rather
than being replaced — which is why a base weapon named by only one venue (there
is one) stops being available the moment the hero leaves it.

## THE CACHE — where a hero KEEPS something instead of carrying it

Everything a hero owns rides on his body: what is worn, and what fits in the
bag. That is right for loot, which is meant to be spent or sold — but it made
the piece a player was SAVING (the off-build unique, the set item three pieces
short, the weapon for a level they have not reached) cost a bag cell for as long
as they saved it. **THE CACHE** is D2's answer: a chest standing against the
garage's north wall where a piece can be put down without being given up. The
bag stays a bag, and keeping stops competing with carrying.

**IT IS A LADDER, AND THAT IS THE FEATURE.** Ruth's errand runs once per
difficulty, and each rung she has been further back into her mother's house — a
grander piece of furniture with its own name, its own art, and one more ROW of
cells (`DifficultyDef.cache`):

| Rung      | What she brings    | Cells |
| --------- | ------------------ | ----- |
| EASY      | THE KEEPSAKE BOX   | 16    |
| MEDIUM    | THE HEIRLOOM CHEST | 24    |
| HARD      | THE STEAMER TRUNK  | 32    |
| NIGHTMARE | THE DOWRY CHEST    | 40    |
| JESUS     | THE INHERITANCE    | 48    |

Eight columns wide at every rung and every breakpoint, which is D2's own stash
width — so a rung is visibly one row more than the one below, and the top of the
ladder is 8 × 6, which is D2's stash exactly.

Five rules define it, and `engine/game/cache.ts` is the one place they live:

- **It is EARNED, once, forever, and only GROWS.** Ruth pays it for THE SCALE,
  the last of her three errands (`reward.cache`) — the only errand in the game
  that gives something back rather than paying for something. What a hero owns
  is a HIGH-WATER MARK on the character (`Character.cacheSlots`), so a death, an
  abandoned run and a fresh gentler difficulty all leave it exactly as deep as
  it was: a stash that shrank when the player started an easier game would have
  to decide which of their things to throw away. Running the errand again at or
  below what they already have still pays its XP, coins and loot, and simply
  leaves the chest alone.
- **The cells are always the CEILING long** (`CACHE.maxSlots`, 48). How many are
  usable is `GameState.cacheSlots`; the rest draw LOCKED, the same way the bag
  draws the room STRENGTH has not bought. That is what makes dropping back to an
  easier rung a change to a number rather than a decision about what to delete.
- **It is the HUB'S ALONE.** Only the garage's blueprint stands one (a `cache`
  landmark), and that is the whole balance of it: a stash reachable mid-mission
  is a bag with no cap, and the decision the bag exists to force — what do I
  carry home — would stop being a decision.
- **The chest is public; what is in it is private.** In a co-op session anybody
  may walk up to it and open THEIR OWN (`Player.cache`, withheld from every
  other seat exactly as the bag is). One piece of furniture, one stash per hero.
- **Nothing in it is culled.** The contents ride the loadout like the bag, and
  unlike every other carried list they are NOT filtered by what the body can
  still wear — a chest is where a piece goes precisely because the hero cannot
  use it yet.

The window is two grids and one gesture: tap a bag cell to keep it, tap a chest
cell to take it back, and the engine picks the free slot either way. A full
destination refuses the move and leaves the piece where the player last saw it;
nothing ever lands on the floor.

## The empty hand — what a hero holds when he holds nothing

**A hero may carry no weapon.** The weapon slot comes off like every other
slot: unequip it and the piece banks to the bag, exactly as a helmet does.

What is left is his own two hands — the engine's built-in `fists`
(`UNARMED_DEF_ID`), which is not a weapon the player owns but the absence of
one:

- **It is minted on demand and never banked.** It has no icon, so the bag's
  weapon bay draws EMPTY and the field hero is drawn holding nothing. Equipping
  anything over it makes it vanish rather than displacing it into a cell, and a
  hero who falls with empty hands leaves no weapon on his corpse. Ask
  `isBareHands`, never a tier or an affix.
- **It is MELEE, so a punch scales off STRENGTH** like any other physical blow
  — a bruiser who loses his sword still hits like a bruiser. It reaches 20 px
  (under the brass knuckles' 24: knuckles are a weapon strapped over the hand
  and reach further than the hand does) through the narrowest cone in the game,
  and it throws no slash crescent — it reads as reach and recoil
  (`WeaponMotion.punch`).
- **It eats nothing and breaks never**, which is the one property the rest of
  the system leans on. The on-break swap and the dry-weapon swap both prefer
  the best wieldable weapon in the bag and fall back to the hand, so neither
  can fail: a hero whose blade snaps or whose rifle clicks is never left unable
  to land a blow, and therefore never unable to earn the kill that drops him
  the replacement.
- **~30 effective dps**, deliberately off the damage-budget line and under
  every real weapon in the game (the leanest opening pool base reads ~40, and
  the ladder climbs from there — `node scripts/weapon-budget.mjs` prints the
  figure for the exempt weapons too). It is the last resort — just not a death
  sentence.

The slot is still TYPED never-empty, and that is a statement about the type
rather than about the player: the hundred-odd reads of `equipment.weapon`
(damage, reach, the bot's stand-off, the paper doll) keep answering without a
branch.

## Ammunition — what a ranged weapon spends instead of wearing out

A gun does not get blunt. **Ranged** weapons carry no `durability` at all and
eat **ammunition** instead; melee and magic made the opposite trade and eat
nothing. It is one trade, not two independent fields, and the item schema
refuses either half being wrong. Rules in `engine/game/items/ammo.ts`, knobs in
`engine/game/config/ammo.ts`.

- **Three kinds, split by what the thing IS** — bullets, arrows, cells. Every
  firearm shares one round, because a game that asks a player to track four
  calibres has bought a spreadsheet and sold a shooter.
- **One round per TRIGGER PULL, never per projectile.** A shotgun's whole volley
  is one shell; a VOLLEY talent's extra arrows are one nock.
- **The pouch, not the bag.** Rounds stack on the hero (`Player.ammo`), each
  kind to its own independent cap, and carry between levels. Ammunition a hero
  cannot pick up because he is carrying a spare helmet is a frustration with
  nothing to say.
- **A run opens stocked for the weapon in HAND, and for nothing else**, since a
  run whose starter is a shotgun would otherwise open with a hundred rounds of
  the wrong thing. A MELEE or MAGIC opening therefore carries no rounds at all:
  there is no fallback gun behind the hero to stock for — what is behind an
  empty hand is the hand itself (`UNARMED_DEF_ID`), which fires nothing and
  cannot run dry.
- Every read of `player.ammo[...]` outside `ammo.ts` is a cap, an overflow
  remainder or a dry-swap about to disagree with the others.

## The XP scroll — the pickup that uses itself

Every other pickup is banked (a medkit, a repair kit, a powerup) or paid on
touch (gold). The scroll is neither: walking over one **reads** it, doubling
that hero's XP for a fixed window (`Player.xpBoostMs`, counted in `stepTimers`,
applied at the single `grantXp` door). Knobs live in `content/leveling.yaml`.

**It pays nothing on its own, and that is the design.** What it is worth is what
the hero does with the window — read into a pack it pays many times over, read
over a cleared floor it doubles nothing. So it needs no mob-pricing and no
below-level penalty to stop a player farming outgrown ground, and it cannot
distort the leveling table: it only ever makes the same kills count twice. **A
second scroll refreshes the window rather than stacking it.**

## Powerups, and why the dock stays a moment

Every map's `loot.abilityPool` keeps the earlier maps' powers and debuts two of
its own, so a venue announces itself in the dock as well as on the ground. What
each power does is `content/powerups.yaml`; the rules around them are:

- **Authored at level 1, scaled at runtime** (`abilityPowerScale`, the level ramp
  × INT), so a power keeps clipping the same fraction of a level-appropriate
  healthbar all campaign.
- **A powerup is a moment, not a resource.** The drop ladder gives
  `abilityShare` one of its leanest slices, and WHICH power a drop pays is
  separately weighted by each def's `rarity` — so the run-savers are rarer
  within that slice instead of sharing it evenly. The merchant reads the same
  weights to stock and to price.
- **A powerup's kills stay out of the menace meter** — a bomb clearing the
  screen is not the hero out-fighting the horde.
- The NUKE is in no pool: it arrives as a mercy drop for a hero being overrun
  (`canDropNuke`), one in the dock at a time.

## Coins — the two faucets and the two drains

The **merchant** (`engine/game/merchant.ts`, config `MERCHANT`/`ECONOMY`) is one
trader in a per-venue costume (`LevelDef.merchant`). He roams until the hero
first walks up; the **meeting** roots him for the rest of the run, pins him on
the map, and **rolls his stall once** — every entry has a finite quantity and
nothing restocks, so a counter can be cleared out.

A venue may post him three ways, and the level def picks one. The default is
that **wanderer**. `parked:` stands him at the carve's counter, open from the
first tick with no meeting scene — a fixture rather than an encounter. `beat:`
does the same and then sets him WALKING: he paces the strip the map carved him
(districts flagged `beat: true` → `LevelDef.merchantBeat`) end to end for the
whole run. A walking counter needs two rules nothing else does — a tap HAILS
him to a stop so the hero can reach him (`hailMerchant`, cleared when the shop
closes), and a driven car can **run him down** (`CAR.roadkillSpeed`), which
shuts the stall for that visit only. Nothing about a merchant persists, so the
next arrival mints another one on the same pitch. The hub's dealer is the
shipped example, and he works the road the car leaves by on purpose.

`line:` is what a trader says **across the counter** — one sentence, drawn on
the shop panel on every visit. It is not a scene, and that is the whole point:
a greeting the player has to dismiss before buying a medkit is a toll booth,
so the once-only `greeting:` stays the meeting's and this is the trading one.

Coins enter a run by **selling loot** and by **gold off the floor**, and leave
it at the stall and on the AUTO PILOT meter (`GOLD` and
`AUTOPILOT.coinsPerSecond` are two ends of one lever). Sell value
(`items/worth.ts`) is item level × tier (an order of magnitude per rung) ×
material × make quality, and a stack crosses the counter whole.

Gold has one rule worth knowing because nothing authors it: **only humanoids
carry a purse** — read off the `locomotion` and `anatomy` the roster already
carries, so treads, driftings and collapsed stars pay nothing from their rank
and file. One minion in five pays at all (`GOLD.minionChance`); the floor of a
fight should be blood rather than money, and the rate is made up for in the size
of a pile rather than the number of them. Elites and bosses always pay and
scatter it, because a boss's money arriving as one tidy heap reads like a
medkit.

## The horde answering an overpowered hero

**Menace** (`engine/game/menace.ts`) reads how lopsided the hero is — not how fast
he swings — so a fresh hero cannot trip it and a genuinely dominant build can.
Difficulty decides only how touchy it is. When it lights, the horde lures more
foes, evolves what it sends, and scales elites and bosses so they cannot be
one-shot.

**Evolving means LEVELLING.** A menace stage of 3 spawns every mob three levels
over the level it would otherwise have carried — nothing else. One number does
all of it: a mob's level already sets its health, its contact damage, the XP it
pays and the loot gates it rolls against, so a rampaging horde is harder to
survive and worth more to farm at the same time.

How far it may go is the rung's **allowance plus the hero's headroom**: each
difficulty authors a peak (easy 3, medium 5, hard 10, nightmare 100; JESUS has
none at all), and to that is added however many levels the hero stands over
this venue's normal mobs. Since a venue pins its mob level per rung, a player
who returns to an outgrown map opens a gap — and the rampage may spend exactly
that gap, bringing the crowd back up to roughly his own level and no further.
On the uncapped JESUS rung there is no "further" at all: a sustained rampage
fields mobs at level 200 and beyond, and past the level cap of 99 every extra
mob level widens the odds on the very rare tiers, topping out at three times a
level-99 kill's (`LOOT.overCapChaseMult`). What a rung CANNOT pay it still
cannot: the difficulty gates (legendaries from hard up, plate, rings, amulets)
are untouched by any of this, so a level-99 hero rampaging on easy farms easy's
own table harder — he does not unlock a harder rung's items.

On the hardest two rungs it also opens **HELLGATES** (config `HELLGATES`,
`SpawnerSpec.hellgate`) — rampage-only spawn points laced across every map,
invisible until menace reaches `openStage`. Each stage past the threshold widens
the alive cap, thickens the batches and shortens the intervals, all bounded, and
bounded again across every gate by `globalMaxAlive`. The mobs that come through
belong to no venue's story, which is why they are their own roster.

## What an errand costs — the farm rate and the top-up

An errand is priced in KILLS, and the two shapes that ask for them are
deliberately the same size of job. A `kill` objective asks for **40** of a breed
the map's horde is thick with, or **20** of a scarce or heavy one. A `collect`
objective's piece falls at `QUESTS.dropChance` — **0.08**, one in twelve and a
half — with the pity floor at `QUESTS.dropPity` (25) forcing the tail, which
comes to about eleven kills a piece: four pieces and a forty-kill cull cost the
same walk.

**The smallness of that rate is the whole rule.** A measured MEDIUM run of
GOODCO HQ kills 176 monsters in three minutes, so an errand asking for eight of
them, or for pieces falling off a third of them, was over before its offer box
had been read twice. The build refuses anything above **0.125** off a breed the
venue's blueprint `horde` is made of. It says nothing about a piece off a
ONE-OFF — an elite, a guardian, a bystander, a rampage-only hellborn — where a
certainty is correct and usually necessary: there is one of that mob, so the
roll decides whether the beat happens at all rather than how long the hunt is.

**And the horde is topped up to pay for it** (`engine/game/quests/restock.ts`). A
carved map drops `waves` entirely, so every monster the hero will ever fight is
queued in a spawn point that drains exactly once — which is what lets a level be
cleared, and what would make an errand accepted on already-swept ground sit at
0/40 forever with nothing alive to count. Taking one therefore counts what the
field can still deliver (alive, plus what the ordinary points still owe, times
`QUESTS.restockHeadroom` because a queued mob in a room the hero never enters is
not a met mob) and queues the shortfall into those points, bounded by
`QUESTS.restockMax`. It is a shortfall top-up and not a stocking pass: on a map
the hero has barely walked into it adds nothing, because a mob mix is a
difficulty knob and an errand has no business re-tuning the venue it is asked
on.

## Companions — the spare-or-kill verdict

Beating a spareable unique to 0 hp pauses the run in the `choice` phase. **KILL**
lands the withheld blow through the ordinary kill rails (loot, last words, the
lot). **SPARE** recruits the figure: it hands over its STORY items — the plot
must flow — but keeps its equipment as its own kit, and joins the hero. Only one
walks with him at a time, so the verdict is a trade rather than a collection.
Roster in `content/companions.yaml`, engine in `engine/game/companions.ts`.

A companion fights autonomously and is dressable from the bag. Its kills stay
out of the menace meter for the same reason a powerup's do. A downed companion
is put back on its feet only by SMELLING SALTS, which every stall stocks —
there is no free revive across the counter.

## Story items, achievements, and the trail

Plot pieces (`content/story-items.yaml`) bank into `state.storyItems` and play
their `lore`; some open locked rooms, and one **suits the hero**
(`StoryItemDef.suitsHero`) — worn over clothes and armor with no slot and no
stats, flipping `playerAppearance` for good. One thread runs the whole campaign:
a placed found-lore trace on each campaign level, escalating so Ada reads as a
person fighting her way forward rather than a beacon.

Achievements are **app data, not engine** (`pwa/src/game/achievement-defs.ts`):
an account-wide shelf of badges across story, combat, loot, wardrobe and the
rest, mirrored to Game Center and Steam by the committed store manifests. A
change to the shelf regenerates those manifests in the same commit — they are
drift-tested against a fresh build.

## The hero's name — `{HERO}`

The hero is called whatever the player named him, and the game says it. The name
is not engine state: it changes no roll, no seed and no tick, so it is neither a
`RunParams` field nor anything that travels the wire. It is a **token in the
authored text**, `{HERO}`, resolved by whichever surface draws the line
(`engine/game/hero-name.ts`) against the name of the hero that _viewer_ is playing —
which is also the only answer that makes sense in a party, where the box on each
screen belongs to a different person.

It is used in two positions, and the difference matters when authoring:

- **As a label** — the name over his own words. Every pinned thought's
  `speaker` and every cutscene actor whose `id` is `hero` write the token, so
  the header of any box he speaks from is the character the player made rather
  than a pronoun.
- **As a line** — somebody says it to him. This is rationed on purpose: a name
  lands because almost nobody in the campaign uses it. The shipped campaign
  spends it exactly four times, on the four people who genuinely know the man
  (the LAB SCIENTIST, RUTH, THE ARCHITECT, THE BRO SUPERCORE), and
  `tests/content/hero_name_test.ts` asserts that list — a fifth is a story
  change, not a formatting one. `docs/manuscript.md` → "The hero's name" is the
  script's own account of why.

Spell the token exactly. A near miss (`{hero}`, `{ HERO }`) resolves to nothing
and prints as `?HERO?`, because the pixel font has no brace glyph — the same
test refuses one. A caller with no player to ask (a headless sim, the published
library) gets `HERO_NAME_FALLBACK`, the NEW GAME field's own placeholder, so the
line still reads as a sentence.

**THE BRACES ARE A CLOSED VOCABULARY, AND THERE ARE TWO.** Beside `{HERO}` sits
**`{CACHE}`** — the provenance line for whichever chest the difficulty pays
(`DifficultyDef.cache.line`, see THE CACHE above). Ruth's handover writes it as
a whole page, and the rung supplies the sentence: a flea-market box on the
gentlest rung, a thing her family swears came off a king on the hardest. It
exists because the errand is ONE file and the ladder is five, and writing five
copies of THE SCALE to say five sentences would put the ladder in the wrong
place. A page whose token resolves to nothing — a rung that pays no chest, which
a mod's cut-down ladder may have — is DROPPED rather than shown blank.
`tests/content/hero_name_test.ts` holds the whole vocabulary in one list, so
adding a third token is a deliberate edit there rather than a silent new
template language.
