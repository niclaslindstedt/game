# Licence for the Ada's Trail Mod SDK

Copyright 2026 Niclas Lindstedt (<https://github.com/niclaslindstedt/game>)

**These terms replace the repository's [`LICENSE`](../LICENSE) for the files in
this directory.** Everything else in the repository remains under PolyForm
Noncommercial 1.0.0 with the Ada's Trail Feature Terms in that file.

This directory holds two different things, and they are licensed differently on
purpose: the parts you **copy to write a mod** are as free as they can be, and
the **toolchain** is licensed only for making mods for this game.

---

## 1. Definitions

- **The Game** — _Ada's Trail_, the software in this repository, and any
  version of it published by the copyright holder.
- **The SDK** — [`tools/`](tools) and [`catalog.json`](catalog.json).
- **The Samples** — [`examples/`](examples), [`README.md`](README.md) and
  [`FORMAT.md`](FORMAT.md).
- **Mod Content** — levels, enemies, items, sprites, manifests and other data
  authored to be loaded by the Game, including anything derived from the
  Samples.
- **Acquired Steam License** — a valid, current license for the Game acquired
  from the copyright holder through Steam. A downloaded binary, source build,
  or copy of this SDK is not one.
- **Mod Creator** — a person actively authoring, validating, or testing Mod
  Content they wrote for the Game.

## 2. The Samples — public domain

The Samples are dedicated to the public domain under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
(`SPDX-License-Identifier: CC0-1.0`).

Copy them, change them, publish what you make, sell it if you like, with or
without credit. They exist to be copied, and you should never have to think
about the licence to start a mod.

## 3. Your Mod Content is yours

Nothing here claims any rights in Mod Content you author. You choose its
licence. Compiling your mod with the SDK does not make it a derivative work of
the SDK, and publishing it to the Steam Workshop is between you, Valve and your
players.

The Game's own content — its art, text, story, monsters, items and levels — is
**not** covered by this licence and remains under the repository's `LICENSE`.
Naming the Game's content from your mod (the ids in `catalog.json`) is expected
and fine; redistributing that content is not.

## 4. The SDK — licensed for making mods for this Game

You are granted a worldwide, royalty-free, non-exclusive licence to use, copy,
modify and distribute the SDK, and works derived from it, **solely for the
purpose of authoring, validating, testing, or distributing Mod Content for the
Game.** Running Mod Content is licensed only within section 5 below.

That purpose is the whole of the grant, and it is meant to be read generously
within itself: a mod manager, an editor, a validator, a CI check, a fork of the
compiler that reports errors better — all of that is making mods for this Game,
and all of it is licensed.

## 5. Playing and testing mods

This SDK licence does **not** by itself grant a player the right to enable,
load, or play mods or multiplayer. Regular player use of either feature
requires an Acquired Steam License under the repository's [`LICENSE`](../LICENSE).
The desktop Steam edition for Windows, macOS, and Linux has not been published
yet, so that player licence is not currently available.

A Mod Creator may run an official desktop binary downloaded from the copyright
holder with the `--modifications` command-line parameter, without an Acquired
Steam License, solely to create, validate, and test Mod Content they author.
The exception permits only the single-player use reasonably necessary to
inspect that work. It does not permit ordinary play, playing somebody else's
mods, or multiplayer. Regular players may not use `--modifications` as a way
around the Steam licence requirement.

## 6. What is not licensed

No licence is granted to use the SDK, or any work derived from it, **in or for
any other game, engine, or interactive product** — whether or not that product
is commercial, free, open source, or a fork of this repository.

If you want the SDK for something else, ask. The answer may well be yes.

## 7. Notices

You must keep this licence file, and the copyright notice above, with any copy
or substantial portion of the SDK that you distribute.

## 8. No warranty and no liability

**The SDK is provided as is, without any warranty.** To the maximum extent
permitted by law, the copyright holder will not be liable for any damages
arising from the SDK or its use.

---

### Why it is split this way

A licence strict enough to stop someone lifting this toolchain into their own
game would, applied to the whole directory, also forbid the one thing this
directory exists for — a modder copying `examples/greenhouse` is making a
derivative work. So the samples are given away outright and the restriction
sits only on the machinery, where it costs a mod author nothing.
