# Modding Ada's Trail

Make your own levels, monsters and pixel art — or replace the whole game with
something else — and publish it to the Steam Workshop.

A mod is a folder of YAML. There is no scripting language to learn and no SDK to
install: the files you write are **the same files the game's own content is
written in**, checked by the same validator, so anything you can read in
`content/` you can copy into a mod.

> **Desktop only.** Mods load in the Windows, macOS, and Linux builds. Ordinary
> players may use them only with a game licence acquired through Steam; the
> Steam edition has not been published yet. A mod creator may launch an
> official downloaded desktop binary with `--modifications` solely to build and
> test their own mod. Regular players may not use that exception, and it never
> permits multiplayer. The browser and mobile builds do not load mods.

---

## The shortest possible mod

```sh
node mod/tools/cli.mjs new my-mod     # scaffold a mod that already works
node mod/tools/cli.mjs check my-mod   # validate it
node mod/tools/cli.mjs ids boots      # what ids may I reference?
node mod/tools/cli.mjs where          # where do I put it to play it?
```

`new` copies the worked example with every id renamed to yours, and verifies the
result compiles before it says so — you start from something that already runs
rather than from an empty folder. `check` then prints every problem it finds,
with a filename and a reason; when it prints a `✓`, the game will accept it.

**Working with a coding agent?** Point it at
[`../.agent/skills/mod-authoring/SKILL.md`](../.agent/skills/mod-authoring/SKILL.md)
— the scope, the loop and the judgement calls — which sends it to
**[`AGENTS.md`](AGENTS.md)**, the step-by-step from `new` to publish with the
command for every step. Both are just as usable as a human checklist.

What `new` copies is [`examples/greenhouse`](examples/greenhouse): one venue,
one monster, one weapon, one relic, three sprites, one sound, one score, and a
comment on every field explaining why it is there.

## What is in a mod

```
my-mod/
  mod.yaml                     the manifest — id, name, version, author, kind
  ladder.yaml                  where your levels sit on the difficulty ladder
  levels/<id>.yaml             one MISSION each — a venue minus its floor plan
  maps/<id>.yaml               that venue's map, carved fresh every run
  enemies/<biome>/<id>.yaml    one monster each
  items/<rarity>/<id>.yaml     one weapon, gear piece or named relic each
  sprites/<family>/<name>.yaml one pixel grid each
  sounds/<id>.yaml             one sound each
  music/<id>.yaml              one score each
  powerups.yaml                every power your mod adds
  talents.yaml                 the passives the hero buys ranks in
  companions.yaml              who your spared elites join you as
  sets.yaml                    the kits your green armor pieces belong to
  difficulties.yaml            what the difficulty rungs are CALLED (voice only)
  cutscenes/<id>.yaml          one scene each — stage, cast, timeline of beats
  thoughts.yaml                the hero's inner monologues
  story-items.yaml             the plot pieces his finds spell out
  preview.png                  the Workshop thumbnail (optional but do it)
```

Every path is optional except `mod.yaml` — a mod that adds only monsters is a
mod, and so is one that adds only a level. See [`FORMAT.md`](FORMAT.md) for the
field-by-field reference.

**If you are building a conversion, write the story.** The last three paths are
what make a mod a different game rather than a re-skin: the scene it opens on, the
hero's read on what he is looking at, and the lore he finds on the floor. They are
also the part nobody governs — your plot does not have to agree with the shipped
one, and a conversion's usually shouldn't.

`talents.yaml` is the other half of "a different game": the passives the hero
grows into are the build system, and until a mod could author them a total
conversion could re-skin every monster, venue and relic and still hand the player
this game's eight melee talents. Yours merge into the shipped trees, so an addon
can also just add one good passive and nothing else.

`companions.yaml` belongs to that half too. Sparing a beaten elite and having it
walk out beside you is one of the game's few real decisions, and until a mod could
author its own roster the only figures it could hand over were the shipped four —
so a conversion's monsters could be its own while its allies stayed somebody
else's.

## Testing a mod without publishing it — and sending one to a friend

**The game will show you.** Open **MODS** on the main menu: the rows at the foot
of the list name the folders it reads from, and pressing one opens it in your
file manager. Drop a mod folder or a `.zip` in, come back to the screen, and it
is there — the list is re-read every time you enter it, so nothing needs a
relaunch. `node mod/tools/cli.mjs where` prints the same two folders from a
terminal.

**`mods/` beside the game** (Windows and Linux) — the folder to tell another
player about:

```
<the game's install folder>/mods/
```

On Steam that is LIBRARY → right-click the game → BROWSE LOCAL FILES. It takes
a mod **folder or a `.zip` of one**, so **sending somebody a mod is sending
them a zip** and naming this directory — no unpacking, and no application-data
path to dictate. A zip may be the mod's own files at the top level or wrapped
in one folder (what right-click → compress produces); both are read, and the
game unpacks it itself into its own cache.

**macOS has no such folder, deliberately.** An installed app lives in
`/Applications` — not a place a game should be writing its data into — and
putting files inside the `.app` would break the signature it is notarized
under. On macOS the data folder below is the whole answer, and it takes `.zip`
files too.

**The game's data folder** — for the mod you are WRITING, and on macOS for
anything you were sent:

| OS      | Where                                           |
| ------- | ----------------------------------------------- |
| Windows | `%APPDATA%\adastrail\mods\`                     |
| macOS   | `~/Library/Application Support/adastrail/mods/` |
| Linux   | `~/.config/adastrail/mods/`                     |

A mod here is a **local** mod: the only kind the game offers a PUBLISH row for,
because what is published is what somebody authored — a mod you were sent is
played, not republished. Both folders sort after your subscriptions, so the mod
you just added wins its clashes while you iterate.

If you do not hold the released Steam edition, launch the official downloaded
desktop binary with `--modifications` to enable this local authoring path. That
parameter is licensed only while creating, validating, and testing a mod you
author. It is not a general mod-player switch and does not enable licensed
multiplayer use.

## Looking at it, measuring it, playing it

`check` tells you a mod is valid. It cannot tell you the map reads as a place,
the fight is survivable, or the weapon you just wrote is an instant-win button.
**The tools this game's own content was built with answer those, and every one
of them takes `--mod <dir>`** — run from the repo root:

```sh
node scripts/level-render.mjs my_level --mod ../my-mod --dormant   # LOOK at it
node scripts/simulate-run.mjs --mod ../my-mod --level my_level --verdict
node scripts/weapon-budget.mjs --mod ../my-mod      # is that weapon fair?
node scripts/unique-check.mjs --mod ../my-mod       # can that relic ever drop?
node pwa/scripts/playtest.mjs --mod ../my-mod --level my_level --speed 8
```

The full list — the map renderers, the campaign simulator, the drop and
progression probes, the weapon and relic battery, the sprite sheets, and which
question each one answers — is **[`AGENTS.md`](AGENTS.md) step 5**.

## Two kinds of mod

`kind:` in the manifest decides what your mod is allowed to do.

|             | `addon`                                | `conversion`                           |
| ----------- | -------------------------------------- | -------------------------------------- |
| What it is  | Adds to the shipped game               | Replaces the campaign                  |
| Your ids    | Must not collide with the base game's  | May deliberately collide, and win      |
| Your levels | Join the campaign at their own `index` | Are the campaign, in `campaign:` order |
| The name    | The game's own                         | Yours, via `brand:` — see FORMAT.md    |
| Use it for  | A new venue, a new monster, a new gun  | A total conversion — a different game  |

An **addon** is the safe default. A **conversion** is how you re-skin THE MOON
rather than adding a seventh venue: name your level `moon`, and yours is the one
that loads.

## Two mods, one sprite — the load order

Yes, a mod can replace the game's sprites: a `conversion` may ship a sprite with
a shipped name and it wins. (An `addon` may not — the compiler refuses it, and
tells you to prefix the name or switch to `conversion`.)

Two **mods** shipping the same sprite is a different problem, and it is not one
the compiler can solve. Each mod is compiled on its own; your mod's author never
saw the other one. So it is resolved where it actually happens — at load, by an
order the player owns:

> **Mods load top to bottom. The LAST one wins a clash.**

One rule, for every kind of content: sprites, sounds, scores, levels and
monsters all resolve the same way. The game's **MODS** screen numbers the rows,
and **LOAD ORDER** moves them (← earlier, → later; confirm also moves a row on a pad or a touch
screen). A mod that is currently being overridden says so on its own help line,
so "why is this mod not doing anything" has an answer on the screen instead of
being a mystery.

Two things follow that are worth knowing as an author:

- **A newly installed mod lands LAST**, so it wins by default. A player who just
  subscribed to your mod sees it working, rather than silently losing to
  something they installed a year ago.
- **The order survives unsubscribing.** A mod that is uninstalled keeps its
  rank, so resubscribing puts it back where the player had it rather than
  dropping it to the bottom and quietly changing who wins.

If you would rather not collide at all, prefix your ids with your mod id —
`mymod_creeper`, `mymod_creeper_0`. The load order is there for when you _do_
mean to override.

## What you may reference

Your level can name any monster, weapon, gear piece, power, companion or sprite
the base game ships, plus everything your own mod adds.
[`catalog.json`](catalog.json) is the complete list, and the compiler checks
every id against it — a typo is an error with a filename, never a monster that
silently fails to appear.

## Publishing to the Steam Workshop

**MODS** is a row on the game's main menu. Your own mods appear there alongside
anything you have subscribed to, each with a **PUBLISH TO WORKSHOP** row under
it. The first publish creates the Workshop item and remembers its id, so
publishing again updates the same item instead of making a second one.

Two things to know:

- **You upload the YAML, not a build.** Steam stores your folder exactly as you
  wrote it, and each subscriber's game compiles it locally. Your mod stays
  readable and forkable, the way the game's own content is.
- **Steam will not show your item until you have accepted the Workshop legal
  agreement**, in a browser, once per account. The game says so if that is what
  happened — the item exists, it is just invisible until you do.

## Rules the format keeps

Three, and they are all in service of the same thing: subscribing to a stranger's
mod must be safe and must not be able to wreck your game.

1. **Nothing executes.** A mod is data — defs and pixels. There is no scripting
   hook, and there will not be one.
2. **A mod is compiled and validated before the game sees it**, in the desktop
   shell, once, at load. The game itself never parses a mod's YAML.
3. **A mod applies to a RUN, not to your install.** Start a modded run and the
   mod's content is live; finish it and the shipped game is back. A hero
   remembers which mod they were played under, so your roster still reads
   correctly after you unsubscribe.

## Licence, in one paragraph

The files you copy to write a mod — everything in [`examples/`](examples), plus
this page and [`FORMAT.md`](FORMAT.md) — are **public domain** (CC0). Copy them,
change them, publish or sell what you make, credit or no credit; you should
never have to think about the licence to start a mod. **Your mod is yours**, and
it is not a derivative of the toolchain. The toolchain itself
([`tools/`](tools)) is licensed for making mods for _this_ game rather than for
reuse in another one. Full terms: [`LICENSE.md`](LICENSE.md).

The SDK licence does not itself license playing mods or multiplayer. Ordinary
player use requires a game licence acquired through Steam; the limited
`--modifications` exception above exists only for creators testing their own
work before that edition is published.

## Reference

- [`AGENTS.md`](AGENTS.md) — the procedure, start to publish
- [`FORMAT.md`](FORMAT.md) — every file and every field
- [`examples/greenhouse`](examples/greenhouse) — a complete worked mod
- [`catalog.json`](catalog.json) — every id you may reference
- [`LICENSE.md`](LICENSE.md) — the SDK's own terms
- [`../docs/modding.md`](../docs/modding.md) — how mods load, for the curious
- The game's own content under [`../content/`](../content) — the best reference
  there is, because it is the same format
