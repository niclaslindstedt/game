---
name: mapgen-improvement
description: "Use when improving the MAP GENERATOR — the GENERATED MAPS feature that carves a mission fresh from its v2 blueprint (`content/maps/<id>.yaml`) every run. Covers the carve → dress → verify architecture, the blueprint anatomy and how to add a new object purpose or area rule, the render → LOOK → judge → iterate loop (the renders are 9600px, so crop them), the invariants that are load-bearing and easy to undo by accident, and the verification traps that make a green check mean nothing."
---

# Improving the Map Generator

`map-improvement` improves ONE hand-authored map. This skill improves the thing
that carves **every** map, fresh, per run — so a change here lands on six
missions × three sizes × every seed at once. That leverage cuts both ways: a
regression you cannot see on the seed you happened to render is still shipping
on the other several thousand.

**Read `AGENTS.md` § GENERATED MAPS first** — it is the design statement (what a
blueprint is, why the walls are derived, why the ending is not on the map). This
skill is the *working method*.

**Before starting, read past lessons:** `node scripts/skill-lessons.mjs mapgen-improvement`.

## The three questions, and which file answers them

| Question | File |
| --- | --- |
| What is a blueprint made of? | `src/game/mapgen/types.ts` |
| Where may a thing be? (compass grammar) | `src/game/mapgen/regions.ts` |
| What kind of place is this cell, and what wall falls out of it? | `src/game/mapgen/areas.ts` |
| Where are the cells and the borders? | `src/game/mapgen/rooms.ts` |
| What gets scattered/aligned/tiled onto them? | `src/game/mapgen/place.ts` |
| Who decides — boss, hero, depth, knots, lifts? | `src/game/mapgen/generate.ts` |
| How does a run reach any of it? | `src/game/mapgen/index.ts` → `resolveLevelDef` |
| Is the authored file legal? | `scripts/asset-tools/map-schema.mjs` |
| How do ramps become numbers? | `scripts/map-data/load-yaml.mjs` + `scripts/level-data/ladder.mjs` |

`generate.ts` owns DECISIONS, `place.ts` owns CONSEQUENCES. Keep that split: a
"where should the boss be" rule in `place.ts` is how this module rots.

## The loop

Everything here is invisible until somebody looks at it. A blueprint that
compiles, validates and passes every test can still carve a map that reads as a
spreadsheet, so **the render is the unit of judgement, not the JSON.**

1. **Compile.** `node scripts/generate-maps.mjs` for a blueprint-only change;
   `npm run assets` when sprites or any other catalog moved.
2. **Render, with the real sprites and the real horde standing in it:**

   ```sh
   node scripts/level-render.mjs <id> --generated --size large --seed 3 --dormant
   ```

   `--dormant` draws the mobs each spawn point still has queued — without it you
   are looking at an empty map and calling it a level. The schematic view is
   `node scripts/map-layout.mjs <id> --generated` (con colours, zones, labels).
3. **LOOK at it — which means CROP it.** The output is up to 10400×8000, and a
   whole-map thumbnail hides every defect this skill exists to catch (tiling in a
   ground tile, a rank that seals a room, a stub of wall). Always take a 1:1 crop
   of two or three places as well as the overview:

   ```sh
   node -e "
   const sharp=require('sharp'); const f='pwa/assets-preview/level_<id>_generated.png';
   (async()=>{
     await sharp(f).resize(1800).toFile('/tmp/overview.png');            // the shape
     await sharp(f).extract({left:3000,top:2100,width:2600,height:1400}) // 1:1, judge here
        .resize(1600).toFile('/tmp/closeup.png');
   })();"
   ```
4. **Judge, change ONE lever, loop.** Re-render every time. Send the images to
   the user whenever the judgement is visual — it usually is.
5. **Verify** (below), then ship.

## Change it in the right layer

The generator's best changes have almost all been ENGINE features that
hand-authored maps can use too, not generator-only tricks — the canopy, the
fauna, the elevators, the lairs, the wall meander. When a blueprint wants
something new, ask in this order:

1. **Is it a `LevelDef` capability?** Then add it there (`defs/levels/types.ts`),
   implement it in the engine, teach `level-schema.mjs` about it, and have the
   generator merely EMIT it. The moon can then have cattle too.
2. **Is it a placement rule?** Then it is a new `MapObject` purpose or a new
   `MapArea` field, and it belongs to the generator alone.
3. **Is it a number?** Then it is blueprint YAML, and no code changes.

Adding a new **object purpose** touches exactly four places, in order:
`types.ts` (the union + its fields) → `place.ts`/`generate.ts` (what it does) →
`map-schema.mjs` (`OBJECT_TYPES`, `ALLOWED_FIELDS`, `DISTRICTABLE`,
`NEEDS_DENSITY`, and its own per-type checks) → the blueprint. Skip the schema
and a typo becomes an invisible no-op on every map.

Adding a new **`LevelDef` field** has one more step that WILL bite you: the
library's coverage map (`pwa/scripts/library/model-missions.mjs`, `LEVEL_FIELDS`).
`npm run build` fails on an authored field no page renders. Declare it — even as
"not reader-facing" — or the build breaks after everything else is green.

## The invariants — load-bearing, and easy to undo by accident

Each of these was a bug first. Re-deriving them costs a session.

- **Walls come from BORDERS, not split lines.** A split line spans a whole
  ancestor rectangle and knows nothing about which cells ended either side, so
  emitting from split lines gives stubs jutting into open floor and doorways
  jammed against corners. A border knows exactly which two cells it separates.
- **Districts grow from SEEDS.** An inherit-from-a-neighbour walk COMPOUNDS —
  whichever type it rolled first swallows the map, and a palette weighted 4:3:2
  comes out as one biome with freckles. Seeding decouples the knobs: `cluster`
  controls how BIG a district is, the weights control WHICH appear.
- **Counts are DENSITIES (per 1,000,000 world px²), never numbers.** A blueprint
  is carved at three sizes; a fixed count leaves LARGE bare. And the remainder is
  settled stochastically (`densityCount`) — a density of 0.3 per cell must mean
  "one cell in three", not "every cell" (rounding up) or "never" (rounding down).
- **Every presentational layer gets its OWN rng stream** (layout, size, walls,
  canopy, fauna each have their own salt). Draw a new feature from the main
  stream and every obstacle and spawn on every existing map shifts.
- **Ground zones are snapped to the 16px tile grid AND clamped to the map.**
  `groundTileName` asks whether a TILE'S ORIGIN is inside a zone, so a zone
  edge landing mid-tile leaves that row outside it — which showed in game as a
  stripe of bare Mars dust between a dome's wall and its floor. Rounding outward
  without clamping then claims ground off the map, which the level checker
  rightly rejects. `snapToTiles` does both.
- **The base level's `tiles.zones` are NOT inherited.** They are rectangles a
  designer drew around a building that exists at one place on one map; carried
  onto a carved grid they land on whatever is there. Only districts override the
  floor.
- **Nothing outside a run may import `mapgen/`.** The menus reach levels through
  `defs/levels/summary.ts`. Pulling the generator onto the startup path drags the
  whole level catalog into the 170 KB critical-path budget.

## What actually makes a carve look designed

Hard-won, in rough order of impact:

- **A rectangle of ground is right INDOORS and wrong OUTDOORS.** Inside, the
  rectangle IS the room and a straight edge is a wall. Outside, a ruled line
  across open country reads as a rug thrown on the floor — grass does not stop
  dead in a straight line where nothing stopped it. Open districts emit their
  floor as ragged columns (`raggedRects`); enclosed ones keep the rectangle.
- **Ground tiles must be LOW CONTRAST.** Give a 16px tile marks 25% lighter than
  its base and the eye locks onto the repeating unit at map zoom — the tile reads
  as wallpaper. Keep the spread to about ±10% lightness (compare `hardpan_0`) and
  let the scattered sprites carry the texture.
- **Alignment makes a place; density does not.** A scatter of houses at any count
  is a rash. Two rows of frontages facing each other across a lane is a town
  (`MapArea.blocks`); ranks along a cell's long axis are a factory
  (`MapObject.type: row`). The same props, scattered, read as debris.
- **Weights cannot say "there is A town".** Low odds give runs with none, high
  odds give runs with five. That is what `MapArea.once` is for.
- **A rank will seal a room unless three rules hold**: coverage (a margin of
  clear floor all round), a cross aisle (every rank broken in the middle), and
  the long axis (an aisle down the length, not a stub). Vary `chance` and
  coverage per cell too, or every bay is the same bay.
- **Feather a district edge** by scattering its own plants thinly on the
  neighbouring district. Cheap, and it hides the seam the zone rect cannot.
- **Big room, big sprites — or make the room smaller.** A large room dressed with
  small props reads as empty however many you place. Shrinking a room and giving
  it fewer, bigger pieces is almost always the better fix.
- **Check the emitted COUNT, not the vibe.** Densities are easy to get an order
  of magnitude wrong (Mars once emitted 1810 obstacles on large). Print
  `def.obstacles.reduce((n,l)=>n+l.count,0)` and compare against a hand-authored
  map before deciding it "looks about right".

## Verification — and the trap that makes a green check meaningless

`tests/content/generated_maps_test.ts` is the guard. Two things about it matter
more than the rest of the file:

**1. The nav grid and the def must come from the SAME carve.** `createGame`
resolves its own level through the flag, so a grid built from a default run and a
def resolved at another size silently checks nothing — the coordinates path
through a different map's walls and every assertion passes. Set the flag AND the
size before building the run:

```ts
setGeneratedMapsEnabled(true);
setGeneratedMapSize(size);
const def = resolveLevelDef(id, seed, size);
const grid = buildNavGrid(createGame(seed, id, "medium"));
```

**2. Reachability is asked THROUGH the lifts, never around them.** A mission
whose ending is an annex has a boss no walk can reach — that is the feature, not
a bug. The oracle grows its origin set: walk to a pad, ride, walk on from where
the car set you down; every lift must end up reachable from something. Asserting
that the boss is walkable-to asserts the opposite of what the map is for.

Then, in order — each has caught something the previous one did not:

```sh
npx vitest run tests/content/generated_maps_test.ts   # fast; run this on every edit
make test                                             # the level/enemy/item round-trips
make lint && make fmt-check
npm run build                                         # the LIBRARY coverage gate
```

## Content-pipeline gotchas

- A `chest` object carries **no sprite** — the engine draws every reward
  container from its own art, so the schema skips the sprite check for it.
- A sized-rock object validates `<base>_<w>x<h>` per `rockSizes` entry, never the
  base name.
- An animated `critter` blits `<sprite>_0`/`<sprite>_1`; the base name alone is
  not in the atlas and draws nothing.
- `loot` on a prop makes it BREAKABLE by definition — the spill odds mean nothing
  on something a weapon cannot smash, and the level checker rejects the
  combination. It belongs only on `obstacle` and `crate`.
- A blueprint names **ramps**, never per-difficulty numbers. If a new set piece
  needs numbers, expand them in `scripts/map-data/load-yaml.mjs` against
  `content/ladder.yaml` — and note that `expandSetPiece` DROPS any field it does
  not copy, which is a silent way to lose a new one.

## Shipping

- Blueprints (`content/maps/*.yaml`) and sprites (`content/sprites/**`) are
  committed; `src/generated/map-blueprints.ts` and `pwa/src/game/assets/` are
  gitignored build output — never commit them.
- Render every mission you touched at more than one size and seed and put the
  images in front of the user before shipping. A generator change that looked
  fine on `--size large --seed 3` has been wrong on medium more than once.
- Update `AGENTS.md` § GENERATED MAPS when you add a rule a future session would
  otherwise have to re-derive, and add a changeset fragment.

## Skill self-improvement

Record a new heuristic (a tell in a render, a lever that reliably fixes a look
problem, a schema trap) as a lesson fragment under `.lessons/` (see
[`../LESSONS.md`](../LESSONS.md)); read past ones with
`node scripts/skill-lessons.mjs mapgen-improvement` before starting.
