# Contributing content — how to make a mod

Contributions to this project are **content**: new venues, monsters, weapons,
relics, powers, talents, companions, art, sound and story. You author them as a
**mod** — a folder of YAML in the game's own content format, published to the
Steam Workshop rather than merged here.

There is no scripting language to learn and no SDK to install. The files you
write are the same files the game's own content is written in, checked by the
same validator, so anything you can read under [`content/`](content) you can
copy into a mod.

> **Mods load in the Steam desktop build only.** The browser and mobile builds
> have no Workshop to subscribe to and no filesystem to read a mod from.

The [README](README.md) is the development environment — installing the repo,
the commands, and the **[testing loop](README.md#testing-mod-content)** every
step below leans on. This page is what to write.

## Prerequisites

| Need            | Check                               | Fix                            |
| --------------- | ----------------------------------- | ------------------------------ |
| Node.js ≥ 24    | `node --version`                    | `nvm use` (pinned in `.nvmrc`) |
| The repo's deps | `node -e "require.resolve('yaml')"` | `npm install` at the repo root |

Nothing else — no build to run first, and no installed copy of the game to
author or validate a mod. You need the game installed only to _play_ one.

## Getting the source

```sh
git clone https://github.com/niclaslindstedt/game.git
cd game
npm install
```

## 1. Scaffold it

```sh
node mod/tools/cli.mjs new my-mod --title "MY MOD"
```

This copies the worked example ([`mod/examples/greenhouse`](mod/examples/greenhouse)),
rewrites every id to yours, and verifies the result compiles before reporting
success. **Start here even if you intend to delete everything** — a mod that
runs on the first try tells you the toolchain works, which an empty folder
cannot. `--in <dir>` picks the parent; put it anywhere, in this repo or outside
it.

**Never write your files into this repo's `content/`.** A mod lives in its own
folder; `content/` is the shipped game's.

## 2. Decide what kind it is

`kind:` in `mod.yaml` decides what your mod is allowed to do.

|             | `addon` (the default)                  | `conversion`                           |
| ----------- | -------------------------------------- | -------------------------------------- |
| What it is  | Adds to the shipped game               | Replaces the campaign                  |
| Your ids    | Must not collide with the base game's  | May deliberately collide, and win      |
| Your levels | Join the campaign at their own `index` | Are the campaign, in `campaign:` order |
| The name    | The game's own                         | Yours, via `brand:`                    |
| Use it for  | A new venue, monster or gun            | A total conversion — a different game  |

If you are unsure, you want `addon`. A conversion is a much larger claim than
"add a level": it replaces the campaign and licenses id collisions.

## 3. Write the content

One file per thing. Every path is optional except `mod.yaml`.

| What                                           | Where in your mod                       | Copy from                                                               |
| ---------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| A venue's MISSION (story, ladder, loot)        | `levels/<id>.yaml`                      | [`content/levels/moon.yaml`](content/levels/moon.yaml)                  |
| That venue's MAP, carved fresh every run       | `maps/<id>.yaml`                        | [`content/maps/moon.yaml`](content/maps/moon.yaml)                      |
| Where your venues sit on the difficulty ladder | `ladder.yaml`                           | [`mod/FORMAT.md`](mod/FORMAT.md#ladderyaml--where-your-levels-sit)      |
| A monster                                      | `enemies/<biome>/<id>.yaml`             | [`content/enemies/`](content/enemies)                                   |
| A weapon, gear piece or named relic            | `items/<rarity>/<id>.yaml`              | [`content/items/`](content/items)                                       |
| An item SET (a kit of green armor)             | `sets.yaml`                             | [`content/sets.yaml`](content/sets.yaml)                                |
| A companion (a spared elite joining you)       | `companions.yaml`                       | [`content/companions.yaml`](content/companions.yaml)                    |
| A power                                        | `powerups.yaml`                         | [`content/powerups.yaml`](content/powerups.yaml)                        |
| A passive talent the hero ranks up             | `talents.yaml`                          | [`content/talents.yaml`](content/talents.yaml)                          |
| Pixel art                                      | `sprites/<family>/<name>.yaml`          | [`content/sprites/`](content/sprites)                                   |
| A sound / a music track                        | `sounds/<id>.yaml`, `music/<id>.yaml`   | [`content/sounds/`](content/sounds)                                     |
| An errand and the person who hands it out      | `quests/<id>.yaml`, `quest-givers.yaml` | [`content/quests/`](content/quests)                                     |
| A cutscene                                     | `cutscenes/<id>.yaml`                   | [`content/cutscenes/`](content/cutscenes)                               |
| The hero's inner monologues                    | `thoughts.yaml`                         | [`content/thoughts.yaml`](content/thoughts.yaml)                        |
| A story item and its lore                      | `story-items.yaml`                      | [`content/story-items.yaml`](content/story-items.yaml)                  |
| What the difficulty rungs are CALLED           | `difficulties.yaml`                     | [`mod/FORMAT.md`](mod/FORMAT.md#difficultiesyaml--what-the-ladder-says) |
| The Workshop thumbnail                         | `preview.png`                           | any reasonable size                                                     |

[`mod/FORMAT.md`](mod/FORMAT.md) is the field-by-field reference, and the shipped
file beside each row is a worked example of its kind.

Three rules catch everyone out:

- **A venue is TWO files.** `levels/<id>.yaml` is the mission — the venue minus
  its floor plan — and `maps/<id>.yaml` is the blueprint its geometry is carved
  from on every run. A level without a blueprint compiles, but no run can be
  built from it.
- **Every level needs a `ladder.yaml` row**, or it has no difficulty band and
  the compiler refuses it.
- **Never guess an id.** Your loot pools, your monster's drops and your relic's
  `base` all name ids, and an unverified id is the single most common reason a
  mod fails to compile:

  ```sh
  node mod/tools/cli.mjs ids boots              # anything matching "boots"
  node mod/tools/cli.mjs ids ghost --kind enemies
  node mod/tools/cli.mjs ids --kind abilities   # everything of one kind
  ```

  [`mod/catalog.json`](mod/catalog.json) is the complete list the compiler checks
  against — 1,400 entries, so search it with `ids` rather than reading it.

### Writing a mod's story

A conversion without a story is new monsters walking the shipped plot;
`cutscenes/`, `thoughts.yaml` and `story-items.yaml` are what change that. They
are also **the one part of this repo the campaign's story rules do not reach**:
do not file your lines into `docs/story.md` or `docs/manuscript.md`, and do not
"correct" them to match the shipped campaign. Contradicting it is allowed and,
for a conversion, usually the point. Your story answers to the schema alone.

The one rule worth keeping is a craft one: a text line is a **paragraph** the
box flows into whatever column it has, so write a page as one entry and let it
wrap. A second entry is an explicit line break — spend one only where the held
beat is the point. The compiler warns when a page runs past a screenful.

## 4. Validate it

```sh
node mod/tools/cli.mjs check my-mod
```

Reports **every** problem at once, each with the file that caused it. Loop here
until it prints a `✓` — this is the fast inner loop, and it writes nothing. The
desktop game runs this exact compiler when it loads a mod, so a `✓` here means
the game will accept it. [`mod/AGENTS.md`](mod/AGENTS.md) § "Reading the errors"
decodes each message.

## 5. Measure it, look at it, play it

`check` answers "is this valid". It cannot answer "is this any good" — whether
the map reads as a place, the fight is survivable, or the weapon you just wrote
is an instant-win button. Those have commands too, and **every instrument in
this repo takes `--mod`**:

```sh
node scripts/level-render.mjs my_level --mod ../my-mod --dormant     # LOOK at it
node scripts/simulate-run.mjs --mod ../my-mod --level my_level --verdict
node scripts/weapon-budget.mjs --mod ../my-mod       # is that weapon fair?
node scripts/unique-check.mjs --mod ../my-mod        # can that relic ever drop?
node pwa/scripts/playtest.mjs --mod ../my-mod --level my_level --speed 8
```

The full battery, with the question each command answers, is
[**Testing mod content**](README.md#testing-mod-content) in the README and
[`mod/AGENTS.md`](mod/AGENTS.md) step 5. Never judge a level from its YAML: the
numbers do not tell you the fight is a corridor, and a wall you mistyped is
invisible in text.

**Measure before you ask.** "Is this weapon overpowered" and "does this map
read" are answered by the commands above — reporting that the balance cannot be
judged without having run `simulate-run.mjs --mod … --verdict` skips the work.
What genuinely cannot be settled from here is whether it is _fun_.

### The skills

This repo ships a playbook per kind of game-development work under
[`.agent/skills/`](.agent/skills) — the quality bars, the iteration loops and
the traps. A mod is authored in the game's own format with the game's own
tools, so **the craft skills apply to a mod unchanged**: `level-design`,
`mapgen-improvement`, `enemy-design`, `weapon-system`, `pixel-assets`,
`sound-effects`, `simulate-run`, `playtest`, `test-scenario`, `debug-game`.
Read one before starting that kind of work, along with its accumulated lessons
(`node scripts/skill-lessons.mjs level-design`), and follow it with two
substitutions: run its commands with `--mod <dir>`, and write the files into
your mod folder. The table in [`mod/AGENTS.md`](mod/AGENTS.md) says how each
skill reads differently for a mod, and which ones are the game's rather than a
mod's.

## 6. Play it in the game

```sh
node mod/tools/cli.mjs where     # prints the mods folder for your OS
```

Copy or symlink your mod folder there, launch the Steam desktop build, and it
appears under **MODS** on the main menu. Switch it on, then **PLAY WITH THESE
MODS**. A mod in that folder is a **local** mod: it sorts last in the load
order, so the one you are iterating on wins any clash, and it is the only kind
the game offers a PUBLISH row for.

## 7. Publish it

From the game: **MODS → your mod → PUBLISH TO WORKSHOP**. The first publish
creates the Workshop item and records its id in your folder (`.workshop-id`), so
publishing again updates the same item instead of making a second one. **Keep
that file** — copy it with the mod if you move machines.

Three things that will bite:

- **Steam hides your item until you accept the Workshop legal agreement**, in a
  browser, once per account. The item exists; it is just invisible until you do.
- **Without a `preview.png` your item is nearly invisible** when people browse.
- **Do not change your `id` after the first publish.** It is how the game and
  the Workshop remember the mod; changing it orphans your subscribers.

You upload the YAML, not a build: Steam stores your folder exactly as you wrote
it and each subscriber's game compiles it locally, so your mod stays readable
and forkable.

## When two mods clash

Mods load **top to bottom, and the last one wins** — sprites, sounds, scores,
levels, monsters and items all resolve the same way. The game's **MODS → LOAD
ORDER** screen moves rows, a newly installed mod lands last (so it wins by
default), and a mod that is being overridden says so on its own help line. This
cannot be resolved at compile time: each mod is compiled alone, and its author
never saw the other one. If you would rather never collide, prefix your ids with
your mod id — `mymod_creeper`.

## Licensing your mod

The files you copy to write a mod — everything in
[`mod/examples/`](mod/examples), plus [`mod/README.md`](mod/README.md) and
[`mod/FORMAT.md`](mod/FORMAT.md) — are **public domain** (CC0). **Your mod is
yours**: publish or sell what you make, credit or no credit. The toolchain in
`mod/tools/` is licensed for making mods for _this_ game rather than for reuse
in another one; full terms in [`mod/LICENSE.md`](mod/LICENSE.md).

## Sending a change to this repo

Some things a mod cannot reach — the engine, the loot economy (`grades:`,
`item_quality.yaml`, `item_rarity.yaml`), the hero's XP curve, new effect
implementations, the mod format itself. If your change belongs here rather than
in a mod folder:

1. Fork, then branch: `feat/<slug>` or `fix/<slug>`.
2. Commit with [Conventional Commits](https://www.conventionalcommits.org/) —
   `<type>(<scope>): <summary>`, types `feat`, `fix`, `perf`, `docs`, `test`,
   `refactor`, `chore`, `ci`, `build`, `style`; breaking changes as `<type>!:`
   or a `BREAKING CHANGE:` footer.
3. Add tests. They live in `tests/` as Vitest files named `*_test.ts`, never
   inline in source — engine rules in `tests/engine/` against synthetic
   fixtures, shipped-content suites in `tests/content/`. Verify with
   `make test` (not a bare `npx vitest run`), plus `make lint` and
   `make fmt-check`.
4. Update the docs your change touches, and add a changelog fragment under
   `.changes/unreleased/` if a player would notice it — otherwise label the PR
   `no-changelog`. [`AGENTS.md`](AGENTS.md) has the full sync table.
5. Open a PR. The **title** must be conventional-commit format, because we
   squash-merge and it becomes the commit on `main`. CI must be green and a
   maintainer must approve before merge.

## Code of Conduct

By participating you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting security issues

See [SECURITY.md](SECURITY.md). Do **not** open public issues for security
problems.
