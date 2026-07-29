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

Required: `id`, `name`, `role` (`minion` / `elite` / `boss`), `sprite`, `hp`,
`speed`, `radius`, `contactDamage`, `critChance`, `contactCooldownMs`.

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
