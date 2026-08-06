# The mod format

Field-by-field. Start from [`README.md`](README.md) if you have not yet, and
keep [`examples/greenhouse`](examples/greenhouse) open beside this — every field
below appears there with a comment.

The guiding rule: **a mod's content is authored exactly like the game's.** Where
this document is thin, the shipped files under [`../content/`](../content) are
the full reference, because they are the same format going through the same
validator.

## The schemas — the last word on every field

Each file kind has a **schema module** that decides what its YAML may say:
which fields are required, what each accepts, and what the error reads like when
it doesn't. They are ordinary readable JavaScript with the reasoning in
comments, and the mod compiler runs the **same** modules the game's own build
runs — so what a schema accepts is exactly what your mod may say. **When this
document and a schema disagree, the schema is right.**

| Your file                                         | Schema (`../scripts/asset-tools/…`)                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `mod.yaml`, `ladder.yaml`, `levels/<id>.yaml`     | [`level-schema.mjs`](../scripts/asset-tools/level-schema.mjs)           |
| `maps/<id>.yaml`                                  | [`map-schema.mjs`](../scripts/asset-tools/map-schema.mjs)               |
| `enemies/<biome>/<id>.yaml`                       | [`enemy-schema.mjs`](../scripts/asset-tools/enemy-schema.mjs)           |
| `items/<rarity>/<id>.yaml`                        | [`item-schema.mjs`](../scripts/asset-tools/item-schema.mjs)             |
| `sets.yaml`                                       | [`set-schema.mjs`](../scripts/asset-tools/set-schema.mjs)               |
| `companions.yaml`                                 | [`companion-schema.mjs`](../scripts/asset-tools/companion-schema.mjs)   |
| `powerups.yaml`                                   | [`powerup-schema.mjs`](../scripts/asset-tools/powerup-schema.mjs)       |
| `talents.yaml`                                    | [`talent-schema.mjs`](../scripts/asset-tools/talent-schema.mjs)         |
| `quests/<id>.yaml`, `quest-givers.yaml`           | [`quest-schema.mjs`](../scripts/asset-tools/quest-schema.mjs)           |
| `cutscenes/`, `thoughts.yaml`, `story-items.yaml` | [`story-schema.mjs`](../scripts/asset-tools/story-schema.mjs)           |
| `sprites/<family>/<name>.yaml`                    | [`sprite-schema.mjs`](../scripts/asset-tools/sprite-schema.mjs)         |
| `sounds/<id>.yaml`                                | [`sound-schema.mjs`](../scripts/asset-tools/sound-schema.mjs)           |
| `music/<id>.yaml`                                 | [`music-schema.mjs`](../scripts/asset-tools/music-schema.mjs)           |
| `difficulties.yaml`                               | [`difficulty-schema.mjs`](../scripts/asset-tools/difficulty-schema.mjs) |

---

## `mod.yaml` — the manifest

Required at the mod's root. Everything else is optional.

| Field         | Required         | What it is                                                                                                                                              |
| ------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | yes              | 3–32 chars, lowercase letters, digits and dashes, starting with a letter. **Never change it after publishing** — it is how the game remembers your mod. |
| `name`        | yes              | The display name, shown in the MODS screen and on the Workshop item.                                                                                    |
| `version`     | yes              | Yours to choose; the game only shows it and stamps it on heroes.                                                                                        |
| `author`      | yes              | Shown in the MODS screen.                                                                                                                               |
| `description` | no               | A sentence or two. Becomes the Workshop item's description on first publish.                                                                            |
| `kind`        | no               | `addon` (default) or `conversion`. See README.                                                                                                          |
| `campaign`    | conversions only | Your level ids, in play order. A conversion REPLACES the game's campaign, so there is nothing to fall back to.                                          |
| `brand`       | conversions only | `title` (≤28 chars) and optional `tagline` (≤48) — what the TITLE SCREEN calls the game while your conversion is on. See below.                         |
| `contents`    | to publish       | Every file the game loads, and what each one is. See below — the game shows these lines to a player who taps your mod.                                  |

### `contents:` — every file, and what it is

The manifest's inventory: one entry per file the game loads.

```yaml
contents:
  - path: levels/greenhouse.yaml
    summary: THE GREENHOUSE - a sixth venue, an orbital seed vault still running.
  - path: sounds/shotgun_fire.yaml
    summary: A wetter bark for the shotgun.
    change: replaces
```

| Field     | Required | What it is                                                                                      |
| --------- | -------- | ----------------------------------------------------------------------------------------------- |
| `path`    | yes      | Relative to your mod folder, with `/` separators.                                               |
| `summary` | yes      | One line, 8–120 characters, in the game's own alphabet. Written for a PLAYER, not a compiler.   |
| `change`  | no       | `adds` (default) — something new — or `replaces`: it takes over something the game already had. |

**The game reads this.** Tapping a mod on the MODS screen opens its page, and
that page is built from these lines: the file, whether it adds or replaces, and
your sentence about what it is. Nobody else can write them — a compiler can
count two enemy files, it cannot say that one of them is a gardener who will
fight beside the hero if she is spared.

It is also an **allow-list**. `cli.mjs validate` refuses a mod with a file this
block does not describe, and `cli.mjs package` zips exactly what is listed — so
nothing ships that nobody meant to ship.

The compiler treats it as optional (a mod published before the block existed
still loads, with a warning and a page that can only count its files);
`validate` requires it, and so does anything you intend to hand somebody.

### `README.md` — what your mod is, for a person

Required by `validate`, carried by `package`, and the first thing anybody reads.
`description` is one sentence on a menu row; this is the paragraph or three
behind it — what the mod is, what it adds or changes, whether it joins the
campaign or replaces it, who made what, and what people may do with it.
[`examples/greenhouse/README.md`](examples/greenhouse/README.md) is the shape.

### `brand:` — opening under your own name

A total conversion is a different game with a different story, and it used to
open under this one's name. Declare a brand and the title screen wears yours
instead, from the moment the player switches your mod on:

```yaml
kind: conversion
brand:
  title: HOLLOW STATION
  tagline: NOBODY ANSWERS
```

Three rules:

- **Conversions only.** An addon is content _inside_ this game; renaming the
  whole game from a corner of the main menu is not its to do.
- **Write it in the game's own alphabet.** The title is drawn in the pixel font,
  which falls back to `?` for a glyph it has no cell for — so an accent would
  render as `H?LLSTR?M` at triple size across your own front page. The compiler
  refuses it and names the character (`cli.mjs ids --kind glyphs` is the full
  set).
- **It renames the SCREEN, not the install.** Your saves, the game's storage,
  the browser tab and the store listing are untouched — a mod that moved those
  would orphan the player's roster.

## `ladder.yaml` — where your levels sit

One block per difficulty rung (`easy`, `medium`, `hard`, `nightmare`), one row
per level of yours:

```yaml
easy:
  my_level: { hero: 16, mob: [12, 18] }
```

- `hero` — the hero level a player is expected to arrive at
- `mob` — `[start, end]`, the mob-level band across the map, shallow to deep

JESUS is not listed: it stays relative to the player.

**What you cannot restate here** is the `ramps` catalog (`meek` … `apex`), the
hp curves, or the stamina ladders. Those are the game's economy — `savage` means
the same thing on your map as it does on Mars, which is what lets a player read
your level's difficulty without learning your private scale.

## `levels/<id>.yaml` — a MISSION (a venue minus its floor)

The file stem must equal the level's `id`. Required fields: `id`, `index`,
`name`, `foes`, `gravity`, `biome`, `tiles`, `intro`, `objective`,
`decorClearance`, `loot`, and exactly one of `campaign: true` / `secret: true`.

**A mission is not a map.** Where the walls run, what stands on the floor, where
the horde knots and where the boss is are carved fresh every run from
`maps/<id>.yaml` (below) — so a mission that authors `width`, `playerSpawn`,
`spawns`, `walls`, `obstacles`, `decor`, `chests`, zones, a `path` or any other
coordinate is a **compile error**, and the message names the field that replaces
it. What a mission owns is everything a venue is APART from its floor: its story,
its ladder rung, its hazards, its merchant, its loot pools, its thought pins.

Two authoring keys are **not** yours to set either: `mobLevels` and
`intendedLevel` come from `ladder.yaml`, and a level that states them is an
error.

Full reference: [`../content/levels/moon.yaml`](../content/levels/moon.yaml) is
a complete, heavily commented mission.

## `maps/<id>.yaml` — the venue's map, carved fresh every run

**Required for a venue anybody can play.** A level with no blueprint compiles,
but nothing can build a run from it — the map IS this file. It is
**carved from the run's own seed**, so the boss has to be **found**: no guidance
arrow is emitted, and the fog-of-war minimap is the only record of where the
player has been.

The file stem, the `id` and the `level` are all the same word: **a blueprint
carves the mission it is named after.** An addon may only name one of its own
levels — re-carving a shipped venue is a `kind: conversion`'s business.

**A blueprint is a RECIPE, not a layout.** It carries only what the carve needs:

| Field                  | What it says                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `areas`                | what KINDS of place the map is made of — the rule engine, and where the walls come from                        |
| `size`                 | the world rectangle the map is carved into — a width, a height and a chamber count                             |
| `layout`               | chamber size, doorway width, how many loops, how big a district grows, which object the walls are built of     |
| `objects`              | the palette, typed by PURPOSE (`wall`, `obstacle`, `cover`, `crate`, `chest`, `decor`, `landmark`, `light`, …) |
| `horde`                | how thick the mobs stand, which breeds, and the depth window each one appears in                               |
| `elites` / `guardians` | the set pieces the carve places for you                                                                        |
| `bystanders`           | the NEUTRAL cast an errand sends the hero to talk to, dropped into cells the horde stands in                   |
| `boss`                 | who, and the candidate **compass regions** one is rolled from per run                                          |

Everything else about the mission — its name, its story, its intro, its loot
pools, its music, its merchant — is **inherited from the level it names**, so a
venue is still described in exactly one place.

A set piece and a knot name a **ramp** (`meek`, `bold`, `fierce`, `savage`,
`brutal`, `monstrous`, `endgame`, `apex`) rather than per-difficulty numbers —
the ramp is expanded against your ladder rows at compile time. So a map reads as
intent, and every difficulty number comes from one file.

Three rules to author by:

- **A count is a DENSITY.** Densities are per 1,000,000 world px², so the
  dressing follows the floor a district's cells actually rolled rather than
  piling up in a small one and leaving a big one bare.
- **A place is an `enclosure`, not a wall.** `none` flows into its neighbour,
  `soft` fences it off with a wide gate, `hard` seals it behind one doorway. The
  barrier between two cells falls out of the PAIR — you never draw a wall.
- **Say WHERE with a compass region**, never a coordinate: `northeast`,
  `center-east`, `south`. `node mod/tools/cli.mjs ids --kind regions` lists every
  name the game accepts, and a typo is a compile error rather than a boss quietly
  relocated.

**A KEYCARD LOCKS A ROOM.** Mark an area `lock: true` (a `hard` enclosure that
may hold neither the boss nor the landing) and list the STORY ITEM ids that open
one under `locks:`. The carve seals the deepest such district it can afford to,
one door per key, and pays for the walk with a cache of its own. You never say
which room: it refuses any candidate whose sealing would cut the map in half,
and it keeps the landing, the objective, every set piece and every placed item
outside — so the key is always reachable without the key. `annex.lock` does the
same to the boss annex's ELEVATOR: the pad is drawn and labelled, and the car
does not come until the hero is carrying the pass.

**A VENUE MAY STAND UNDER A SKY, AND THEN IT KNOWS WHAT TIME IT IS.** Put
`sky: earth` on the MISSION and the venue's light follows the player's own
clock: bright at noon, dark at ten in the evening, with two long ramps between
(the app reads the hour, the engine never does — `src/game/daylight.ts`). It is
opt-in for a reason — an airless moon and a sealed corridor look the same at
midnight — and a level that never names a sky is exactly as bright as it always
was.

What burns in that dark is the blueprint's business, and there are three ways to
put light in it.

**A `light` OBJECT is a POOL on the ground**, pinned to a carved anchor
(`at: spawn | goal | stall | counter | home`) and nudged off it
(`offset: {x, y}`). Give it a `fixture` — the sprite of the thing throwing it —
or the pool reads as a bug rather than as a lamp:

```yaml
- id: yard_lamp
  type: light
  at: goal
  offset: { x: -34, y: 16 }
  fixture: lamp_post # the thing standing there throwing it
  light:
    radius: 52 # world px the pool fades to nothing at
    color: "255, 206, 138" # omitted = warm tungsten
    intensity: 0.9 # 0–1, how much of the night it lifts
    flicker: 0.2 # 0–1, how badly it wavers (0 = a steady lamp)
```

**A `door` MAY HANG ITS OWN PAIR.** `lamps:` on the map's approach door bolts a
fixture at each END of every chain it hangs, half a wall's radius onto its
outside face — so the opening is flanked wherever the carve happened to punch
it, and the fittings sit ON the wall (the game draws lamps one pass after the
walls, which is what makes that possible):

```yaml
- id: garage_door
  type: door
  sprite: garage_door
  radius: 8
  lamps:
    sprite: wall_lamp
    light: { radius: 58, color: "255, 206, 138", intensity: 0.92 }
```

**AND A ROOFED DISTRICT MAY SIMPLY BE LIT.** `lit: 0.82` on a `hard` area is
"the lights are on in here": the carve emits that chamber's own rect, so the
night stops at its walls. It is the only way to light a ROOM — a pool wide
enough to fill one spills through the wall behind it.

Two rules to author by. Keep the radii SMALL relative to the venue: the lot is
read on a phone in landscape, and two pools that touch light the whole place
back to daylight. And keep a source under every outdoor pool — the schema warns
when a `light` has no `fixture`, and the only exemptions are a fitting that
genuinely hangs overhead and a pool pinned to something already drawn (`at:
counter`, the trader's own back-lit machine).

None of it touches a rule: a lamp lights no fog, targets nothing and changes no
reach — it is somewhere the player can see what he is doing. A driven CAR brings
its own headlights wherever it goes, and needs no authoring at all.

**`patrol: true` ON AN ELITE** walks it a beat instead of leaving it standing.
The route is derived from the room the carve grew it in — a sweep down the cell's
long axis, inset off the walls — so it fits every size and every seed.

Full reference: [`examples/greenhouse/maps/greenhouse.yaml`](examples/greenhouse/maps/greenhouse.yaml)
is a small commented one, and [`../content/maps/moon.yaml`](../content/maps/moon.yaml)
is a shipped venue's.

## `enemies/<biome>/<id>.yaml` — a monster

The file stem is the id; the `<biome>` directory is organizational only (the
compiled catalog is flat, and a duplicate id across your tree is an error).

Required: `id`, `name`, `lore`, `role` (`minion` / `elite` / `boss`), `sprite`,
`hp`, `speed`, `radius`, `contactDamage`, `critChance`, `contactCooldownMs`.

`lore` is a short paragraph saying what the thing IS — the same register as an
item's `description`, and required of the rank and file as much as of a named
boss, because a horde nobody wrote a line about reads as a texture rather than
as the inhabitants of somewhere. Nothing in the simulation reads it; the
bestiary prints it under the monster's portrait.

`sprite` names a **family**, not a file: the renderer draws `<sprite>_0` and
`<sprite>_1`. Both frames must exist — in your `sprites/` or in the base game —
and the compiler refuses the mod if they do not, because a missing sprite draws
as **nothing at all** rather than as an error.

`gore` is what sprays when it is struck — `blood` (the default), `ecto` for a
ghost, `sparks` for a machine — and `anatomy` says what shape it is under the
skin, for the one moment a blunt blow BURSTS it: `humanoid` (the default) loses
a head among the meat, a `beast` throws the same viscera and bone with no face
in it. Only a body that bleeds is ever asked, so a `sparks` monster authoring an
`anatomy` is refused rather than ignored — it can never come apart.

`wealth` is how rich the thing was in life — a multiplier on the GOLD its
corpse sheds. Omitted is an ordinary pocket, and whether there is a purse at all
is read off the body: something that walks on **legs** and is not a `beast`
carries money, and a thing on `wheels` or one that `float`s does not. Set it
above 1 for the moneyed (and to open the pockets of a machine or a haunting that
should pay anyway); set it to `0` to close the pockets of something that would
otherwise have paid. The compounded ceiling is what to watch — it multiplies
with the role, so a `boss` at `wealth: 20` pays hundreds of ordinary bodies.

Full reference: [`../content/enemies/`](../content/enemies).

### `mechanics:` — the set-piece moves

An `elite` or a `boss` may carry telegraphed moves. (A `minion` may not: it is
turned away at the top of the mechanics step, so authoring them there is dead
weight rather than an error.) They go under `mechanics:`, and there are two
ways in.

The four **originals** are named fields — `charge`, `slam`, `enrage`, `summon`.
They are the game's oldest vocabulary and a lot of content authors them:

```yaml
mechanics:
  charge:
    windupMs: 700
    speedMult: 3.5
    range: 160
    cooldownMs: 6500
```

The **ability catalog** is the one to reach for now. It is a LIST, and every
entry names a primitive from `enemyAbilities` in
[`catalog.json`](catalog.json) — ten of them are BOSS TIER (they reshape the
arena: a beam that sets the floor alight, shutters that grow around the hero,
pods out of the sky) and ten are ELITE TIER (they reshape the next four
seconds: a ring of motes, a slow underfoot, a drain that holds while you stand
in it). Nothing checks which tier a role uses — an elite may carry a boss's
move and frequently should not.

Every entry owes `windupMs` and `cooldownMs`, plus that primitive's own fields;
the compiler names anything missing rather than letting a half-written move
quietly never fire. Optional on any of them: `minDifficulty` (the move appears
only at that rung and above — this is how a top rung gets to be categorically
harder rather than merely statier), `windupFloorMs` (a floor the top rungs
squeeze the tell toward, never below), and `bark` (one line, spoken the FIRST
time this mob casts it, over the fight rather than in a dialogue box).

```yaml
mechanics:
  abilities:
    - id: orbit_guard
      windupMs: 580
      cooldownMs: 10500
      count: 5
      radius: 32
      angularSpeed: 2.2
      orbRadius: 5
      damageFrac: 0.5
      hitIntervalMs: 680
      durationMs: 7000
      sprite: elite_mote
      look: # ← what makes it YOURS
        core: "74, 200, 118"
        hot: "230, 255, 214"
        deep: "8, 26, 14"
        spark: "246, 214, 96"
```

Authored order is CAST order, so put the move you want the mob to lead with
first.

#### `look:` — why your elite does not look like ours

The primitive is shared; the **colours are yours**. `look:` is the same
four-stop kit a powerup carries — `core` (the move's own hue), `hot` (its
bright inner light), `deep` (the dark that grounds it) and `spark` (its motes)
— written as `"r, g, b"` triples. The renderer re-hues the shared art onto it,
so one `orbit_guard` is a ring of survey drones on one mob and a ring of
guttering candles on another.

Omit it and the move draws in a neutral arcane blue-violet — it will work, it
just will not look like itself yet. Author a PARTIAL kit and the compiler
refuses it, because a kit missing a stop falls back silently and the only
person who would ever notice is somebody who already knew what it should have
looked like.

`damageFrac` and friends are fractions of the mob's own `contactDamage`, so a
move scales with whatever you tuned the monster to — you never restate a
damage figure.

#### Every number is YOURS

There is no shared tuning file for these. **Everything an ability does is
authored on the mob that casts it**, in this file — the damage, the reaches, the
durations, the cooldown, the windup, the colours. Two mobs naming the same
primitive share the CODE and nothing else.

That extends to the knobs that decide when a move is worth casting at all, which
are optional and fall back to something derived from your own numbers rather than
to a constant:

| ability         | optional           | default                                             |
| --------------- | ------------------ | --------------------------------------------------- |
| `orbit_guard`   | `range`            | four ring-radii off your own `radius`               |
| `ember_trail`   | `range`            | twelve patch-widths off your own `radius`           |
| `seeker_volley` | `boltRadius`       | 4 — the bolt's hitbox as well as its picture        |
| `shock_pulse`   | `pushCoastMs`      | 260 — with `push`, this is how FAR the hero ends up |
| `ward_shield`   | `raiseBelowHpFrac` | 0.9 — how hurt it must be before it turtles         |
| `ward_shield`   | `range`            | 420 — how near you must be for it to bother         |

A typo in one of these is an error rather than a silent no-op: an unread key
would leave your mob quietly using the default you were trying to override.

## `companions.yaml` — who a spared elite joins you as

One file at your mod's root, a `companions:` mapping of id → companion. The KEY
is the id; don't repeat it inside the entry.

An elite earns a recruit by carrying `spareable:`. Beat it down and the game
offers you the choice; spare it and the companion's `joinWords` play, then the
figure falls in beside you for the rest of the run — fighting with its own
weapon, earning its own levels off its own kills, and floating its own banter.

```yaml
companions:
  mymod_gardener:
    name: THE GARDENER
    sprite: mymod_gardener # a FAMILY: `_0` and `_1` must both exist
    hp: 145
    speed: 80 # world px/s, on the HERO's scale, not the horde's
    radius: 12
    weapon: mymod_pruning_saw # any weapon id — yours or the game's
    killQuotes: # required; floated over its own kills
      - PRUNED.
      - THAT ONE WAS OVERDUE.
    joinWords: # optional; one entry per PAGE, one string per LINE
      - - FORTY YEARS I PRUNED THIS
        - PLACE. YOU'RE THE FIRST THING
        - THROUGH THAT DOOR THAT KNOCKED.
```

Then point an elite at it:

```yaml
# enemies/mymod/mymod_gardener.yaml
role: elite
spareable:
  companion: mymod_gardener
```

You do **not** have to author a roster to use one: your elite may name one of the
game's four (`nikola_tesla`, `amelia_earhart`, `grigori_rasputin`, `lucky`)
instead. And an addon may not shadow one of those ids — a conversion may, which
is how it makes the spare verdict hand over its own figure.

### Optional kit

- `aura: { magicFind: 0.2 }` — a party-wide bonus it radiates while on its feet,
  silent while downed. `0.2` is +20% on every loot-tier roll.
- `nova:` — a FROST NOVA it pulses when a foe is in reach, damaging and slowing
  everything in the ring. All five fields are required together:
  `everyMs`, `radius`, `damage`, `chillMs`, `chillFactor` (0..1).
- `power:` — its SIGNATURE trick, which gains a RANK every `everyLevels` of its
  own levels. Needs `name`, `blurb`, `everyLevels`, and at least one growth
  field: `pelletsPerRank`, `chainPerRank`, `piercePerRank`, `magicFindPerRank`,
  `novaRadiusPerRank`, `novaDamagePerRank`.

Growth is applied **on top of** the base kit, and two of those six need the base
to exist: `novaRadiusPerRank` and `novaDamagePerRank` do nothing at all without a
`nova:` block, so the compiler refuses that combination rather than letting a
companion rank up forever and gain nothing. The other four are grants in their
own right — `chainPerRank` teaches a weapon with no base chain to arc, and
`magicFindPerRank` works with no `aura:` at all.

A companion with no `power:` still trains: hp and damage grow with its level. It
just never learns a new trick.

Full reference: [`../content/companions.yaml`](../content/companions.yaml).

## `sets.yaml` — a kit of green armor

One file at your mod's root, a `sets:` mapping of id → set. The KEY is the id;
don't repeat it inside the entry.

A SET is the D2 green tier: a themed group of armor pieces, dropped by one boss,
that grant extra bonuses as more of them are worn. The pieces are ordinary
`items/set/<id>.yaml` files (`rarity: set`) carrying a `setId:` back-reference;
this file is the other half.

```yaml
sets:
  my_kit:
    name: THE GARDENER'S HABIT
    weaponClass: melee # what build the kit supports
    members: # 2–4 pieces, one per armor slot
      - mymod_hood
      - mymod_apron
      - mymod_boots
    bonuses:
      - pieces: 2
        bonuses: [{ kind: stat, stat: stamina, value: 5 }]
      - pieces: 3 # the CAPSTONE — a spell, a proc, sure-strike
        bonuses:
          [{ kind: proc, trigger: struck, spell: nova, chance: 0.15, rank: 2 }]
```

Thresholds are cumulative, ascend, and start at 2 (a 1-piece bonus is the
piece's own). The compiler holds the kit together for you: a piece that is not
`rarity: set`, two pieces for the same slot, a piece and a kit that disagree
about which set it is in, a threshold higher than the kit's own size, or a green
piece belonging to no kit at all are each an error with the file that caused it.

**Your kit may only claim YOUR pieces.** A shipped piece already carries a
shipped `setId` that your mod cannot edit, so claiming one would compile into
exactly the mismatch above. A conversion re-homing a shipped kit ships the
pieces too.

## `difficulties.yaml` — what the ladder says

One file at your mod's root. Renames the difficulty rungs and rewrites the
one-line blurb under each, so a conversion's CHOOSE YOUR NIGHTMARE screen speaks
in its own register instead of this game's:

```yaml
difficulties:
  easy:
    name: A QUIET SHIFT
    tagline: NOBODY IS LOOKING FOR YOU YET
  jesus:
    name: THE LONG NIGHT
    tagline: NOTHING SURVIVES IT
```

Both fields are optional per rung, and a rung you leave out keeps what it
shipped with. The five rung ids are `easy`, `medium`, `hard`, `nightmare`,
`jesus` — you may rename them, but you cannot add one.

**The VOICE is yours; the NUMBERS are the game's.** A rung's mob multipliers, xp
rates, mercy curves, stamina ladders and starting weapon are one economy with
`ladder.yaml`, which prices every venue — the shipped ones and yours — against
them. A mod that moved those would be rebalancing the campaign rather than
adding to it, so any other field here is an error. Same line `grades:` and the
loot economy are on.

Both strings are drawn in the pixel font, so the glyph rule from `brand:`
applies to them too.

## `mainmenu.yaml` — the one file a mod may not bring

The game's title menu is authored the same way everything else here is, and it
is the single catalog that stays the game's own. The tree decides which SCREENS
exist and which rows reach them, so a mod that could replace it could hand
itself the hidden developer tooling — the level warp, the balance multipliers,
the free coin grant — on any player's install. The compiler refuses a
`mainmenu.yaml` in a mod folder rather than ignoring it, so you learn the rule
instead of wondering why your file does nothing. A conversion may still rename
the game itself on the title screen — that is `brand:`.

## `sprites/<family>/<name>.yaml` — pixel art

The file stem is the `name`, and the name is what an enemy or level references.

```yaml
name: my_monster_0
size: [16, 16]
description: what it is, in a sentence
palette:
  v: "#4d7a3c" # one character, one colour
grid: |
  ....vv....
```

- `.` is reserved for transparent and may not be redefined.
- Every row must be exactly `size[0]` characters, and there must be exactly
  `size[1]` rows. The compiler checks both.
- Every character in the grid must be in the palette.
- `plane:` says which plane the art is drawn on — `upright` (the default) for
  anything with a side to it, `floor` for art drawn in PLAN. See below.

### `plane:` — does it stand up, or does it lie down?

The camera looks at the ground at an angle, so the floor foreshortens (and, with
the yaw knob up, turns). Which half of that a sprite belongs to is a property of
the ART, so the art says so:

```yaml
plane: floor # a wall panel, a painted marking, a hatch, a crate seen from above
```

`upright` — the default, so a sprite that says nothing keeps the obvious
behaviour — is a thing with a SIDE to it: a body, a rock, a building front. It is
anchored at its spot on the floor and then drawn standing at full size.

`floor` is art drawn looking straight DOWN at it. It belongs to the ground and
takes the projection whole, exactly as the ground tiles under it do. Get this
wrong on a wall panel and it comes out taller than the floor grid it is set into
— and once the camera is turned, a straight run of them staircases diagonally
across a floor whose own seams run the other way.

It applies to the level's furniture — obstacles, decor, landmarks, lair doors,
elevator pads. Characters always stand up.

A walking monster needs two frames (`_0` and `_1`). Keep the torso pixels
identical between them and move only the legs, or the sprite appears to wobble
as it walks.

## `items/<rarity>/<id>.yaml` — a weapon, a gear piece, a relic

The file stem is the id and the DIRECTORY is the rarity, exactly as in the
game's own tree: `regular` and `trash` for plain bases the loot system rolls
tiers and affixes onto, `set` / `unique` / `legendary` / `artifact` for named
relics with fixed bonuses.

`kind` says which family it is:

- `weapon` / `gear` — a plain base. Needs `class` (`melee` / `ranged` /
  `magic`), `levelReq`, `damage` or `armor`, `durability`, an `icon`, and the
  numbers its class implies (a `cooldownMs` and `range`, a `projectile:` block
  for anything that fires). A MELEE weapon may also declare `edge: blunt` — no
  number changes, but a blow that overwhelms a body BURSTS it into gibs instead
  of cutting it in two. Omitted means `sharp`, because most things that swing
  are blades; the field is refused on a ranged or magic weapon, which always
  lands blunt whatever the file says.
- `unique` — a named relic. Needs `base` (which may name one of the game's
  bases or one of yours), `slot`, `ilvl`, `bonuses` and `lore`.

### The SECOND ARM: `shield`, `bag`, and `twoHanded`

A gear piece's `slot` may be `shield` or `bag`. Both go in the hero's off hand
and only one can be worn at a time, so the two are the build choice that slot
exists to pose:

- `slot: shield` needs `armor` and an `armorType`. The material is what makes
  shields a melee lane — every shield derives a STRENGTH requirement with a
  floor under it, well above a weapon's own gate, so an archer or a caster
  cannot heft one. A shield may not carry `bagSlots`.
- `slot: bag` needs `bagSlots` (extra inventory cells) and may **not** carry
  `armor`. A bag is what the light builds put there, so lean its `bonuses.stats`
  toward DEXTERITY and INTELLIGENCE and let the room grow with `levelReq`. A
  deep drop of a bag grows its cells the way armour grows its points.

A weapon may declare `twoHanded: true`, which claims the off hand as well: its
wielder carries neither a shield nor a bag. Pay for it in the numbers — a
two-hander should hit meaningfully harder than a one-hander of the same
`levelReq`, and a two-handed melee weapon usually carries a wider `sweepDeg`
too, because clearing the crowd is what it has instead of a shield.

An item's `icon` is **one** sprite, not a two-frame family: an item is drawn on
its card, in the bag and on the ground, and never walks.

**You cannot author a `grades:` block.** The exceptional/elite ladder is minted
at engine load from a catalog compiled into the game, so there is no runtime
seam for a mod to add to; the compiler refuses it rather than letting it
silently do nothing. Author those versions as their own items instead.

**You cannot re-tune the loot economy** either — `item_quality.yaml` and
`item_rarity.yaml` are the game's, not a mod's. A mod that moved the tier
ladder would be rebalancing the campaign rather than adding to it.

Full reference: [`../content/items/`](../content/items).

### A weapon's SIGNATURE LOOK

A named weapon may say what its swing or its shot looks like, so your legendary
flares its own element instead of swinging the plain class look:

```yaml
# items/unique/mymod_brand.yaml
fx:
  element: fire # fire holy frost storm void blood venom cosmic death solar tech
  weight: 1.2 # optional — a heavier crescent, a bigger flash
  glow: "#ff5a1e" # optional — any channel of the kit, overridden
```

Every element has both a MELEE kit and a SHOT kit, so the same word works on a
blade and on a gun; your weapon's own class picks which. Leave `element` out and
it starts from the plain class look — that is how you author something
deliberately modest.

Channels: `core`, `glow` and `particle` on both; `edge`, `afterimages` and
`gore` are the melee half; `spark` is the shot half. `cli.mjs ids --kind
elements` lists the elements. The kits themselves are the game's palette and are
not a mod's to extend — a name nothing draws would be a weapon that silently
swings the plain look, so the compiler refuses one.

## `sounds/<id>.yaml` — a sound

The file stem is the id. A sound is a list of **voices** fired in order, each
either a `tone` (an oscillator) or a `noise` (a filtered burst), optionally
offset by `delayMs` so a sound can be a little phrase rather than one hit:

```yaml
id: mymod_saw_swing
description: >-
  A wet, toothy drag — the saw biting into something fibrous.
voices:
  - call: tone
    type: sawtooth # sine | square | sawtooth | triangle
    from: 300 # Hz at the start
    to: 170 # glide to, by the end
    durationMs: 110
    volume: 0.03
    filter: { type: lowpass, frequency: 1800 }
  - call: noise
    durationMs: 90
    volume: 0.022
    delayMs: 20 # start 20 ms after the sound begins
    filter: { type: bandpass, frequency: 2400 }
```

Both voice kinds take `durationMs` (required), `volume`, `delayMs`, `pan`,
`echo` and `filter` (`lowpass` / `highpass` / `bandpass`, with a `frequency`).
A `tone` additionally takes `type`, `from` (required), `to`, `attackMs`,
`detuneCents` and `vibrato` — a noise burst has no pitch, so it takes none of
those.

**Volume is the one number worth checking twice.** The game's own sounds live
between 0.01 and 0.09, and the ones that fire constantly are the quietest; a
stray `0.9` is not a louder sound, it is a clipped one. The compiler warns above
0.5.

### Two ways a sound plays

- **By name.** A weapon names it with `sfx:`, and that weapon's shots or swings
  make that noise instead of its class's default:

  ```yaml
  # items/regular/mymod_pruning_saw.yaml
  sfx: mymod_saw_swing
  ```

  The name may be one of yours or one of the game's — `cli.mjs ids` searches
  both.

- **By event.** Add an `on:` block and the sound answers that event wherever it
  fires, which is how a mod REPLACES one of the game's sounds rather than adding
  to it:

  ```yaml
  on: { type: enemyKilled, crit: true }
  ```

  `on.type` must be an event the game actually emits, and the only fields a
  sound may be chosen by are `type`, `weaponClass`, `crit`, `kind` and `tier`.
  Two sounds may not answer the same shape — within one mod the compiler refuses
  it; between two mods the load order decides, like every other clash.

An `addon` may not ship a sound with a shipped id (prefix yours, or switch to
`conversion`). There is no control flow in the format and there is not going to
be: a mod's sound is data the game replays, never a program it runs.

Full reference: [`../content/sounds/`](../content/sounds).

## `music/<id>.yaml` — a score

The file stem is the id. A track is a **tracker module**: a few `instruments`
(synth patches), a set of `patterns` (sections, each a grid of note tokens per
instrument), and an `order` arranging the patterns into a loop that repeats for
as long as the level lasts.

```yaml
id: mymod_hymn
name: SLOW GREEN # the title, as a listing prints it
description: >-
  A patient E-minor hymn for a room that grows things.
bpm: 84
stepsPerBeat: 4 # 4 = each row is a sixteenth note, so 16 tokens is one bar
instruments:
  lead: { wave: sine, volume: 0.03, gate: 0.9, echo: 0.4 }
  hat:
    wave: noise
    volume: 0.007
    pan: -0.3
    filter: { type: highpass, frequency: 9000 }
patterns:
  a:
    lead: |
      E4 .  .  .  .  .  .  .  G4 .  .  .  .  .  .  .
      A4 .  .  .  =  .  .  .  .  .  .  .  .  .  .  .
    hat: |
      .  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .
order: [a]
```

**The tokens.** A note (`A4`, `C#3`, `F#-1`), `.` for a rest, `=` to hold the
note before it through another step, or — on a `noise` instrument only — any
word at all, for which `x` reads best. A word on a PITCHED voice is an error:
the sequencer would try to read it as a note and throw mid-run.

**The grid.** Every voice must be whole bars (`stepsPerBeat × 4` tokens each),
which is why the convention is one bar per line. A voice SHORTER than the
pattern's longest **cycles** inside it — the one-bar hat above repeats under an
eight-bar lead — so its length has to divide the longest. A voice a pattern
omits is silent through it.

**An instrument** takes `wave` (`sine` / `square` / `sawtooth` / `triangle` /
`noise`) and `volume`, plus any of `gate` (how much of its step a note holds),
`attackMs`, `detuneCents`, `vibrato`, `pan`, `echo`, `filter` and `slide` (an
end-pitch multiplier — `0.25` on a triangle is a kick drum).

**Mixing:** the shipped scores sit between 0.006 and 0.07. Music plays UNDER the
game; a track as loud as the gunfire is a track players turn off. The compiler
warns above 0.3.

### Playing your score

A level names it, the same way it names one of the game's:

```yaml
# levels/mymod_venue.yaml
music: mymod_hymn
```

The id may be one of yours or one of the game's, and an id that is neither is a
compile error — it used to be silent, with the venue quietly playing the moon's
theme. An `addon` may not ship a track with a shipped id (prefix yours, or
switch to `conversion`); a `conversion` may, and re-scores that venue.

Full reference: [`../content/music/`](../content/music).

## `powerups.yaml` — a POWER

One file at your mod's root, like `ladder.yaml`, holding every power your mod
adds. The catalog KEY is the id — never repeat it inside the entry.

```yaml
powerups:
  mymod_spore_bloom:
    name: SPORE BLOOM
    lore: > # required — what it IS and how it wants to be spent
      Vault-grown spores in a pressurised canister...
    kind: trail # the effect it LEADS with (see below)
    durationMs: 11000
    stackable: true # several copies may run at once
    icon: icon_ion_wake # the ground-pickup sprite
    trail:
      dropMs: 260
      patchMs: 2600
      radius: 26
      damage: 9
      tickMs: 320
```

Required: `name`, `lore`, `kind`, `durationMs`, `icon`, and the effect block
your `kind` names.

`lore` is a short paragraph, in the same register as an enemy's — and it is
required for the same reason. Nothing in the GAME ever explains a power: it
arrives as an icon on the floor, runs for a few seconds and is gone. So say
what it is and how it wants to be spent, in a sentence or two.

### A power is a COMPOSITION of effects

`kind:` names the effect your power leads with — the one word the powerup dock,
the loot rules and the autopilot use for the whole power. **It is a label, not a
switch:** the engine runs whichever effect blocks are PRESENT. So a power may
carry as many as you like, each ticking on its own clock, and you can build
things the shipped game has no equivalent of without the engine learning a new
word:

```yaml
kind: trail # it leads with the wake it lays…
trail: { dropMs: 260, patchMs: 2600, radius: 26, damage: 9, tickMs: 320 }
immolation: # …and it ALSO burns everything standing near him
  radius: 44
  damage: 6
  tickMs: 420
```

You must carry the block your `kind` names. Everything else is optional.

### The effect blocks

Every one of these is the same implementation the shipped powers (and the magic
tree's own conjurations) run, so an effect behaves in your mod exactly as it
does in the game.

| Block         | What it does                                                     | Fields                                                                                                                          |
| ------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `orbit`       | projectiles circle the hero, mangling what they touch            | `count`, `radius`, `angularSpeed`, `damage`, `hitCooldownMs`, `orbRadius`, `sprite`                                             |
| `storm`       | a bolt strikes the nearest body on an interval                   | `intervalMs`, `damage`, `range`                                                                                                 |
| `stasis`      | bodies inside the field crawl                                    | `radius`, `slowFactor`                                                                                                          |
| `nuke`        | an instant screen wipe (`durationMs: 0`)                         | `radius`                                                                                                                        |
| `magnet`      | ground loot inside the reach flies to the hero                   | `radius`, `radiusPerInt`, `pullSpeed`                                                                                           |
| `trail`       | a burning wake dropped behind the hero as he walks               | `dropMs`, `patchMs`, `radius`, `damage`, `tickMs`                                                                               |
| `barrier`     | a shell that eats damage until its pool is spent                 | `poolFrac`                                                                                                                      |
| `rain`        | impacts fall around the hero on an interval                      | `intervalMs`, `count`, `radius`, `damage`, `range`                                                                              |
| `phase`       | blows and shots pass clean through the hero                      | `speedMult`                                                                                                                     |
| `well`        | a core placed on the field, hauling the horde in and grinding it | `radius`, `damage`, `tickMs`, `pull`, `chase`                                                                                   |
| `surge`       | the hero's own weapon hits harder and faster                     | `damageMult`, `cooldownMult`                                                                                                    |
| `pulse`       | a ring washes out of the hero, billing and shoving               | `intervalMs`, `radius`, `damage`, `push`                                                                                        |
| `volley`      | shots loose themselves at the nearest body                       | `intervalMs`, `count`, `spread`, `speed`, `radius`, `damage`, `lifetimeMs`, `sprite`, `range`, opt. `homing`, `pierce`, `burst` |
| `turret`      | guns deploy on a ring and rake the field from where they stand   | `count`, `radius`, `intervalMs`, `damage`, `range`, `speed`, `projectileRadius`, `sprite`, opt. `gunSprite`                     |
| `ward`        | a lethal blow cannot land — it is clipped to `floor` hp          | `floor`                                                                                                                         |
| `singularity` | a vortex collapses on the nearest cluster, dragging it in        | `intervalMs`, `radius`, `damage`, `pull`, `range`                                                                               |
| `immolation`  | a burning ring the hero carries                                  | `radius`, `damage`, `tickMs`                                                                                                    |

Every number is a level-1 value: the game deepens it as the hero levels
(`abilityPowerScale`), so a power keeps clipping the same share of a
level-appropriate healthbar all campaign. The level-1 reference minion has
about 45 hp — so `damage: 45` is "one reference minion per tick".

### Making it look like YOURS

A power's blocks decide what is drawn; its `look:` kit decides how it READS.
This is what lets two powers sharing an effect be completely different things —
the shipped DUST DEVIL and EVENT HORIZON are both nothing but a `well`.

```yaml
look:
  core: "126, 220, 118" # the power's own hue — rims, rings, arcs
  hot: "226, 255, 206" # the hot inner light
  deep: "16, 44, 20" # the dark that grounds it
  spark: "180, 246, 150" # motes, embers, grit
  wellLook: grit # `well` only: `grit` shreds, `void` swallows
```

Each colour is an `r, g, b` triple, no alpha — the draw code dials the alpha per
layer, which is what keeps the light additive. **Omit `look:` and your power
still works**; it just wears the game's neutral default instead of looking like
yours.

### Making it sound like YOURS

By default a power plays the sound for the EVENT it throws, which means it
sounds like whichever shipped power happens to share its effect. Name your own
and it plays that instead:

```yaml
sfx: mymod_spore_burst # a sounds/<id>.yaml of yours, or one of the game's
```

An id that resolves to nothing is a compile error, not a silent fallback.

### Letting it drop

A power that no level pools never appears. List it in a level's `loot`:

```yaml
# levels/mymod_venue.yaml
loot:
  abilityPool:
    - fire_orbs # the game's
    - mymod_spore_bloom # and yours
```

An `addon` may not ship a power with a shipped id (prefix yours, or switch to
`conversion`); a `conversion` may, and replaces it.

Full reference: [`../content/powerups.yaml`](../content/powerups.yaml).

## `talents.yaml` — a passive the hero buys ranks in

One file at your mod's root, exactly like `powerups.yaml`: a `talents:` mapping
of id → talent, where the **key is the id**.

A talent is a WoW-style passive. Every 10 chosen points the hero pours into
STRENGTH / DEXTERITY / INTELLIGENCE earn one talent point in that stat's tree,
spent through the level-up picker on a new talent or a rank-up of an owned one.
Talents are **always on** — no mana, no cooldown, no button. Yours **merge into
the shipped trees**, so a talent you add simply appears in its tree's picker
beside the game's own.

```yaml
talents:
  mymod_deep_roots:
    name: DEEP ROOTS
    tree: melee # melee = STR, ranged = DEX, magic = INT
    kind: tank # a label the picker tints by — nothing branches on it
    maxRank: 5 # never above the game's shared ceiling (5)
    blurb: Stand your ground — a deeper pool and a thicker hide.
    effect:
      maxHpPerRank: 0.04
      damageReductionPerRank: 0.02
```

| Field     | Required | What it is                                                               |
| --------- | -------- | ------------------------------------------------------------------------ |
| `name`    | yes      | Shown on the picker card, in caps.                                       |
| `tree`    | yes      | `melee`, `ranged` or `magic` — which stat's points buy it.               |
| `kind`    | yes      | `damage` `tank` `control` `mobility` `survival` `offense` `defense`.     |
| `maxRank` | yes      | 1–5. The picker draws this many rank pips.                               |
| `blurb`   | yes      | One line, on the card under the name.                                    |
| `effect`  | no       | The per-rank slopes and/or a `conjure` (below).                          |
| `icon`    | no       | A sprite name. Defaults to `icon_talent_<id>`, which you must then ship. |

Plus, optionally, **one proc block** — see below.

**A talent must DO something.** Carry an `effect:` slope, a `conjure:`, or a
proc block; a talent with none is refused, because every rank a player spends on
it would buy nothing and nothing at play time would say so.

### `effect:` — the per-rank slopes

Additive terms folded into a combat read site the game already has. Each is the
step **one rank** buys, so `critChancePerRank: 0.03` at rank 5 is +15%. A talent
may carry as many as it likes.

| Slope                    | What it moves                                                     |
| ------------------------ | ----------------------------------------------------------------- |
| `critChancePerRank`      | +crit chance, on the tree's OWN weapon class (melee tree → melee) |
| `critDamagePerRank`      | +crit damage multiplier, same gating                              |
| `moveSpeedPerRank`       | +move speed (a fraction)                                          |
| `dodgePerRank`           | +dodge chance                                                     |
| `damageReductionPerRank` | flat cut off every blow taken (a martial toughness)               |
| `magicReductionPerRank`  | the same cut, from a magic ward — its own field so it reads apart |
| `reflectPerRank`         | share of an enemy blow turned back on the attacker                |
| `maxHpPerRank`           | +max hp (a fraction)                                              |
| `berserkPerRank`         | +weapon damage at ZERO hp, fading linearly to nothing at full     |

### `conjure:` — an always-on spell, for free

The cheapest powerful thing in this file. `conjure` hands your talent's rank to
one of the game's granted spells — the same machinery a legendary's `spell`
affix drives — so it runs, draws and sounds itself, deepens with rank, quickens
with INT, and **stacks** with any worn source of the same spell:

```yaml
mymod_vault_lights:
  name: VAULT LIGHTS
  tree: magic
  kind: offense
  maxRank: 5
  blurb: The grow-lamps still orbit you, and they still burn.
  effect:
    conjure: orbit # orbit | storm | stasis | seeker | singularity | immolation
```

### The proc blocks — and the one-carrier rule

A **proc** is a structured effect the engine fires at a specific hook: a swing
that cleaves wider, a blow that lands twice, a shot that shoves, a landing that
slams, a dodge that bursts, a struck hero who freezes the room. Its numbers live
in a block on the def, named for the effect:

```yaml
mymod_riposte:
  name: RIPOSTE
  tree: melee
  kind: tank
  maxRank: 5
  blurb: Turn aside enemy blows — and, mastered, strike back.
  parry:
    chancePerRank: 0.06 # rank × this, clamped to the cap
    chanceCap: 0.4
    riposteFrac: 0.5
    riposteRank: 5 # the rank the riposte turns on at
```

The engine fires whichever trained talent **carries** the block — it never looks
for a talent by id — which is what lets your talent own a proc with your own
chances and radii.

**Exactly one talent may carry each proc**, and the shipped catalog already
claims all of them. Two carriers would make "whose numbers apply" a question
about catalog order, which is not a decision anybody made. So:

- an **addon** adds talents built from slopes and conjurations;
- re-carrying a proc means **replacing** the talent that has it — ship a talent
  with that id, which is a `kind: conversion`'s business.

The compiler names both talents when you trip it.

| Block          | Fires when                          | Fields                                                                                                              |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `cleavingEcho` | a melee swing (once per swing)      | `chancePerRank` `chanceCap` `extraTargets` `bonusTargets` `bonusFromRank`                                           |
| `twinStrike`   | a melee blow lands (once per hit)   | `chancePerRank` `chanceCap` `echoDamageFrac` `fullEchoRank`                                                         |
| `parry`        | an enemy MELEE blow lands on you    | `chancePerRank` `chanceCap` `riposteFrac` `riposteRank`                                                             |
| `seismic`      | you touch down from a jump          | `radius` `radiusPerRank` `damage` `damagePerRank` `knockback`                                                       |
| `piercing`     | you fire (stamped on the shot)      | `piercePerRank` `retainBase` `retainPerRank` `retainCap`                                                            |
| `concussive`   | your shot hits and the foe survives | `chancePerRank` `chanceCap` `distance` `distancePerRank`                                                            |
| `crippling`    | your shot hits                      | `chancePerRank` `chanceCap` `slowFactor` `slowMs` `slowMsPerRank`                                                   |
| `volley`       | you pull the trigger (once a pull)  | `chancePerRank` `chanceCap` `extra` `bonusExtra` `bonusFromRank` `spreadDeg`                                        |
| `springHeels`  | you jump                            | `velocityPerRank` `jumpCostReduction` `costReductionRank`                                                           |
| `evasionBurst` | you dodge                           | `speedMult` `ms` `rank`                                                                                             |
| `frostNova`    | anything lands on you               | `radius` `radiusPerRank` `freezeMs` `freezeMsPerRank` `slowFactor` `cooldownMs` `cooldownPerRank` `cooldownFloorMs` |

A flat `damage:` figure is authored **at level 1** and scales with the hero the
way a powerup's does, so it keeps clipping the same share of a level-appropriate
healthbar all campaign.

### The picker glyph

A talent draws `icon_talent_<id>` unless it names an `icon:`. Ship it under
`sprites/`, 12×12, like the game's own — or point `icon:` at any sprite the game
or your mod has. A talent with neither is a compile error, because the
alternative is a blank card in the one screen the player must choose from.

### What you cannot restate here

The point **economy**: how many stat points earn a talent point, and the shared
rank ceiling. Those price the whole level-up flow — a talent ranked deeper than
the ceiling would enqueue points the picker has no milestone for.

Full reference: [`../content/talents.yaml`](../content/talents.yaml), and
[`examples/greenhouse/talents.yaml`](examples/greenhouse/talents.yaml) for a
worked pair.

## `cutscenes/<id>.yaml` — a scene

The file stem must equal the scene's `id`. A scene is a **stage** (a colour wash
and a set of props), a **cast** of actors, and a **timeline** of beats played
strictly in order. A level plays one by naming it: `prelude: my_scene` in the
level file, or a LIST of ids to chain several back to back.

```yaml
id: mymod_arrival
stage:
  width: 224 # world px; the renderer draws the stage ×3 and letterboxes it
  height: 126
  backdrop: space # the renderer's key for the setting; the palette does the painting
  palette: { wall: "#08101a", floor: "#1c3a30", trim: "#0a1a14", floorY: 88 }
  drift: { x: -14, y: 0 } # optional: constant camera velocity, px/s (a transit)
  props:
    - { sprite: sky_earth, at: { x: 34, y: 34 }, parallax: 0.06 }
    - { sprite: ship, at: { x: 196, y: 100 } }
actors:
  - { id: hero, name: ME, sprite: hero_suit, at: { x: 178, y: 97 } }
beats:
  - { kind: fade, to: 1, ms: 0 }
  - { kind: fade, to: 0, ms: 900 }
  - kind: caption
    text:
      - A SEED VAULT IN ORBIT.
      - STILL LIT. STILL WATERED.
  - { kind: move, actor: hero, to: { x: 96, y: 97 }, speed: 38 }
  - kind: say
    actor: hero
    text:
      - LET'S SEE WHAT IT GREW.
  - { kind: fade, to: 1, ms: 1100 }
```

**Positions are bottom-anchored**: `at.y` is where a thing meets the floor, and
the renderer paints back to front by y — so a higher y is nearer the camera.
`palette.floorY` is where the floor line sits, measured down from the top; push
it past `height` and no horizon shows at all (that is how the game's space
transits are lit).

**`parallax` is depth**: how much of the camera's shift a prop takes. `1` (the
default) moves with the ground, `0` is pinned to the sky. `wrap: true` makes a
prop re-enter from the far edge instead of scrolling away for ever — star fields
under a long `drift`.

**`ground: true` is art that LIES on the floor** — paving, a road, a painted
marking — rather than standing on it. Ground props are painted with the floor,
under everything in the standing queue, because a slab is anchored at its NEAR
edge: sorted normally it would come out in front of every actor walking over it
and paint over their feet.

**A prop's art is `sprite:`.** The renderer draws it by name, falling back to
`<name>_0`. An actor's `sprite` names a two-frame FAMILY: `<name>_0` standing,
alternating `_1` while a `move` beat walks it. Yours and the game's work
identically.

### The beats

Text beats hold the frame until the player taps; timed beats run on the clock and
a tap cuts them short. Instant beats settle and roll straight into the next one.

| `kind`    | Fields                        | What it does                                                              |
| --------- | ----------------------------- | ------------------------------------------------------------------------- |
| `caption` | `text: [line, …]`             | Narrator text, no speaker. Holds for the player.                          |
| `say`     | `actor`, `text: [line, …]`    | A speech bubble on that actor. Holds for the player.                      |
| `wait`    | `ms`                          | Hold the frame.                                                           |
| `move`    | `actor`, `to: {x,y}`, `speed` | Walk an actor there at `speed` px/s; facing follows.                      |
| `pose`    | `actor`, `sprite`             | Swap an actor's sprite family (sitting → standing, engine cold → firing). |
| `face`    | `actor`, `faceLeft`           | Mirror an actor without moving.                                           |
| `enter`   | `actor`                       | Put a `hidden: true` actor on stage.                                      |
| `exit`    | `actor`                       | Take an actor off.                                                        |
| `fade`    | `to` (0–1), `ms`              | Fade the frame toward black (`1`) or clear (`0`).                         |
| `pan`     | `by: {x,y}`, `ms`             | Glide the camera; props follow scaled by their parallax, actors do not.   |
| `shake`   | `actor`, `amp`                | Tremble amplitude in px, until switched off with `amp: 0`.                |
| `jump`    | `actor`, `lift`, `ms`         | Ease the actor `lift` px off the ground (`0` puts it back down).          |
| `hold`    | `actor`, `sprite?`, `at?`     | Put a sprite in the actor's hands at `at`; no `sprite` empties them.      |
| `prop`    | `prop`, `hidden`              | Take a labelled stage prop off the stage, or put it back.                 |

**A leap is TWO jumps, and the grab happens between them.** A rise decelerates
into its apex and a fall accelerates out of it — which half a `jump` is, is
simply whether its `lift` is above or below the actor's current one, so no
gravity is authored. Pair them and put the instant beats in the middle, and the
thing being reached for changes hands at the top of the arc, in one frame:

```yaml
- { kind: jump, actor: hero, lift: 44, ms: 420 } # up
- { kind: prop, prop: arm, hidden: true } # off the wall…
- { kind: hold, actor: hero, sprite: icon_axe, at: { x: 9, y: 2 } } # …into his hand
- { kind: jump, actor: hero, lift: 0, ms: 300 } # down
```

A `lift` is HEIGHT, not depth: it raises the drawing without touching the mark
the actor is sorted by, so a jump never sends the jumper behind the furniture it
leapt from. An airborne actor is drawn as `<sprite>_jump` if the family authors
one, and holds its standing frame if it doesn't. A held sprite is single art
like a prop's (a weapon icon), offset from the actor sprite's own top-left, and
it mirrors when the actor turns around.

**A prop a beat addresses needs a `label:`** — the same handle `variants:`
patches by, which is also the `id` a `prop` beat names. A prop with no label is
dressing nothing can touch.

**A text line is a PARAGRAPH, not a row.** The box measures its own column on
the device it is being read on and flows your line into it, so a phone folds
what a desktop prints wide — and how many characters fit on a row is never your
problem. Write a page as ONE entry. A SECOND entry is an explicit line break,
and it should be rare enough to mean something: a punchline held back, a second
hand on the same note, a pause the punctuation cannot carry. The compiler warns
when a page runs past a screenful (about 120 characters) or spends more than one
break.

```yaml
text:
  # One entry — the box breaks it wherever it has to.
  - SHE TOOK HER JACKET. THE ONE I FIXED THE ZIPPER ON.
text:
  # Two — a break you MEANT, held for the beat.
  - SHE TOOK HER JACKET.
  - THE ONE I FIXED THE ZIPPER ON.
```

### `variants:` — one scene per difficulty, from one file

The game's prelude is the same living room on every rung except the weapon on the
wall and the caption when the hero takes it down. Rather than five files, label
the parts that differ and patch them per difficulty:

```yaml
props:
  - { label: arm, sprite: wall_medieval_sword, at: { x: 178, y: 54 } }
beats:
  - label: take
    kind: caption
    text:
      - THE OLD SWORD OFF THE WALL.
variants:
  jesus:
    arm: { sprite: wall_stick }
    take:
      text:
        - THE STICK OFF THE WALL.
```

Each variant is compiled into a scene of its own, `<id>_<difficulty>`, and the
game picks it up automatically when a run on that rung plays `<id>`. A patch
REPLACES the values it names (a caption's whole `text`, a prop's `sprite`).
`label:` keys are authoring handles — they never reach the game.

Full reference: [`../content/cutscenes/`](../content/cutscenes) is every scene
the campaign plays, comments and all.

## `thoughts.yaml` — the hero's inner monologues

One file at your mod's root, a `thoughts:` mapping of id → monologue. There is no
speaker on the board: the box shows the hero's face and his private read on what
he just saw.

```yaml
thoughts:
  mymod_creeper_sight:
    speaker: "{HERO}" # the name over the words — see below
    portrait: hero_suit # a sprite family; frame `<portrait>_0` is drawn
    pages:
      - - IT'S A PLANT. IT HAS A GAIT.
        - THOSE TWO FACTS DO NOT
        - BELONG IN ONE SENTENCE.
```

### `{HERO}` — the player's own name

The player names their character on the NEW GAME screen, and **`{HERO}` is that
name**. Write it anywhere authored text should say it and every box that draws
the line resolves it: a thought's `speaker` (so the header over his own words is
the character the player made, which is what the shipped campaign does on every
one of its beats), a cutscene actor's `name`, a spoken line, a conversation node,
an errand's ask.

```yaml
# Somebody who knows him — a line, not a label.
dialogue:
  - - "{HERO}. I HEARD YOU WERE DEAD."
```

Two rules worth knowing. Spell it **exactly** — `{hero}`, `{ HERO }` and
`{NAME}` resolve to nothing and print as `?HERO?`, because the pixel font has no
brace glyph. And spend it sparingly: a name lands because almost nobody uses it,
so give it to the handful of characters who genuinely know the man and to nobody
else.

A thought is fired by a LEVEL pinning it to a monster — `firstSightThoughts` the
first time one comes into view, `firstKillThoughts` the first time he puts one
down, each once per run:

```yaml
# levels/mymod_venue.yaml
firstSightThoughts:
  - enemy: mymod_creeper
    thought: mymod_creeper_sight
```

…or by a level pinning it to a PLACE rather than to a monster — which is what a
hub with no horde in it has to do. `placeThoughts` takes a list, fired in the
order you write them, each once per run:

```yaml
# levels/mymod_hub.yaml
placeThoughts:
  # `arrival` — the first live tick he ever has here, after the intro
  - thought: mymod_hub_errand
    where: arrival
  # `pastDoor` — he has walked out through one of this level's APPROACH doors
  # (the roll-up kind that opens for anybody who walks up) on his own feet,
  # rather than driving. `after:` holds it until the beat named has been read.
  - thought: mymod_hub_on_foot
    where: pastDoor
    after: mymod_hub_errand
```

`capRotation:` (optional, a list of your own thought ids) is the mutter a hero
cycles while farming a map he has out-levelled. It **replaces** the game's
rotation rather than adding to it, so it is a conversion's business — an addon
that set it would quietly take the shipped lines away. Leave it out and the
game's own mutter keeps playing.

## `story-items.yaml` — the plot pieces

One file at your mod's root, a `storyItems:` mapping of id → find. Picking one up
banks it (never into the bag) and plays its `lore` as a dialogue.

```yaml
storyItems:
  mymod_seed_log:
    name: IRRIGATION LOG # the dialogue header and the pickup toast
    icon: icon_manifest # the sprite on the ground and in the lore box
    lore:
      - - THE LAST ENTRY IS SIX YEARS
        - OLD. THE TIMER KEPT GOING.
    unlocks: vault # optional: a door id in YOUR level this is the key for
    suitsHero: false # optional: dresses the hero in the EVA suit for the run
```

Get one into a player's hands either by laying it on the floor of a level:

```yaml
# levels/mymod_venue.yaml
items:
  - kind: story
    defId: mymod_seed_log
    at: { x: 1560, y: 300 }
```

…or by having an elite carry it (`loot.storyItems` on the enemy), which is how
the campaign hands over every keycard.

**Your story is yours.** The game's own script is governed by a three-tier chain
that ends in `docs/manuscript.md`; none of that applies to a mod. Nobody reviews
your lines, nothing has to agree with the campaign's plot, and a conversion is
expected to contradict it outright. The only rules are the schema's: a scene has
to name sprites that exist, a beat has to talk to an actor in its own cast.

## `quest-givers.yaml` + `quests/<id>.yaml` — the errands

Two files, and they are separate on purpose: a giver is a PERSON standing on one
of your maps, and one person hands out a whole chain, so folding them together
would repeat that person once per errand.

`quest-givers.yaml` sits at your mod's root, a `questGivers:` mapping of
id → person:

```yaml
questGivers:
  mymod_keeper:
    level: mymod_venue # one of YOUR levels
    name: THE GREENHOUSE KEEPER # the dialogue-box name
    sprite: mymod_keeper # needs `<sprite>_0` and `_1` walk frames
    at: { x: 640, y: 420 } # where they stand (world px)
    lore: > # a paragraph, printed under their name
      Six years of tending a crop nobody has come to collect.
    greeting: # spoken when TAPPED / atop their errand list
      - YOU'RE THE FIRST IN A WHILE. CAN I ASK YOU A FAVOR?
    farewell: # optional, once everything of theirs is done
      - MIND THE TRAYS ON YOUR WAY OUT.
    intro: # optional: a MEETING owed before any errand is offered
      conversation: mymod_keeper_meeting # one of your `conversations/`
      until: mymod_keeper_met # a flag some branch of it sets
```

**`intro:` is how somebody gets introduced before they start asking.** The first
tap opens that conversation tree instead of the errand slate; the slate opens
from the tap after `until` is set, and the tree is never seen again. It is worth
reaching for when the reason a person is standing on your map is the reason
their errands make sense — a slate that opens cold makes a giver read as a
dispenser. Two things the build refuses, because both are silent at runtime: an
`until` no branch of any conversation sets (the meeting could never end, so the
errands could never be offered), and a `conversation` that does not exist.
Walking away mid-talk is free — author a `reentry:` on the flag your first
branch sets and they pick up where they stopped.

Each errand is its own file under `quests/`, the stem being its id:

```yaml
# quests/mymod_thin_them.yaml
level: mymod_venue
giver: mymod_keeper
order: 1 # where it sits in the giver's list (low first)
name: THIN THEM OUT
lore: > # required: what the errand IS, described rather than spoken
  Something has been through the north beds twice this week, and the keeper
  has stopped calling it weather.
offer: # the ask — a list of PAGES, each a list of lines
  - - THE CRAWLERS ARE THROUGH
    - THE NORTH BEDS AGAIN.
  - - EIGHT AND THEY'LL LEARN.
incomplete: # optional: the nag when you come back short
  - STILL EIGHT. I'VE COUNTED.
complete: # the handover
  - - THAT'S THE BEDS SAFE.
objectives:
  - kind: kill # kill N of a breed
    enemy: mymod_crawler
    count: 8
reward:
  xpShare: 0.4 # a SHARE of the hero's current level bar, never a flat figure
  coins: 90
  loot: { count: 1, tierBonus: 1 } # rolled through the ordinary drop pipeline
  uniques: [mymod_relic] # optional: handed over whole
  abilities: [mymod_power] # optional: docked as a powerup
requires: [mymod_earlier_quest] # optional chain gate — same giver, same level
minDifficulty: hard # optional
```

The four objective kinds:

```yaml
- kind: kill # N of a breed; any kill counts, yours or a companion's
  enemy: mymod_crawler
  count: 40 # a real cull — this hero clears ~170 bodies in three minutes
- kind: killNamed # one specific elite or boss
  enemy: mymod_warden
- kind: collect # N of a token the quest defines below
  item: spare_fuse
  count: 3
- kind: escort # walk somebody to a spot
  escort: the_botanist
  to: { x: 1900, y: 640 }
```

A `collect` objective names a token the quest itself defines, so two mods can
both ship a "spare fuse" without colliding:

```yaml
items:
  - id: spare_fuse
    name: SPARE FUSE
    icon: icon_manifest
    dropFrom: [mymod_crawler] # breeds that carry it
    dropChance: 0.08 # optional; defaults to this, and a long dry run
    #   drops for certain anyway (25 kills). Off a breed the map's `horde` is
    #   MADE of, the build REFUSES anything above 0.125 — a piece that falls
    #   out of every second body is a counter, not a hunt. Off a one-off
    #   (an elite, a guardian, a hellborn) any rate is allowed, including 1.
    at: [{ x: 900, y: 300 }] # optional: pieces lying on the floor
```

An `escort` names somebody the horde can reach. They follow the hero, stop when
left behind, and the errand FAILS if they fall:

```yaml
escorts:
  - id: the_botanist
    name: THE BOTANIST
    sprite: mymod_botanist # `_0` / `_1` walk frames, like a giver
    at: { x: 700, y: 420 } # optional; defaults to the giver's feet
    hp: 240 # optional
    setOff: I'LL KEEP UP. PROBABLY. # optional, spoken lines
    arrived: THAT'S IT. THAT'S THE DOOR.
```

A giver's `lore` and an errand's are both REQUIRED, and neither is spoken: they
are the paragraph the offer box, the quest log and the game's own reference
pages print — the person, and then the job. Write them in the register of a
description rather than a line of dialogue.

Three rules the compiler enforces, because each one fails SILENTLY at runtime:
a giver must be given at least one quest (a person you can walk up to and get
nothing from is the most confusing thing a quest system can ship), a chain may
not loop or cross maps (the log is a RUN's, so a prerequisite from another map
can never have been turned in), and every id — the level, the giver, the breeds,
the sprites, the relics, the powers — has to resolve.

**Your errands are yours**, exactly as your story is: nobody reviews the lines,
and nothing has to agree with the campaign.

## `preview.png` — the Workshop thumbnail

Optional, and you should still do it: an item with no preview image is nearly
invisible in Workshop browsing. Any reasonable size works; Steam scales it.

---

## What may be in a mod folder

The compiler reads only where content lives, so anything else in the folder is
invisible to it — and travels to everybody who installs your mod. `validate`
asks the other question, and this is the whole list of what it allows:

| Where                                                            | What                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mod.yaml`                                                       | the manifest                                                                                                                                                  |
| `levels/`, `maps/`, `sounds/`, `music/`, `cutscenes/`, `quests/` | `<id>.yaml`, one level deep                                                                                                                                   |
| `enemies/`, `items/`, `sprites/`                                 | `<biome or rarity or family>/<id>.yaml`, two levels deep                                                                                                      |
| the root catalogs                                                | `ladder.yaml`, `powerups.yaml`, `talents.yaml`, `companions.yaml`, `sets.yaml`, `difficulties.yaml`, `thoughts.yaml`, `story-items.yaml`, `quest-givers.yaml` |
| alongside them                                                   | `README.md`, `LICENSE.md`, `preview.png`, and `.workshop-id` (yours — never packaged)                                                                         |

Everything else is refused by name, and each refusal says which of the two it
is: **junk** (a `.DS_Store`, an editor backup, a layered `.psd`, a
`node_modules/`), or a file **nothing reads** — which is the more useful one,
because a sprite one directory too deep and an item under a rarity that does not
exist both compile perfectly and are simply not in the game.

## Compiling, validating, packaging

```sh
node mod/tools/cli.mjs check <mod-dir>          # compile, write nothing
node mod/tools/cli.mjs build <mod-dir>          # compile, write mod.json
node mod/tools/cli.mjs validate <mod-dir>       # check + the folder, the README, the inventory
node mod/tools/cli.mjs package <mod-dir>        # validate, then write the zip you hand over
```

`check` is the fast inner loop while authoring. `validate` is what to run before
anybody else sees the folder, and `package` runs it for you — it writes nothing
at all if the audit fails, and what it does write is the manifest, every file
`contents:` declares, and your README, LICENSE and thumbnail. Nothing else,
ever.

The desktop game runs this **same compiler** on every mod it loads, so a mod
that passes `check` is a mod the game accepts. There is deliberately not a
friendly compiler here and a strict one at load — that is how the two drift and
how "it works in my mod" stops meaning anything.

Errors are reported **all at once**, not first-one-wins: a mod that names three
enemies that do not exist should take one round trip to fix, not three.
