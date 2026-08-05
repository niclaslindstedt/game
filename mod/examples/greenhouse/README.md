<!-- SPDX-License-Identifier: CC0-1.0 -->

# THE GREENHOUSE

A worked example mod, and the folder `node mod/tools/cli.mjs new` copies. It is
deliberately the smallest addon that is still a real mod: one venue with a floor
plan of its own, two monsters, a weapon and the relic version of it, a power, two
talents, a scene, a score and the art for all of it.

**It is also this README's job to be an example.** Every mod ships one — the
validator refuses a folder without it — because the manifest's `description` is
one sentence on a menu row, and somebody deciding whether to install a stranger's
conversion needs more than a sentence. Write yours for that person.

## What's in it

- **THE GREENHOUSE**, a GOODCO orbital seed vault still running on a timer
  nobody reset. It joins the campaign after the shipped venues rather than
  replacing anything — this is an `addon`.
- **THE CREEPER**, a vine that walks, and **THE GARDENER**, the vault's last
  horticulturist. She is spareable: beat her and the game offers you the choice,
  and letting her live puts her at your shoulder for the rest of the run.
- **THE PRUNING SAW** and **FIRST CUTTING**, the plain base and the named relic
  cut from it.
- **SPORE BLOOM**, a power that lays burning ground behind you and holds a
  scorching ring around you at the same time — a composition the shipped game
  does not have.
- **DEEP ROOTS** and its sibling talent, which appear in the shipped melee and
  magic pickers beside the game's own.
- An arrival scene, the hero's own thoughts on the place, the seed log that
  spells its story out, a score and a sound.

The file-by-file version of this list is `contents:` in
[`mod.yaml`](mod.yaml) — the game shows it on the MODS screen when a player taps
the mod.

## Playing it

```sh
node mod/tools/cli.mjs validate mod/examples/greenhouse   # the audit
node mod/tools/cli.mjs package mod/examples/greenhouse    # the zip to hand over
node mod/tools/cli.mjs where                              # the folders the game reads
```

Drop the folder or the zip into either folder `where` prints, launch the game,
and switch it on under **MODS** on the main menu.

## Terms

Everything in this folder is **CC0** — see [`../../LICENSE.md`](../../LICENSE.md).
Copy it, rename it, replace it piece by piece. Your own mod is yours.
