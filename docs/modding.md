# Modding — how it works

The authoring guide is [`mod/README.md`](../mod/README.md); the field reference
is [`mod/FORMAT.md`](../mod/FORMAT.md). This page is the other half: what
happens between a player subscribing to a Workshop item and a mod's monster
appearing on screen, and why it is built the way it is.

**Steam builds only.** The browser and mobile builds have no Workshop and no
filesystem to read a mod from.

## The shape

```
Workshop item (YAML, as authored)
        │  Steam downloads it into its own folder
        ▼
electron/src/workshop.ts     ← the only module that knows Steam exists
        │  a folder path
        ▼
mod/tools/build.mjs          ← the compiler: validates, rasterizes, emits JSON
        │  one ModBundle, all data
        ▼
pwa/src/game/mods.ts         ← registerDefs() + sprite merge
        │
        ▼
the run
```

Four decisions carry it.

### 1. A mod is compiled, never interpreted

The game never parses a mod's YAML. The desktop shell's main process compiles
each mod once, at load, into a `ModBundle` of plain JSON — and only that reaches
the page. The renderer keeps no filesystem, no YAML parser, and no way to run
anything a mod shipped. There is no scripting hook in the format, and adding one
would turn "subscribe to a mod" into "run a stranger's code".

### 2. One compiler, one schema

A mod's level is a `content/levels/<id>.yaml` file; its enemy is a
`content/enemies/<biome>/<id>.yaml` file; its sprite is a
`content/sprites/<family>/<name>.yaml` file. Same keys, same loaders, same
validators — which is why `scripts/*-data/load-yaml.mjs` take a directory rather
than owning a constant. `node mod/tools/cli.mjs check` runs the identical code
the game runs at load, so "it works in my mod" and "it works in the game" mean
the same thing. A second, friendlier mod schema would drift from the real one
inside a release.

### 3. The catalogs go in through the seam that already existed

`registerDefs` (`src/game/defs/registry.ts`) replaces the ACTIVE content
registry every `levelDef` / `enemyDef` accessor reads. It was built so the
engine test suites could run against synthetic fixtures; a mod is the same move
with different data, which is why applying one needed no engine change at all.
Sprites merge into the loaded `Record<name, ImageBitmap>` the renderer reads
through `spriteByName`, so a mod's frames are indistinguishable from the atlas's.

### 4. A mod applies to a RUN, not to an install

The catalogs are global mutable state. A mod is applied when a modded run
starts, and `restoreBaseDefs()` puts the shipped game back when it ends — so the
menus, the roster and the next run are always the base game. A hero played under
a mod carries a `ModStamp` (id, name, version) rather than any of the mod's
content, which is what keeps a roster readable on a device that has since
unsubscribed from everything.

## The reference catalog

`mod/catalog.json` is every id a mod may name — enemies, weapons, gear, powers,
uniques, sprites, the shipped venues. It exists because the compiler runs in the
shipped app's main process, which has no TypeScript and no `src/generated/` to
import the real catalogs from, so the id sets are snapshotted into JSON that
travels inside the build.

It is **committed and drift-tested** (`tests/content/mod_catalog_test.ts`), the
same pattern the Game Center and Steam achievement manifests use: a content
change that adds or retires an id regenerates it in the same commit
(`make mod-catalog`), and the diff is the exact list of what moved. Deliberately
absent from it: any number. A mod may NAME the game's content; it may not read
the game's tuning out of a file that would then have to stay compatible for ever.

## Publishing

`electron/src/workshop.ts` wraps ISteamUGC. The first publish calls `createItem`
and remembers the returned id, so publishing again updates the same item. What
is uploaded is the **authored folder**, not a compiled bundle — each subscriber's
game compiles it locally, and a published mod stays readable and forkable the
way the game's own content is.

Steam hides an item until its author has accepted the Workshop legal agreement
once per account; `needsToAcceptAgreement` on the publish result is that, and it
is surfaced rather than swallowed because the item is otherwise invisible with no
indication why.

## The MODS screen

**MODS is a row on the MAIN menu**, not a page under SETTINGS, and that is a
statement about what mods are: a total conversion is a different game living in
the same binary, and burying it three rows deep would say it was a
configuration detail. The row appears only where `modsBridgeAvailable()` is true
— the Steam shell — so no other build shows a door it cannot open.

Two details in `menus-mods.ts` are load-bearing:

- **A mod that did not compile still appears**, greyed, with its first error as
  the row's help line. A player who subscribed to something and then finds an
  empty list has no way at all to learn why.
- **The builder imports `mod-state.ts`, never `mods.ts`.** The MODS screen is on
  the app's startup path, and `mods.ts` reaches `@game/core` for `registerDefs`
  and the shipped catalogs — one import away from the level catalog, the loot
  roller and the whole step pipeline. So the mod system's TYPES and the
  "which mod is on" state live in an import-free leaf (the same move
  `src/game/flags.ts` makes for the engine's runtime toggles), and the apply
  itself is a **dynamic** import inside the row's own handler. The 170 KB
  gzipped critical-path budget is what notices; it is at 161.3 KB.

## What is not here yet

- **Items.** Weapons, gear and uniques compile through a longer pipeline
  (`scripts/generate-items.mjs` — grades, tier ladders, the rarity economy) than
  levels and enemies do. A mod can pay out any of the game's items today; it
  cannot add its own.
- **The shell's IPC route.** `mod/tools/build.mjs` (the compiler),
  `electron/src/workshop.ts` (Steam), `pwa/src/app/mods-bridge.ts` (the
  protocol) and `pwa/src/game/mods.ts` (the apply) are all in. What joins them
  is `electron/src/mods.ts` — the main-process handler that walks the
  subscriptions, runs the compiler over each folder, and answers the bridge —
  plus its route in `main.ts` and the packaging that puts `mod/tools/` and
  `mod/catalog.json` inside the built app. That is the next increment; until it
  lands the MODS row reports no mods installed, because the bridge times out
  rather than answering.
