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

Five decisions carry it.

### 1. A mod is compiled, never interpreted

The game never parses a mod's YAML. The desktop shell's main process compiles
each mod once, at load, into a `ModBundle` of plain JSON — and only that reaches
the page. The renderer keeps no filesystem, no YAML parser, and no way to run
anything a mod shipped. There is no scripting hook in the format, and adding one
would turn "subscribe to a mod" into "run a stranger's code".

### 2. One compiler, one schema

A mod's level is a `content/levels/<id>.yaml` file; its enemy is a
`content/enemies/<biome>/<id>.yaml` file; its sprite is a
`content/sprites/<family>/<name>.yaml` file; its cutscene is a
`content/cutscenes/<id>.yaml` file. Same keys, same loaders, same validators —
which is why `scripts/*-data/load-yaml.mjs` take a directory rather than owning a
constant. `node mod/tools/cli.mjs check` runs the identical code
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

The AUDIO has two seams of its own, both of which existed before mods did
because the sounds and the scores are compiled content (`content/sounds/`,
`content/music/`). `setSoundCatalog` swaps the bank the sfx bus dispatches
through, so a mod's sound plays by name from a weapon's `sfx:` or answers an
event shape and replaces a shipped one. `setModTracks` (`game/music/index.ts`)
installs a mod's scores beside the shipped ones — as DATA rather than as a
module, since the shell compiled them, which is the one place a mod's content
does not travel the same road as the game's: the shipped scores are each behind
their own dynamic `import()` and stay there.

### 3a. A mod's venue may be CARVED, not only drawn

`maps/<id>.yaml` is the recipe half of a venue (see **GENERATED MAPS** in
`AGENTS.md`): with the flag on, the mission's geometry is carved fresh from the
run's own seed instead of loading its hand-drawn layout, so the boss has to be
found. A mod ships one beside its level and gets the same treatment — the loader
(`scripts/map-data/load-yaml.mjs`) takes a directory like every other, the schema
is `validateMap`, and the ramp names expand against the shipped `ladder.yaml`
using the mod's own rows for its own venue.

Two details are the whole design here, and both come from rules that already
existed:

- **The registry is a LEAF.** `src/game/mapgen/blueprints.ts` holds the active
  catalog and nothing else, so `registerDefs({ blueprints })` swaps a mod's
  recipes in without the def registry importing `generate.ts` — the carve, the
  dressing passes and the whole area rule engine. Same move `flags.ts` makes for
  the engine's runtime toggles.
- **A blueprint carves the mission it is NAMED AFTER**, so `maps/moon.yaml` is
  not a new map, it is the shipped moon re-cut. An addon may therefore only name
  one of its own levels; a conversion may name any, which is how it re-carves a
  venue it has already re-skinned. The compiler says exactly that, with the fix
  in the message.

The one thing that could not travel is the compass-region PARSER. The compiler
runs in the shipped app's main process, which has no TypeScript and cannot call
`mapgen/regions.ts` — and a second grammar in the SDK would drift within a
release. So `mod/catalog.json` carries the list of names the engine's own parser
accepts, enumerated from it by `mod/tools/catalog.mjs` and drift-tested like
every other id set in that file. One grammar, a snapshot of what it says yes to.

### 3a½. A conversion opens under its own name

`ModBundle.brand` — a title and a tagline, declared in `mod.yaml` — is what the
title screen draws while an enabled conversion has one. It is the smallest
possible surface on purpose: **the screen, never the install.** The storage
prefix, the precache id, the character archive's game name and every discovery
surface (`<title>`, the manifest, the OG card) stay `pwa/src/identity.ts`'s,
because a mod that moved them would orphan the player's roster and rewrite a
site it does not own.

Two details are load-bearing:

- **It is REMEMBERED, not derived.** The installed-mod list is compiled lazily,
  the first time MODS is opened, so at launch there is nothing to ask — and a
  conversion that opened under its own name yesterday and under this game's
  today reads as a bug. So `settings.modBrand` holds it, the MODS screen
  corrects it the moment the real list arrives (which is what forgets a mod the
  player switched off or unsubscribed from), and the title screen pays nothing
  at launch.
- **The last enabled conversion wins**, the same rule `mod-order.ts` resolves
  every other clash by, so the name on the front page can never contradict the
  content behind it.

The one check worth knowing about is the FONT. `PixelText` falls back to `?` for
a glyph the atlas has no cell for, so a brand with an accent in it renders as
`H?LLSTR?M` at triple size on the author's own front page. `mod/catalog.json`
therefore carries the font's glyph set — the one entry in it that is not an id —
and the compiler names the offending character.

### 3a¾. The kits are content now too

`content/sets.yaml` is the last catalog to have been code. A SET is what makes a
boss worth farming past the first drop, and a mod could already ship
`rarity: set` pieces — they just belonged to nothing. The lift is the same one
the story and the companions had: a loader that takes a DIRECTORY
(`scripts/set-data/`), the schema both the shipped build and a mod validate
through (`asset-tools/set-schema.mjs`), a generator into `src/generated/sets.ts`,
and a snapshot frozen from the hand-written TypeScript the moment before, so the
move is provably lossless.

Two decisions worth keeping:

- **The affix vocabulary is SHARED** (`asset-tools/affix.mjs`). A set's tiered
  bonuses are the same `Affix[]` a unique's `bonuses:` are, and a second copy of
  the kind list would be a second answer to "is `armorPen` a real bonus", one of
  which is wrong within a release.
- **A mod's kit may only claim the MOD's own pieces.** A piece and its kit each
  name the other, and a mod cannot edit a shipped piece's `setId` — so claiming
  one would compile into exactly the mismatch the schema exists to catch. A
  conversion re-homing a shipped kit ships the pieces too, which puts them in
  the list anyway.

### 3a⅞. The ladder speaks in the mod's voice

`difficulties.yaml` renames the five rungs and rewrites their taglines, and does
nothing else. The split is the interesting part, and it is the same one
`item_rarity.yaml` sits on:

- **The VOICE is the mod's.** "JESUS CHRIST!" / "THEY NEVER STOP COMING" is this
  game's register, and a conversion set in a hospital or a courtroom reads as
  somebody else's game the moment its ladder speaks in it. There is nothing to
  balance in a label.
- **The NUMBERS are the game's.** A rung's mob multipliers, xp rates, mercy
  curves, stamina ladders and starting weapon are one economy with
  `content/ladder.yaml`, which prices every venue — the shipped ones included —
  against them.

So `DefOverrides.difficulties` takes a FULL def, but `applyMods` folds a mod's
two strings onto the shipped rung rather than replacing it, and the schema
refuses any other field with that reason in the message. A mod also cannot ADD a
rung: the ladder's length is baked into the unlock chain, the per-map ladder
cells and the four-tuple every level compiles its ramps into.

It lands before the picker is drawn — `applyMods` runs and then the flow goes to
the difficulty ladder — so the rows a player reads are already the mod's, with
no extra plumbing.

### 3a⁹⁄₁₀. A mod's weapon flares its own element

`UniqueDef.fx` is the last of the four "a mod's content can only look like
whichever shipped thing it resembles" gaps. The signature slash and muzzle flash
were a table in `weapon-fx.ts` keyed by shipped unique id, so a mod's legendary
had no way in at all; the mapping now lives on the weapon (`fx:` in its own
YAML) and the app keeps only the kits and the drawing. Exactly the move
`AbilityDef.look` made for the powers, and the shipped roster was migrated onto
it wholesale — verified by resolving all 43 styled weapons both ways and
comparing (the diff found two dead rows on the way: a slash style each for
`skybreaker` and `stormlash`, a gun and a wand, which could never have played).

Three decisions:

- **The kits are a LEAF** (`weapon-elements.ts`). `generate-items.mjs` reads the
  element names from it to check every authored `fx:`, and it runs FIRST in the
  content chain — before the catalog `weapon-fx.ts` reaches through
  `@game/core`. A leaf breaks that cycle; the names beside the drawing re-make
  it.
- **The vocabulary is SYMMETRIC.** Every element has a slash kit and a shot kit,
  so `element: blood` means something on a rifle as well as on a blade. The four
  melee kits and one shot kit that were missing were derived from their
  counterparts' palettes rather than left out.
- **The resolved style is MEMOIZED**, keyed by unique id and rebuilt when the
  def's identity changes — which is exactly when a mod is applied or backed out,
  so it needs no invalidation hook. `shotStyleFor` is asked per projectile per
  frame, and building a style object there would allocate through the whole
  flight of every round on screen.

### 3b. The story travels the same road — and nobody governs a mod's script

Cutscenes, the hero's inner monologues and story items are catalogs
`registerDefs` already accepted; what was missing was the AUTHORING form. All
three are content now (`content/cutscenes/<id>.yaml`, `content/thoughts.yaml`,
`content/story-items.yaml`, compiled by `scripts/generate-story.mjs`), so a mod
ships them by putting the same files in its own folder. Without them a total
conversion had no opening scene, no monologues and no lore pages — new monsters
walking somebody else's plot, which is a re-skin rather than a different game.

Three things are worth knowing about the format:

- **`variants:` is how one scene is five.** The shipped prelude is the same
  living room on every difficulty except the weapon on the wall, so it carries
  `label:` handles on the parts that differ and a `variants:` block patching them
  per rung. The loader expands those into `prelude_<difficulty>` scenes — exactly
  what `cutsceneVariant` resolves at run creation — so a mod's prelude can show
  the run's actual starting weapon too, from one file.
- **The cap-farm mutter is a LIST, not a catalog.** `capRotation` replaces the
  shipped rotation wholesale rather than merging into it, and `setThoughtDefs`
  filters it to ids the active catalog actually holds: a conversion that replaces
  the thoughts without authoring a rotation gets silence rather than a throw the
  first time a player out-levels a map.
- **A mod's story answers to the schema and to nothing else.** The three-tier
  chain that makes `docs/manuscript.md` the authority on every line the campaign
  speaks stops at the mod folder's edge (see AGENTS.md, and the note at the top of
  the manuscript). A mod's scenes are never transcribed there and never corrected
  to match it. The distinction is origin, not format.

### 3c. The party is the story's other half

A companion is the same lift again: `registerDefs` already took a `companions`
catalog, and what was missing was the authoring form. The roster is content now
(`content/companions.yaml`, compiled by `scripts/generate-companions.mjs`), so a
mod ships one by putting that file at its own root.

It belongs beside the story rather than beside the stat catalogs, because of what
it gates. **Sparing a beaten elite is one of the few decisions the game asks the
player to make**, and the payoff is a named figure who thanks you, follows you,
fights with the weapon it just used on you, and talks over its own kills. Until
the roster was loadable the only figures a mod could hand over were the shipped
four, so a conversion's monsters, venues, script and loot could all be its own
while its allies stayed Tesla and a leprechaun — the one place the re-skin showed
through at the exact moment the player had earned something.

Two things are worth knowing about the format:

- **`spareable` resolves against BASE ∪ MOD, both ways.** A mod's elite may
  recruit a mod's companion (the point) or a shipped one (an addon that hands the
  player Tesla off a monster of its own, authoring no roster at all). An addon may
  not shadow a shipped companion id; a conversion may, which is how it makes the
  spare verdict hand over its own figure instead.
- **The schema refuses a power that grows a kit the companion has not got.** A
  `power:` block is pure growth applied on top of a base — and
  `novaRadiusPerRank` reads a `nova:` block that may not be there, so on a
  companion without one every rank-up adds precisely nothing, forever, with no
  error at play time to explain it. That is exactly the class of failure a
  compiler exists to catch, so `companion-schema.mjs` names the missing block and
  refuses the mod. The other four growth fields are grants in their own right
  (`chainPerRank` teaches an un-chained weapon to arc) and are legal alone.

### 4. Clashes between mods resolve by an order the player owns

The compiler catches a clash with the BASE GAME (an addon may not shadow a
shipped id; a conversion may, and that is what it is for). It cannot catch a
clash between two MODS: each is compiled alone, and its author never saw the
other. So that resolution happens at load, by one rule covering every kind of
content — **later in the load order wins**, for sprites, levels and enemies
alike.

`mod-order.ts` is the whole of it, and it is a leaf of pure functions over the
persisted list. Three decisions in it are load-bearing:

- **The persisted list is the source of truth for order, not the installed
  set.** A list rebuilt from whatever is installed would reshuffle itself every
  time the player subscribed to anything, silently changing which mod wins. So
  entries persist for mods that are not installed right now, and a resubscribe
  restores the rank the player had chosen.
- **A newly-seen mod is APPENDED**, landing last and therefore winning. A mod
  the player just subscribed to doing nothing visible because an older mod
  outranks it is the worst possible first impression.
- **Moving a row steps OVER the entries that are not installed.** Otherwise a
  list with three stale entries between two visible mods takes four presses to
  reorder, with nothing on screen changing for the first three.

`applyMods` merges the enabled stack in that order and RECORDS every override
(`ModClash`) rather than performing it silently, so the MODS screen can tell a
player which of their mods is currently losing — and that moving it down fixes
it. It also re-merges from the SHIPPED catalogs every time rather than from
whatever the last apply left behind: merging onto the live registry would make
the result depend on the order runs were started in, and switching a mod off
would not actually remove its content until a relaunch.

### 5. A mod applies to a RUN, not to an install

The catalogs are global mutable state. A mod is applied when a modded run
starts, and `restoreBaseDefs()` puts the shipped game back when it ends — so the
menus, the roster and the next run are always the base game. A hero played under
a mod carries a `ModStamp` (id, name, version) rather than any of the mod's
content, which is what keeps a roster readable on a device that has since
unsubscribed from everything.

## The reference catalog

`mod/catalog.json` is every id a mod may name — enemies, weapons, gear, powers,
uniques, sprites, sounds, music tracks, the shipped venues, the compass regions a
map blueprint points its boss with, and the engine's event names (what a sound's
`on:` may answer). It exists because the compiler runs in the
shipped app's main process, which has no TypeScript and no `src/generated/` to
import the real catalogs from, so the id sets are snapshotted into JSON that
travels inside the build.

It is **committed and drift-tested** (`tests/content/mod_catalog_test.ts`), the
same pattern the Game Center and Steam achievement manifests use: a content
change that adds or retires an id regenerates it in the same commit
(`make mod-catalog`), and the diff is the exact list of what moved. Deliberately
absent from it: any number. A mod may NAME the game's content; it may not read
the game's tuning out of a file that would then have to stay compatible for ever.

## The measuring instruments — `--mod`, and the one seam behind it

The compiler answers whether a mod is VALID. Nothing answered whether it is any
good, and this repo's own content is not authored by reading YAML: it is
rendered, simulated, priced and played back. So every analyzer, renderer and
simulator under `scripts/` takes **`--mod <dir>`** (repeatable, in the player's
load order), and one module — `scripts/mod-support.mjs` — is the whole of what
that flag does. `mod/AGENTS.md` step 5 is the author-facing half: which command
answers which question, in the order a mod gets built.

Three rules keep it honest, and they are the same three the shipped app follows:

1. **One compiler.** `--mod` runs `buildMod`, exactly as `cli.mjs check` and the
   desktop shell do. There is no friendlier tooling loader that could accept a
   mod the game would refuse.
2. **One seam in.** The result is registered through `registerDefs`, the way
   `pwa/src/game/mods.ts` registers it — so a tool measures a mod's level
   through the same `createGame` / `levelDef` / `enemyDef` path a run does, and
   nothing in the engine learns that a mod exists.
3. **Plus an in-place merge of the shipped catalog records, which is
   TOOLING-ONLY.** Half these scripts REPORT on a catalog rather than play it
   (`Object.values(WEAPON_DEFS)`, `ENEMY_DEFS[id].role`, iterating
   `LEVEL_ORDER`), and the registry is a separate thing from those exported
   records. Assigning into them is what makes `--mod` one line per script
   instead of a rewrite of every script's data access. It is safe here and only
   here: a script process loads one stack of mods, once, before it does any
   work, and then exits. The app must never do it — it re-merges from the
   SHIPPED catalogs on every apply, which is what lets switching a mod off
   actually remove its content.

Two consequences worth knowing. A mod's **sprites** are merged into the
node-side sprite maps the previews render from (and its monsters' wound frames
and its armor's worn overlays are derived there, exactly as the shipped ones
are) — but never into the built atlas, which is why `make assets` is not part of
a mod's loop. And the **playtest harness** reaches the same place from outside
the page: `pwa/scripts/playtest.mjs --mod` compiles the mod in node and hands
the bundles to the app's own `applyMods` through a `window.__mods` hook that
exists only under `__DEV_TOOLS__` **and** `?debug` — the store build drops it at
compile time, and no ordinary page carries it. That hook is why `?level=` is
answered by `hasLevel()` (the ACTIVE catalog) rather than by probing the shipped
`LEVELS` record, which a mod's venue never joins.

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
- **Reordering is its own screen** (`modorder`). The list's arrows already flip
  a mod's switch, and one pair of keys cannot mean both "on/off" and
  "earlier/later" without the player having to remember which screen they are
  on. The `reorder` capability on `MenuEntry` is what the arrows drive there;
  confirm also moves a row, so the screen works on a pad and a touch screen,
  which have no arrow keys.
- **The builder imports `mod-state.ts`, never `mods.ts`.** The MODS screen is on
  the app's startup path, and `mods.ts` reaches `@game/core` for `registerDefs`
  and the shipped catalogs — one import away from the level catalog, the loot
  roller and the whole step pipeline. So the mod system's TYPES and the
  "which mod is on" state live in an import-free leaf (the same move
  `src/game/flags.ts` makes for the engine's runtime toggles), and the apply
  itself is a **dynamic** import inside the row's own handler. The 170 KB
  gzipped critical-path budget is what notices; it is at 161.3 KB.

## The shell handler, and what ships with it

`electron/src/mods.ts` is where the three halves meet: it asks `workshop.ts`
what the player is subscribed to, walks `<userData>/mods/` for the mod they are
WRITING, runs the compiler over each folder, and answers the bridge. It is the
peer of `cloud-save.ts` with one difference that shapes the file — it does real
work, because **compiling is the security boundary**. A mod's YAML is read,
parsed and validated here so that only checked JSON crosses to the renderer.

Two sources, one list. The local folder exists because the alternative is
authoring by publishing-to-test, which is a miserable loop and litters the
Workshop with drafts; it is also the only source PUBLISH is offered for, since
a subscription is somebody else's to update.

**Shipping the compiler is its own problem.** It lives outside `electron/` — in
`mod/tools/`, importing the game's own loaders out of `scripts/` — because
there must be exactly one compiler. So `electron-builder.config.cjs` carries it
in through `extraResources`, and three details there are load-bearing:

- The packaged tree **mirrors the repo's layout** under `resources/modtools/`.
  Every module in there finds its neighbours by relative path
  (`../../scripts/…`, `new URL("../../content", import.meta.url)`), so a
  flattened copy resolves to nothing. `resources.ts` is the one place that knows
  which root applies, off `app.isPackaged`.
- It is **outside the asar**, because it is loaded by dynamic `import()`, which
  resolves real files on disk rather than asar entries.
- **`yaml` rides along** into `modtools/node_modules/`, for the same reason: a
  package inside the asar is not resolvable from a module outside it.
- **Every `scripts/` directory the compiler imports has to be listed.** One that
  is not is a mod that compiles in the repo and fails on a player's machine with
  a resolve error — `scripts/powerup-data` was exactly that until the story lift
  added a test that walks the toolchain's own import graph against the packager's
  copy list (`tests/content/mod_toolchain_deps_test.ts`).

The one value that crosses from the page INWARD in this whole feature is the
`folder` a PUBLISH names, so it is the one that is checked — resolved and
compared as a path prefix against the local mods directory, which is what stops
both `..` traversal and a sibling like `mods-elsewhere`. `electron/tests/`
covers that, and compiles the worked example end to end through the real
dynamic import.

## What is not here yet

- **The passive TALENT trees** (`src/game/defs/talents/`) are still TypeScript, so
  a conversion's hero grows the shipped Warlord / Windrunner / Archon trees.
- **`grades:`** ladders and the loot economy (`content/item_quality.yaml`,
  `content/item_rarity.yaml`) are deliberately the game's rather than a mod's — a
  mod that moved the tier ladder would be rebalancing the campaign instead of
  adding to it.
