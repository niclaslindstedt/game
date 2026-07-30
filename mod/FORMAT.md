# The mod format

Field-by-field. Start from [`README.md`](README.md) if you have not yet, and
keep [`examples/greenhouse`](examples/greenhouse) open beside this — every field
below appears there with a comment.

The guiding rule: **a mod's content is authored exactly like the game's.** Where
this document is thin, the shipped files under [`../content/`](../content) are
the full reference, because they are the same format going through the same
validator.

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

## `levels/<id>.yaml` — a venue

The file stem must equal the level's `id`. Required fields: `id`, `index`,
`name`, `foes`, `width`, `height`, `gravity`, `biome`, `tiles`, `intro`,
`playerSpawn`, `objective`, `obstacles`, `decor`, `decorClearance`, `spawns`,
`loot`, and exactly one of `campaign: true` / `secret: true`.

Two authoring keys are **not** yours to set: `mobLevels` and `intendedLevel`
come from `ladder.yaml`, and a level that states them is an error.

A spawn point names a **ramp** (`meek`, `bold`, `fierce`, `savage`, `brutal`,
`monstrous`, `endgame`, `apex`) rather than per-difficulty numbers — the ramp is
expanded against your ladder rows at compile time. So a level reads as intent,
and every difficulty number comes from one file.

Full reference: [`../content/levels/moon.yaml`](../content/levels/moon.yaml) is
a complete, heavily commented venue.

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

Full reference: [`../content/enemies/`](../content/enemies).

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
  for anything that fires).
- `unique` — a named relic. Needs `base` (which may name one of the game's
  bases or one of yours), `slot`, `ilvl`, `bonuses` and `lore`.

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

Keep a text line to **34 characters** — the box is a fixed width, so where you
break the line is where it breaks on screen. The compiler warns past that.

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
    speaker: ME # the name over the words
    portrait: hero_suit # a sprite family; frame `<portrait>_0` is drawn
    pages:
      - - IT'S A PLANT. IT HAS A GAIT.
        - THOSE TWO FACTS DO NOT
        - BELONG IN ONE SENTENCE.
```

A thought is fired by a LEVEL pinning it to a monster — `firstSightThoughts` the
first time one comes into view, `firstKillThoughts` the first time he puts one
down, each once per run:

```yaml
# levels/mymod_venue.yaml
firstSightThoughts:
  - enemy: mymod_creeper
    thought: mymod_creeper_sight
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

## `preview.png` — the Workshop thumbnail

Optional, and you should still do it: an item with no preview image is nearly
invisible in Workshop browsing. Any reasonable size works; Steam scales it.

---

## Compiling

```sh
node mod/tools/cli.mjs check <mod-dir>          # validate, write nothing
node mod/tools/cli.mjs build <mod-dir>          # validate, write mod.json
```

The desktop game runs this **same compiler** on every mod it loads, so a mod
that passes `check` is a mod the game accepts. There is deliberately not a
friendly compiler here and a strict one at load — that is how the two drift and
how "it works in my mod" stops meaning anything.

Errors are reported **all at once**, not first-one-wins: a mod that names three
enemies that do not exist should take one round trip to fix, not three.
