# Building a mod — the step-by-step

This file is for an **agent** (or a person who likes a checklist) working in
`mod/`. [`README.md`](README.md) is the tour and [`FORMAT.md`](FORMAT.md) is the
field reference; this is the procedure, in order, with the command for every
step that has one.

**The rule that saves the most time: never guess an id, and never hand-write a
mod from scratch.** Both have commands. Use them.

---

## 0. Prerequisites

| Need            | Check                               | Fix                            |
| --------------- | ----------------------------------- | ------------------------------ |
| Node 24+        | `node --version`                    | install Node                   |
| The repo's deps | `node -e "require.resolve('yaml')"` | `npm install` at the repo root |

Nothing else. There is no SDK to download, no build to run first, and no game
installation needed to author or validate a mod. You only need the game
installed to _play_ one.

## 1. Create the mod

```sh
node mod/tools/cli.mjs new my-mod --title "MY MOD"
```

Copies the worked example, rewrites every id to yours, and verifies the result
compiles before it reports success. **Start here even if you intend to delete
everything** — a mod that runs on the first try tells you the toolchain works,
which an empty folder cannot.

Put it wherever you like; `--in <dir>` picks the parent.

## 2. Decide what kind it is

Open `mod.yaml` and set `kind`:

- **`addon`** (default) — adds to the shipped game. Your ids must not collide
  with the base game's. Your levels join the campaign at their own `index`.
- **`conversion`** — replaces the campaign. Collisions are _allowed_ (that is
  how you re-skin a shipped venue), and you must list `campaign:` in play order.

If you are unsure, you want `addon`.

## 3. Write content

One file per thing, in the game's own format. The shipped content under
[`../content/`](../content) is the reference — it is the same format, so any
shipped file is a worked example of its kind.

| What                                           | Where                          | Reference                                                    |
| ---------------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| A venue                                        | `levels/<id>.yaml`             | [`../content/levels/moon.yaml`](../content/levels/moon.yaml) |
| Where your venues sit on the difficulty ladder | `ladder.yaml`                  | [`FORMAT.md`](FORMAT.md#ladderyaml--where-your-levels-sit)   |
| A monster                                      | `enemies/<biome>/<id>.yaml`    | [`../content/enemies/`](../content/enemies)                  |
| A weapon, gear piece or relic                  | `items/<rarity>/<id>.yaml`     | [`../content/items/`](../content/items)                      |
| Pixel art                                      | `sprites/<family>/<name>.yaml` | [`../content/sprites/`](../content/sprites)                  |
| A sound                                        | `sounds/<id>.yaml`             | [`../content/sounds/`](../content/sounds)                    |

**Every level needs a `ladder.yaml` row**, or it has no difficulty band and the
compiler refuses it. This catches people out; it is step 3b, not an optional
extra.

### Finding ids you may reference

```sh
node mod/tools/cli.mjs ids boots              # anything with "boots" in it
node mod/tools/cli.mjs ids ghost --kind enemies
node mod/tools/cli.mjs ids --kind abilities   # everything of one kind
```

Your level's loot pools, your monster's drops and your relic's `base` all name
ids. `ids` is faster and more reliable than reading `catalog.json`, which is
1,400 entries long. **An id you did not verify is the single most common reason
a mod fails to compile.**

## 4. Check it

```sh
node mod/tools/cli.mjs check my-mod
```

Reports **every** problem at once, each with the file that caused it. Loop here
until it prints a `✓` — this is the fast inner loop, and it writes nothing.

The desktop game runs this exact compiler when it loads a mod, so a `✓` here
means the game will accept it.

### Reading the errors

| Message                                    | What it means                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `sprite "x" has no frames`                 | A monster's `sprite:` names a family; the renderer needs `x_0` and `x_1`. Both must exist in your `sprites/` or the base game. |
| `already exist in the base game`           | An `addon` cannot shadow a shipped id. Prefix yours, or set `kind: conversion` if you _mean_ to replace it.                    |
| `ladder.yaml: missing entry for level "x"` | Step 3b. Add the four difficulty rows.                                                                                         |
| `grades: is not available to mods`         | The exceptional/elite ladder is compiled into the game. Author those versions as their own items.                              |
| `campaign names "x"`                       | A conversion's `campaign:` lists a level it does not ship.                                                                     |

## 5. Play it

```sh
node mod/tools/cli.mjs where     # prints the folder for your OS
```

Copy (or symlink) your mod folder there and launch the game. It appears under
**MODS** on the main menu. Switch it on, then **PLAY WITH THESE MODS**.

A mod in that folder is a **local** mod: it sorts last in the load order, so the
one you are iterating on wins any clash, and it is the only kind the game offers
a PUBLISH row for.

> Mods load in the **Steam desktop build only**. The browser and mobile builds
> have no Workshop and no filesystem to read a mod from.

## 6. Publish it

From the game: **MODS → your mod → PUBLISH TO WORKSHOP**.

The first publish creates the Workshop item and records its id in your folder
(`.workshop-id`), so publishing again _updates_ the same item rather than making
a second one. **Keep that file** — copy it with the mod if you move machines.

Two things that are not automatable and will bite:

- **Steam hides your item until you accept the Workshop legal agreement**, in a
  browser, once per account. The game says so when that is what happened; the
  item exists, it is just invisible until you do.
- **A `preview.png` in your mod folder becomes the thumbnail.** Without one your
  item is nearly invisible when people browse. Any reasonable size works.

## 7. When two mods clash

Mods load **top to bottom, and the last one wins**: sprites, levels, monsters
and items all resolve the same way. The game's **MODS → LOAD ORDER** screen
moves rows (← earlier, → later), and a mod that is being overridden says so on
its own help line.

You cannot resolve this at compile time — each mod is compiled alone, and its
author never saw the other one. If you would rather never collide, prefix your
ids with your mod id.

---

## What an agent should and should not decide alone

**Go ahead:** creating the mod, writing content, looking up ids, fixing compile
errors, iterating on numbers, running `check` as often as you like. All of it is
local, reversible and verified by the compiler.

**Ask first:**

- **Publishing.** It is public, it is under the user's Steam account, and the
  first publish mints a permanent Workshop item. Never publish unprompted.
- **`kind: conversion`.** It replaces the campaign and licenses id collisions —
  a much larger claim than an addon, and rarely what someone means by "add a
  level".
- **Changing an `id` after a first publish.** The id is how the game and the
  Workshop remember the mod; changing it orphans subscribers.
- **Anything in the game's own `content/`.** A mod lives in its own folder. If
  the fix seems to require editing shipped content, that is a finding to report,
  not a step to take.

**Cannot be done from here, so point the user at it:** balance judgement (is
this level fun, is this weapon overpowered) needs playing the game; art
judgement needs looking at the sprite; and Workshop store presentation
(description, tags, thumbnail) is marketing, not code.

## Known gaps

Honest list, so nothing is spent looking for a feature that is not there:

- **Music.** A mod can author SOUNDS (`sounds/<id>.yaml`) but not tracks — the
  chiptune score is still code rather than content. Lifting it is planned work,
  not a missing file format.
- **Story.** Cutscenes, the hero's pinned thoughts and story items are not
  mod-authorable yet.
- **`grades:`** ladders and the loot economy (`item_quality.yaml`,
  `item_rarity.yaml`) are deliberately the game's, not a mod's.

## Reference

- [`README.md`](README.md) — the guide
- [`FORMAT.md`](FORMAT.md) — every file and field
- [`examples/greenhouse`](examples/greenhouse) — the worked mod `new` copies
- [`catalog.json`](catalog.json) — every referenceable id (`cli.mjs ids` searches it)
- [`LICENSE.md`](LICENSE.md) — samples are CC0; your mod is yours
- [`../docs/modding.md`](../docs/modding.md) — how the game loads a mod
