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
- Authoring any of it → the skills in [`.agent/skills/`](../.agent/skills)

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

The campaign is a hub (`objective.type: hub` — never clears, no horde, no victory)
plus the venues, ordered by `ladder.yaml` and each level's `index`. Travel is
authored on the hub as `travelDoors`, and **a road the player has not earned is
never named** — a door with no open destination either says so in the hero's own
voice (`unready`) or is not drawn at all.

## What carries between levels

Clearing a level banks a **loadout snapshot** — level, stats, worn equipment,
bag, pocketed powerups and the ammunition pouch — onto the character
(`extractLoadout` → `pwa/src/game/characters.ts`). Starting the next hands it to
`createGame(...)`, which dresses the run in it (`applyLoadout`,
`src/game/arrival.ts`): ids re-minted, bag re-sized to the carried STRENGTH,
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

## Ammunition — what a ranged weapon spends instead of wearing out

A gun does not get blunt. **Ranged** weapons carry no `durability` at all and
eat **ammunition** instead; melee and magic made the opposite trade and eat
nothing. It is one trade, not two independent fields, and the item schema
refuses either half being wrong. Rules in `src/game/items/ammo.ts`, knobs in
`src/game/config/ammo.ts`.

- **Three kinds, split by what the thing IS** — bullets, arrows, cells. Every
  firearm shares one round, because a game that asks a player to track four
  calibres has bought a spreadsheet and sold a shooter.
- **One round per TRIGGER PULL, never per projectile.** A shotgun's whole volley
  is one shell; a VOLLEY talent's extra arrows are one nock.
- **The pouch, not the bag.** Rounds stack on the hero (`Player.ammo`), each
  kind to its own independent cap, and carry between levels. Ammunition a hero
  cannot pick up because he is carrying a spare helmet is a frustration with
  nothing to say.
- **A run opens stocked for the weapon in HAND**, since a run whose starter is a
  shotgun would otherwise open with a hundred rounds of the wrong thing. The
  built-in sidearm's kind gets a small reserve behind it (`AMMO.sidearmReserve`)
  — enough that the dry-weapon swap always has something to draw, not so much
  that the pouch shows two full stacks for one gun. When the starter is melee or
  magic the sidearm is the hero's only gun, so it opens with the full stock.
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
- **A powerup is a moment, not a resource.** The drop ladder's `abilityShare` is
  its leanest slice, and WHICH power a drop pays is separately weighted by each
  def's `rarity` — so the run-savers are rarer within that slice instead of
  sharing it evenly. The merchant reads the same weights to stock and to price.
- **A powerup's kills stay out of the menace meter** — a bomb clearing the
  screen is not the hero out-fighting the horde.
- The NUKE is in no pool: it arrives as a mercy drop for a hero being overrun
  (`canDropNuke`), one in the dock at a time.

## Coins — the two faucets and the two drains

The **merchant** (`src/game/merchant.ts`, config `MERCHANT`/`ECONOMY`) is one
trader in a per-venue costume (`LevelDef.merchant`). He roams until the hero
first walks up; the **meeting** roots him for the rest of the run, pins him on
the map, and **rolls his stall once** — every entry has a finite quantity and
nothing restocks, so a counter can be cleared out.

Coins enter a run by **selling loot** and by **gold off the floor**, and leave
it at the stall and on the AUTO PILOT meter (`GOLD` and
`AUTOPILOT.coinsPerSecond` are two ends of one lever). Sell value is item level
× tier (an order of magnitude per rung) × material.

Gold has one rule worth knowing because nothing authors it: **only humanoids
carry a purse** — read off the `locomotion` and `anatomy` the roster already
carries, so treads, driftings and collapsed stars pay nothing from their rank
and file. One minion in five pays at all (`GOLD.minionChance`); the floor of a
fight should be blood rather than money, and the rate is made up for in the size
of a pile rather than the number of them. Elites and bosses always pay and
scatter it, because a boss's money arriving as one tidy heap reads like a
medkit.

## The horde answering an overpowered hero

**Menace** (`src/game/menace.ts`) reads how lopsided the hero is — not how fast
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

## Companions — the spare-or-kill verdict

Beating a spareable unique to 0 hp pauses the run in the `choice` phase. **KILL**
lands the withheld blow through the ordinary kill rails (loot, last words, the
lot). **SPARE** recruits the figure: it hands over its STORY items — the plot
must flow — but keeps its equipment as its own kit, and joins the hero. Only one
walks with him at a time, so the verdict is a trade rather than a collection.
Roster in `content/companions.yaml`, engine in `src/game/companions.ts`.

A companion fights autonomously and is dressable from the bag. Its kills stay
out of the menace meter for the same reason a powerup's do. A downed companion
is put back on its feet only by SMELLING SALTS, which every stall stocks — the
merchant no longer revives for free.

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
