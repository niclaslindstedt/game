# Modding Gone in Space

Make your own levels, monsters and pixel art — or replace the whole game with
something else — and publish it to the Steam Workshop.

A mod is a folder of YAML. There is no scripting language to learn and no SDK to
install: the files you write are **the same files the game's own content is
written in**, checked by the same validator, so anything you can read in
`content/` you can copy into a mod.

> **Steam only.** Mods load in the desktop (Steam) build. The browser and mobile
> builds have no Workshop to subscribe to and no filesystem to read a mod from,
> so they play the shipped game. Nothing here changes that.

---

## The shortest possible mod

```sh
cp -r mod/examples/greenhouse mod/mine
# edit mod/mine/mod.yaml — give it your own id and name
node mod/tools/cli.mjs check mod/mine
```

`check` compiles your mod and prints every problem it finds, with a filename
and a reason. When it prints a `✓`, the game will accept it.

[`mod/examples/greenhouse`](examples/greenhouse) is a worked example and the
best place to start: one venue, one monster, one two-frame sprite, and a comment
on every field explaining why it is there.

## What is in a mod

```
my-mod/
  mod.yaml                     the manifest — id, name, version, author, kind
  ladder.yaml                  where your levels sit on the difficulty ladder
  levels/<id>.yaml             one venue each
  enemies/<biome>/<id>.yaml    one monster each
  sprites/<family>/<name>.yaml one pixel grid each
  preview.png                  the Workshop thumbnail (optional but do it)
```

Every path is optional except `mod.yaml` — a mod that adds only monsters is a
mod, and so is one that adds only a level. See [`FORMAT.md`](FORMAT.md) for the
field-by-field reference.

## Two kinds of mod

`kind:` in the manifest decides what your mod is allowed to do.

|             | `addon`                                | `conversion`                           |
| ----------- | -------------------------------------- | -------------------------------------- |
| What it is  | Adds to the shipped game               | Replaces the campaign                  |
| Your ids    | Must not collide with the base game's  | May deliberately collide, and win      |
| Your levels | Join the campaign at their own `index` | Are the campaign, in `campaign:` order |
| Use it for  | A new venue, a new monster, a new gun  | A total conversion — a different game  |

An **addon** is the safe default. A **conversion** is how you re-skin THE MOON
rather than adding a seventh venue: name your level `moon`, and yours is the one
that loads.

## What you may reference

Your level can name any monster, weapon, gear piece, power or sprite the base
game ships, plus everything your own mod adds.
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

## Reference

- [`FORMAT.md`](FORMAT.md) — every file and every field
- [`examples/greenhouse`](examples/greenhouse) — a complete worked mod
- [`catalog.json`](catalog.json) — every id you may reference
- [`../docs/modding.md`](../docs/modding.md) — how mods load, for the curious
- The game's own content under [`../content/`](../content) — the best reference
  there is, because it is the same format
