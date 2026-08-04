# Contributing content — how to make a mod

Contributions to this project are **content**: venues, monsters, weapons,
relics, powers, talents, companions, art, sound and story. You author them as a
**mod** — a folder of YAML in the game's own content format, published to the
Steam Workshop rather than merged here.

There is no scripting language to learn and no SDK to install. The files you
write are the same files the game's own content is written in, checked by the
same validator, so anything under [`content/`](content) is a worked example.

> **Mods load in the Steam desktop build only.** The browser and mobile builds
> have no Workshop to subscribe to and no filesystem to read a mod from.

## Use a coding agent — this repo is built for it

**The fastest way to make a mod here is to point an AI coding agent at it.**
That isn't a shortcut around the docs; it is what the repo is arranged for. Every
catalog is plain YAML validated by a readable schema, every error names its file
and its reason, and every judgement an author has to make — is this map any good,
is this weapon fair, can this relic drop — has a command that answers it. Those
are exactly the conditions an agent works well in, and none of them require it to
guess.

Point yours at **[`.agent/skills/mod-authoring/SKILL.md`](.agent/skills/mod-authoring/SKILL.md)**:

```
Read .agent/skills/mod-authoring/SKILL.md and follow it.
I want a mod that <what you want>.
```

The skill carries the scope (what the format supports and what it refuses), the
loop, which craft playbook to load for each kind of work, the verification bar
before it reports back, and the decisions it must bring to you rather than take
— publishing above all. Claude Code loads it by name; any other agent reads the
file. The rest of this page is the same ground for doing it yourself.

## Prerequisites

| Need            | Check                               | Fix                            |
| --------------- | ----------------------------------- | ------------------------------ |
| Node.js ≥ 24    | `node --version`                    | `nvm use` (pinned in `.nvmrc`) |
| The repo's deps | `node -e "require.resolve('yaml')"` | `npm install` at the repo root |

Nothing else — no build to run first, and no installed copy of the game to
author or validate a mod. You need the game installed only to _play_ one.

```sh
git clone https://github.com/niclaslindstedt/game.git
cd game
npm install
```

## The loop

```sh
node mod/tools/cli.mjs new my-mod --title "MY MOD"   # 1. scaffold — it already compiles
node mod/tools/cli.mjs ids boots --kind items        # 2. look up every id before you use it
node mod/tools/cli.mjs check my-mod                  # 3. validate — fast, writes nothing
node scripts/simulate-run.mjs --mod ../my-mod …      # 4. measure it (see the README)
node mod/tools/cli.mjs where                         # 5. where to drop it to play it
```

**Start at 1 even if you mean to delete everything** — a mod that runs on the
first try proves the toolchain works, which an empty folder cannot. Then loop
2–4 until `check` prints a `✓`, which means the game will accept it: the desktop
build runs that exact compiler when it loads a mod.

- **What a mod may contain**, file by file → [`mod/README.md`](mod/README.md)
- **Every field of every file** → [`mod/FORMAT.md`](mod/FORMAT.md), whose
  [schema table](mod/FORMAT.md#the-schemas--the-last-word-on-every-field) names
  the validator that has the last word on each one
- **Every command, and what each error means** → [`mod/AGENTS.md`](mod/AGENTS.md)
- **How to render, simulate and playtest what you wrote** →
  [Testing mod content](README.md#testing-mod-content)

### Three rules that catch everyone out

- **A venue is TWO files.** `levels/<id>.yaml` is the mission — the venue minus
  its floor plan — and `maps/<id>.yaml` is the blueprint its geometry is carved
  from on every run. A level without a blueprint compiles, and no run can be
  built from it.
- **Every level needs a `ladder.yaml` row**, or it has no difficulty band and
  the compiler refuses it.
- **Never guess an id.** Loot pools, drops and a relic's `base` all name ids, and
  an unverified id is the single most common reason a mod fails to compile.
  `cli.mjs ids` searches the 1,400-entry catalog the compiler checks against.

### Judge it with the instruments, not by eye

`check` says a mod is valid. It cannot say the map reads as a place, the fight
is survivable, or the weapon is an instant-win button — but **every instrument
in this repo takes `--mod`**, and those are the same tools this game's own
content was built with:

```sh
node scripts/level-render.mjs my_level --mod ../my-mod --dormant     # LOOK at it
node scripts/simulate-run.mjs --mod ../my-mod --level my_level --verdict
node scripts/weapon-budget.mjs --mod ../my-mod       # is that weapon fair?
node scripts/unique-check.mjs --mod ../my-mod        # can that relic ever drop?
node pwa/scripts/playtest.mjs --mod ../my-mod --level my_level --speed 8
```

Never judge a level from its YAML: the numbers do not tell you the fight is a
corridor, and a wall you mistyped is invisible in text. The full battery is
[Testing mod content](README.md#testing-mod-content) in the README.

### Your mod's story is yours

`cutscenes/`, `thoughts.yaml` and `story-items.yaml` are what make a conversion
a different game rather than a re-skin, and they are the one part of this repo
the shipped campaign's story rules do not reach. Don't file your lines into
`docs/story.md` or `docs/manuscript.md`, and don't "correct" them to match the
campaign — contradicting it is allowed and usually the point.

One craft rule is worth keeping: a text line is a **paragraph** the box flows
into whatever column it has, so write a page as one entry and let it wrap. A
second entry is an explicit line break; spend one only where the held beat is
the point.

## Publishing

From the game: **MODS → your mod → PUBLISH TO WORKSHOP**. The first publish
creates the Workshop item and records its id in your folder (`.workshop-id`), so
publishing again updates the same item instead of making a second one. Keep that
file.

- **Steam hides your item until you accept the Workshop legal agreement**, in a
  browser, once per account.
- **Without a `preview.png` your item is nearly invisible** when people browse.
- **Never change your `id` after the first publish** — it is how the game and the
  Workshop remember the mod, and changing it orphans your subscribers.

You upload the YAML, not a build: each subscriber's game compiles it locally, so
your mod stays readable and forkable. Mods load top to bottom and **the last one
wins** any clash; prefix your ids with your mod id if you would rather never
collide. The rest — load order, the two kinds, licensing — is
[`mod/README.md`](mod/README.md).

**Your mod is yours.** The files you copy to write one (`mod/examples/`,
`mod/README.md`, `mod/FORMAT.md`) are public domain (CC0); publish or sell what
you make. The toolchain in `mod/tools/` is licensed for making mods for _this_
game — full terms in [`mod/LICENSE.md`](mod/LICENSE.md).

## Sending a change to this repo

Some things a mod cannot reach: the engine, the loot economy, the hero's XP
curve, new effect implementations, the mod format itself. If your change belongs
here rather than in a mod folder:

1. Fork, then branch: `feat/<slug>` or `fix/<slug>`.
2. Commit with [Conventional Commits](https://www.conventionalcommits.org/) —
   `<type>(<scope>): <summary>`; breaking changes as `<type>!:` or a
   `BREAKING CHANGE:` footer.
3. Add tests. They live in `tests/` as Vitest files named `*_test.ts`, never
   inline in source. Verify with `make test` (not a bare `npx vitest run`), plus
   `make lint` and `make fmt-check`.
4. Update the docs your change touches, and add a changelog fragment under
   `.changes/unreleased/` if a player would notice it — otherwise label the PR
   `no-changelog`. [`AGENTS.md`](AGENTS.md) has the full sync table.
5. Open a PR. The **title** must be conventional-commit format, because we
   squash-merge and it becomes the commit on `main`. CI must be green and a
   maintainer must approve.

## Code of Conduct

By participating you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting security issues

See [SECURITY.md](SECURITY.md). Do **not** open public issues for security
problems.
