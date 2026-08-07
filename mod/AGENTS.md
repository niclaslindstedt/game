# Building a mod — the step-by-step

This file is for an **agent** (or a person who likes a checklist) working in
`mod/`. [`README.md`](README.md) is the tour and [`FORMAT.md`](FORMAT.md) is the
field reference; this is the procedure, in order, with the command for every
step that has one.

**An agent should load the `mod-authoring` skill first**
([`../.agent/skills/mod-authoring/SKILL.md`](../.agent/skills/mod-authoring/SKILL.md)):
it carries the scope — what the mod system supports and what it refuses — the
judgment calls to bring back to the user, and which craft skill to load for the
work. This file is the procedure that skill sends you to.

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

| What                                           | Where                          | Reference                                                       |
| ---------------------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| A venue's MISSION (story, ladder, loot)        | `levels/<id>.yaml`             | [`../content/levels/moon.yaml`](../content/levels/moon.yaml)    |
| That venue's MAP, carved fresh every run       | `maps/<id>.yaml`               | [`../content/maps/moon.yaml`](../content/maps/moon.yaml)        |
| Where your venues sit on the difficulty ladder | `ladder.yaml`                  | [`FORMAT.md`](FORMAT.md#ladderyaml--where-your-levels-sit)      |
| A monster                                      | `enemies/<biome>/<id>.yaml`    | [`../content/enemies/`](../content/enemies)                     |
| A weapon, gear piece or relic                  | `items/<rarity>/<id>.yaml`     | [`../content/items/`](../content/items)                         |
| A companion (a spared elite joining you)       | `companions.yaml`              | [`../content/companions.yaml`](../content/companions.yaml)      |
| An item SET (a kit of green armor)             | `sets.yaml`                    | [`../content/sets.yaml`](../content/sets.yaml)                  |
| What the difficulty rungs are CALLED           | `difficulties.yaml`            | [`FORMAT.md`](FORMAT.md#difficultiesyaml--what-the-ladder-says) |
| Pixel art                                      | `sprites/<family>/<name>.yaml` | [`../content/sprites/`](../content/sprites)                     |
| A sound, synthesized from voices               | `sounds/<id>.yaml`             | [`../content/sounds/`](../content/sounds)                       |
| A sound, RECORDED (a real audio file)          | `sounds/<id>.{wav,mp3,ogg,opus,flac}` (`<id>.1.wav`, `<id>.2.wav` … for takes it cycles) | [`FORMAT.md`](FORMAT.md#soundsidext--a-recording) |
| A whole SCORE, recorded                        | `music/<id>.opus`              | [`FORMAT.md`](FORMAT.md#musicidext--a-recorded-score)           |
| A music track                                  | `music/<id>.yaml`              | [`../content/music/`](../content/music)                         |
| A power                                        | `powerups.yaml`                | [`../content/powerups.yaml`](../content/powerups.yaml)          |
| A passive TALENT the hero ranks up             | `talents.yaml`                 | [`../content/talents.yaml`](../content/talents.yaml)            |
| A cutscene                                     | `cutscenes/<id>.yaml`          | [`../content/cutscenes/`](../content/cutscenes)                 |
| The hero's inner monologues                    | `thoughts.yaml`                | [`../content/thoughts.yaml`](../content/thoughts.yaml)          |
| A story item and its lore                      | `story-items.yaml`             | [`../content/story-items.yaml`](../content/story-items.yaml)    |

**Every level needs a `ladder.yaml` row**, or it has no difficulty band and the
compiler refuses it. This catches people out; it is step 3b, not an optional
extra.

### Two files that are not content, and are not optional either

- **`README.md`** — what your mod is, written for a person deciding whether to
  install it. `validate` refuses a folder without one (and refuses the
  scaffold's unwritten one), and `package` carries it into the zip.
- **`contents:` in `mod.yaml`** — every file the game loads, each with one line
  saying what it is. **The game shows these lines**: tapping a mod on the MODS
  screen opens a page built from them. Add the entry in the same edit as the
  file, the way a `ladder.yaml` row goes in with its level —
  [`FORMAT.md`](FORMAT.md#contents--every-file-and-what-it-is) has the fields.

### Finding ids you may reference

```sh
node mod/tools/cli.mjs ids boots              # anything with "boots" in it
node mod/tools/cli.mjs ids ghost --kind enemies
node mod/tools/cli.mjs ids --kind abilities   # everything of one kind
node mod/tools/cli.mjs sounds killed          # sounds, with what fires each
```

Your level's loot pools, your monster's drops and your relic's `base` all name
ids. `ids` is faster and more reliable than reading `catalog.json`, which is
1,400 entries long. **An id you did not verify is the single most common reason
a mod fails to compile.**

`sounds` is the same question for AUDIO, and the answer a recording needs: it
prints every sound the game ships with the event that fires it and a line on
what it is meant to feel like, because naming a file `enemy_killed.wav` is the
entire act of replacing that sound. `--play <mod-dir>` auditions YOUR OWN
recordings back to back without launching the game, which is the fastest way to
hear the one trap here: a recording repeats EXACTLY and the synthesized sound it
replaced did not, so a frequent sound wants either `<id>.1.wav`/`<id>.2.wav`
takes or a `pitchJitter: 0.05`. Get the name wrong and the mod installs
perfectly and is silent.

## 4. Check it

```sh
node mod/tools/cli.mjs check my-mod
```

Reports **every** problem at once, each with the file that caused it. Loop here
until it prints a `✓` — this is the fast inner loop, and it writes nothing.

The desktop game runs this exact compiler when it loads a mod, so a `✓` here
means the game will accept it.

### Reading the errors

| Message                                                         | What it means                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `sprite "x" has no frames`                                      | A monster's `sprite:` names a family; the renderer needs `x_0` and `x_1`. Both must exist in your `sprites/` or the base game. |
| `already exist in the base game`                                | An `addon` cannot shadow a shipped id. Prefix yours, or set `kind: conversion` if you _mean_ to replace it.                    |
| `ladder.yaml: missing entry for level "x"`                      | Step 3b. Add the four difficulty rows.                                                                                         |
| `grades: is not available to mods`                              | The exceptional/elite ladder is compiled into the game. Author those versions as their own items.                              |
| `campaign names "x"`                                            | A conversion's `campaign:` lists a level it does not ship.                                                                     |
| `is not a level this mod ships`                                 | A `maps/<id>.yaml` blueprint carves the level of the same name. Name it after one of yours (or `kind: conversion`).            |
| `unknown compass region "x"`                                    | A blueprint says WHERE with a compass name. `cli.mjs ids --kind regions` lists every one.                                      |
| `belongs to no set`                                             | A `rarity: set` piece needs a kit in `sets.yaml` to list it in `members:` (or make it a plain unique).                         |
| `is not one of the game's rungs`                                | `difficulties.yaml` renames the five rungs the game ships; it cannot add one.                                                  |
| `fx.element "x" is not one of…`                                 | A weapon's signature names an element from the game's palette. `cli.mjs ids --kind elements` lists them.                       |
| `the first bytes are not audio the game can play`               | A file in `sounds/` is not audio, or is not one of the five containers the desktop shell decodes. Read from the bytes, not the name. |
| `the contents are WAV, not MP3`                                 | A recording's extension disagrees with what is in it. Rename it as the message says.                                           |
| `carries both a recording named after it and `voices``          | One sound, one source. Drop the `voices:` — or rename the file and reach it from a `call: sample` voice, which is how you LAYER a recording rather than swap one. |
| `is not a sound the game has, and nothing in this mod plays it` | A WARNING, and almost always a typo in a recording's name — `cli.mjs sounds` has the list.                                     |

### 4b. Audit the folder — `validate`

```sh
node mod/tools/cli.mjs validate my-mod
```

`check` compiles; this asks the questions a compiler cannot. Is everything in
the folder something the game reads (a `.DS_Store`, a layered `.psd`, last
week's `notes.txt` — all of them compile fine and all of them would ship)? Is
anything in a place NOTHING reads (a sprite one directory too deep, an item
under a rarity that does not exist)? Is there a README, and does the manifest's
`contents:` describe every file the game loads?

Run it before anybody else sees the folder. It writes nothing.

| Message                           | What it means                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `remove it before you package`    | Junk — an editor or an operating system left it there.                                     |
| `nothing is loaded this deep`     | The file is real and the game never sees it. Check the depth against `FORMAT.md`.          |
| `contents: does not describe "x"` | A file the game loads with no line saying what it is. Write one.                           |
| `"x" is not in the mod folder`    | The inventory describes a file that is not there — usually a rename that stopped half-way. |
| `README.md: still carries…`       | The scaffold's README. Write it before you publish.                                        |

## 5. Measure it — every instrument in this repo takes `--mod`

`check` answers "is this valid". It cannot answer "is this any good": whether the
map reads as a place, whether the fight is survivable, whether the weapon is an
instant-win button, whether the relic can ever drop. **Those questions have
commands too** — the same ones this game's own content was built with, and every
one of them takes `--mod <dir>`:

```sh
node scripts/level-render.mjs my_level --mod ../my-mod --dormant
```

The flag is **repeatable and ordered** (`--mod a --mod b` — b wins any id both
define, exactly as the player's load order does), the mod folder may live
anywhere, and the commands run **from the repo root**. A mod that does not
compile stops the tool with the same list `check` prints — there is nothing to
measure until it does.

Under the hood it is not a second loader: `--mod` runs the real compiler and
registers the result through the same `registerDefs` seam the desktop game uses
(`scripts/mod-support.mjs`), so a tool measuring your mod is measuring what
players will actually get.

### The loop, in the order a mod gets built

**1. LOOK at the map.** Never judge a level from its YAML — the numbers do not
tell you the fight is a corridor, and a wall you mistyped is invisible in text.

| Command                                     | What it shows                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `scripts/level-render.mjs <id> --mod <dir>` | the map drawn with the REAL sprites at true scale — add `--dormant` to stand the whole horde in it            |
| `scripts/map-layout.mjs <id> --mod <dir>`   | the design blueprint: walls, zones, and CON CIRCLES (mob level vs the hero level your `ladder.yaml` promises) |
| `scripts/map-preview.mjs <id> --mod <dir>`  | the annotated design diagram; `--actual` scatters a real `createGame`, `--heatmap` overlays a played run      |
| `… --seed N --size large`                   | another run's carve of the same map — every render is of ONE carve, so change the seed to see the spread      |

**2. PLAY it.** The autopilot plays your level in the real renderer, in headless
Chromium, and hands back the run's stats and screenshots:

```sh
npm install --no-save playwright        # once — deliberately not a repo dep
(cd pwa && npx vite --port 5199 &)      # the dev server, once
node pwa/scripts/playtest.mjs --mod ../my-mod --level my_level --speed 8
```

Screenshots land in `pwa/assets-preview/playtest/`; the run's stats come back as
JSON on stdout. `--speed 8` fast-forwards deterministically, `--scenario` stages
an exact situation (`'{"place":"boss","hp":2}'`), and `--seed` pins the layout.

This is the only instrument that needs the app running, and the only one that
shows your mod as a player sees it: sprites, sounds, HUD, the lot. (It works
because the harness compiles your mod and hands the bundles to the app's own
`applyMods` — the browser build still has no Workshop and no filesystem.)

**3. MEASURE the balance.** The simulator runs the real engine headlessly — no
renderer, no waiting — and is the closing loop of every balance change:

| Command                                             | Answers                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `scripts/simulate-run.mjs --mod <dir> --level <id>` | can it be cleared, at what hero level, how hard does it hit back, what dropped                                                |
| `… --verdict`                                       | one screen of PASS/WARN/FAIL — loot-fits-level, blows-to-kill, DPS-on-curve, starved pools                                    |
| `… --difficulty all --mortal`                       | does it survive the whole ladder, and where does the hero die (the DEATHS table prints a ready `map-layout --deaths` command) |
| `… --json a.json` then `… --compare a.json`         | A/B two tunings of your own mod                                                                                               |
| `scripts/progression-sim.mjs --mod <dir>`           | the paper playthrough: where your venue sits on the whole campaign's curve                                                    |
| `scripts/mob-hp-curve.mjs --mod <dir>`              | how many blows your monsters take at each rung                                                                                |
| `scripts/drop-rate.mjs --mod <dir> --level <id>`    | how often your relic actually drops                                                                                           |

**4. PRICE the loot.** A weapon off the damage budget is the fastest way to
wreck a game — yours or the one your addon is joining.

| Command                                         | Answers                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `scripts/weapon-budget.mjs --mod <dir>`         | is each weapon on the line its `levelReq` and shape are worth (it names the range it owes)        |
| `scripts/item-forge.mjs --mod <dir> weapon …`   | the reverse: give it the SHAPE, it computes the numbers (author the YAML from its output)         |
| `scripts/weapon-stats.mjs --mod <dir>`          | the sanity battery — pools that fit the venue's band, ladders that never step down, missing icons |
| `scripts/weapon-ilvl.mjs --mod <dir> --check`   | a relic's computed ilvl vs its authored one, and whether its bonuses fit its equip gate           |
| `scripts/unique-check.mjs --mod <dir>`          | **the one to run before publishing anything named**: a relic wired to nothing can never drop      |
| `scripts/weapon-sheet.mjs --mod <dir> [--list]` | the whole arsenal as one image (or one markdown table), yours folded in                           |
| `scripts/weapon-scatter.mjs --mod <dir>`        | every weapon plotted against the budget curve — the picture of an outlier                         |

**5. LOOK at the art.** Pixel art is judged by eye, at size, on the ground it
will be drawn on:

| Command                                                  | Shows                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| `scripts/sprite-peek.mjs --mod <dir> <name,name>`        | a few named sprites, big                                             |
| `scripts/sprite-preview.mjs --mod <dir> family <family>` | a numbered contact sheet of your whole sprite family                 |
| `scripts/art-audit.mjs --mod <dir> level <id>`           | every piece of art your venue puts on screen, numbered, side by side |

Your mod's monsters get their **wound frames** and your armor its **worn
overlay** derived exactly as the shipped ones do, so those show up too.

### What does NOT take `--mod`, and why

Honest list, so nothing is spent hunting a flag that is not there:

- **`leveling-curve.mjs` / `leveling-pace.mjs`** — the hero's XP curve is the
  GAME's (`content/leveling.yaml` is not a file a mod may ship), so there is
  nothing mod-specific to read.
- **`aoe-calibration.mjs`, `simulate-bench.mjs`** — they measure the engine
  itself, which a mod cannot change.
- **the library generator, `effects-gallery.mjs`, `weapon-swing.mjs`,
  `talent-preview.mjs`, `ui-shots.mjs`, `store-shots.mjs`** — app-side surfaces
  that read the shipped catalogs and the built atlas. `playtest.mjs` is the
  browser-side instrument that does take the flag.
- **`make assets` / `make levels`** — those compile THIS repo's `content/` tree.
  Your mod is compiled by `cli.mjs check`; never add your files to `content/`.

## 6. Package it, and play it

```sh
node mod/tools/cli.mjs package my-mod    # validate, then write the zip
node mod/tools/cli.mjs where             # prints both folders the game reads
```

`package` runs the whole audit first and writes **nothing** if it fails; what it
does write is `<id>-<version>.zip`, holding the manifest, every file
`contents:` declares, and your README, LICENSE and thumbnail. Not the
`.workshop-id` (that names YOUR Workshop item), not the `mod.json` the compiler
left, not a `.DS_Store`. That zip is the thing to hand somebody: both folders
below take one, unpacked or not.

Copy (or symlink) your mod folder — or drop the zip — into either, and launch
the game. It appears under **MODS** on the main menu; open it there to see the
page your `contents:` block writes, switch it on, and back out to **PLAY WITH
THESE MODS**.

|                 | `mods/` beside the game                                   | the game's data folder                                                                       |
| --------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Where           | the install folder — **Windows and Linux only**           | per-platform application data (`cli.mjs where`)                                              |
| Takes           | a mod folder **or a `.zip` of one**                       | a mod folder **or a `.zip`**                                                                 |
| PUBLISH offered | no — what is published is what was AUTHORED               | **yes**, for a folder (never for a zip)                                                      |
| Use it for      | handing a mod to somebody else, and testing what they get | the mod you are writing — and anything RECEIVED on macOS, which has no install-folder option |

Both sort after any subscriptions, so the one you just added wins its clashes.

> Mods load in a **desktop build only** — the browser and mobile builds have no
> Workshop and no filesystem to read a mod from. The Steam build has them on; a
> plain download needs `--mods` on its command line.

## 7. Publish it

From the game: **MODS → your mod → PUBLISH TO WORKSHOP** (the row is on the
mod's own page, and only for a mod in the game's data folder — what gets
published is what somebody AUTHORED).

The first publish creates the Workshop item and records its id in your folder
(`.workshop-id`), so publishing again _updates_ the same item rather than making
a second one. **Keep that file** — copy it with the mod if you move machines.

Two things that are not automatable and will bite:

- **Steam hides your item until you accept the Workshop legal agreement**, in a
  browser, once per account. The game says so when that is what happened; the
  item exists, it is just invisible until you do.
- **A `preview.png` in your mod folder becomes the thumbnail.** Without one your
  item is nearly invisible when people browse. Any reasonable size works.

## 8. When two mods clash

Mods load **top to bottom, and the last one wins**: sprites, sounds, scores,
levels, monsters and items all resolve the same way. The game's **MODS → LOAD ORDER** screen
moves rows (← earlier, → later), and a mod that is being overridden says so on
its own help line.

You cannot resolve this at compile time — each mod is compiled alone, and its
author never saw the other one. If you would rather never collide, prefix your
ids with your mod id.

---

## The SKILLS, the scope, and what to ask before doing

Owned by the **`mod-authoring` skill**
([`../.agent/skills/mod-authoring/SKILL.md`](../.agent/skills/mod-authoring/SKILL.md)),
so it is stated once and stays consistent:

- **which craft skill to load** for each kind of work, and how each reads
  differently inside a mod folder (run its commands with `--mod <dir>`, write
  its files into the MOD folder — never this repo's `content/`);
- **which skills are the GAME's** and are a wrong turn inside `mod/`;
- **the scope** — every catalog a mod may ship, and what the format refuses
  (code of any kind, a new talent proc or ability effect, `grades:` ladders, the
  loot economy, the XP curve, the title menu, the built atlas);
- **the decisions to bring back to the user** — publishing, `kind: conversion`,
  changing a published mod's `id`, anything that would need this repo's
  `content/` or `src/` edited.

### Writing a mod's STORY

A conversion without a story is new monsters walking the shipped plot; the three
story files (`cutscenes/`, `thoughts.yaml`, `story-items.yaml`) are what change
that. The campaign's three-tier story chain does **not** reach them — a mod's
script answers to the schema alone (the `mod-authoring` skill has the rule).

What DOES apply is the craft one, and it is the opposite of
what a fixed-width box would ask for: a text line is a PARAGRAPH the box flows
into whatever column it has, so write a page as ONE entry and let it wrap. A
second entry is an explicit line break — spend one only where the beat is the
point. The compiler warns when a page runs past a screenful or spends more than
one break.

## What an agent decides alone, and what it asks

**Go ahead:** creating the mod, writing content, looking up ids, fixing compile
errors, iterating on numbers, running `check` as often as you like — and every
instrument in step 5. All of it is local, reversible, and either verified by the
compiler or written to `pwa/assets-preview/`.

**Measure before you ask.** "Is this weapon overpowered" and "does this map
read" are not questions to hand back — step 5 answers both, and reporting "I
cannot judge the balance" without having run `simulate-run.mjs --mod … --verdict`
has skipped the work. What genuinely cannot be settled from here is whether the
result is FUN, and the Workshop store presentation (description, tags,
thumbnail), which is marketing rather than code.

**What to ask first** — publishing, `kind: conversion`, changing a published
mod's `id`, anything needing this repo's own `content/` — is the `mod-authoring`
skill's list, with the reasoning behind each.

## Reference

- [`README.md`](README.md) — the guide
- [`FORMAT.md`](FORMAT.md) — every file and field, what may be in the folder at all, and `contents:`
- [`examples/greenhouse`](examples/greenhouse) — the worked mod `new` copies
- [`catalog.json`](catalog.json) — every referenceable id (`cli.mjs ids` searches it), and every sound with what fires it (`cli.mjs sounds`)
- [`LICENSE.md`](LICENSE.md) — samples are CC0; your mod is yours
- [`../docs/modding.md`](../docs/modding.md) — how the game loads a mod
- [`../scripts/mod-support.mjs`](../scripts/mod-support.mjs) — what `--mod` does
- [`../.agent/skills/`](../.agent/skills) — the craft playbooks (see above)
