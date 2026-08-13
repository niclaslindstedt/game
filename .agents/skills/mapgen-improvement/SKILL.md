---
name: mapgen-improvement
description: "Use when improving the MAP GENERATOR — the GENERATED MAPS feature that builds a mission fresh from its v2 blueprint (`content/maps/<id>.yaml`) every run, by one of TWO generators: the STATIC PARTS assembler (hand-drawn rooms sewn at door sockets, one-mob spawn posts — the shipping default where a blueprint authors a `parts:` deck) and the legacy BSP carve (kept behind the developer LEGACY MAP GENERATOR switch). Covers the assemble/carve → dress → verify architecture, the blueprint and parts-deck anatomy, how to add a new object purpose or area rule, the render → LOOK → judge → iterate loop (the renders are thousands of pixels on a side, so crop them), the invariants that are load-bearing and easy to undo by accident, and the verification traps that make a green check mean nothing."
---

# Improving the Map Generator

`map-improvement` improves ONE hand-authored map. This skill improves the thing
that builds **every** map, fresh, per run — so a change here lands on every
blueprint in `content/maps/` × every seed at once. That leverage
cuts both ways: a
regression you cannot see on the seed you happened to render is still shipping
on the other several thousand.

**THERE ARE TWO GENERATORS BEHIND `resolveLevelDef`, and which one a venue uses
is the blueprint's own choice.** A blueprint that authors a **STATIC PARTS
deck** (`parts:` — see `MapPart` in `types.ts` and `engine/game/mapgen/parts.ts`)
is SEWN: hand-drawn rectangular rooms joined at their authored door sockets,
mirrored to fit (`flip`), the boss's own room dealt into a rolled deep corner —
and its horde is ONE-MOB SPAWN POSTS (`LevelDef.mobSpawns`,
`engine/game/mob-spawns.ts`: dormant individuals, respawning on a
difficulty-scaled clock once killed or dragged off their leash) instead of knot
spawn points. A blueprint without a deck keeps the legacy BSP CARVE, which also
stays reachable on any venue behind the developer LEGACY MAP GENERATOR flag
(`engine/game/flags.ts`) while the two are judged side by side. **Both emit the
same `ChamberGrid`**, so everything downstream — walls, districts, scatter,
depth, caches, vaults, the trader, quest reachability — is shared; a fix in the
dressing lands on both, a fix in `parts.ts` lands only on the sewn venues.

**This skill IS the design statement** — what a blueprint is, why the walls are
derived, why the ending is not on the map — as well as the *working method*.
`AGENTS.md` carries only the two rules a session trips over before loading it:
a run reads its own map through `runLevelDef(state)`, and nothing outside a run
may import `mapgen/`.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs mapgen-improvement --list`,
then the ones this task touches (`--scope=…`, `--concepts=…`). Reading them here and
reflecting on them before the commit is the **`skill-reflection`** skill's job — load
it at both ends of the session.

## The three questions, and which file answers them

| Question | File |
| --- | --- |
| What is a blueprint made of? | `engine/game/mapgen/types.ts` |
| Where may a thing be? (compass grammar) | `engine/game/mapgen/regions.ts` |
| What kind of place is this cell, and what wall falls out of it? | `engine/game/mapgen/areas.ts` |
| Where are the cells and the borders? | `engine/game/mapgen/rooms.ts` |
| What gets scattered/aligned/tiled onto them? | `engine/game/mapgen/place.ts` |
| Who decides — boss, hero, depth, knots, lifts? | `engine/game/mapgen/generate.ts` |
| How is a parts deck SEWN — the deal, the flips, the boss attach, the loops, the perimeter? | `engine/game/mapgen/parts.ts` |
| How does a one-mob post live — first watch, vacate, respawn clock, no-pop-in hold? | `engine/game/mob-spawns.ts` + config `MOB_SPAWNS` (`config/spawning.ts`) |
| How does a run reach any of it? | `engine/game/mapgen/index.ts` → `resolveLevelDef` |
| Which missions have a blueprint at all? | `engine/game/mapgen/blueprints.ts` — an import-free LEAF, so `registerDefs({ blueprints })` can swap a MOD's recipes in without the def registry pulling `generate.ts` |
| Is the authored file legal? | `scripts/asset-tools/map-schema.mjs` |
| How do ramps become numbers? | `scripts/map-data/load-yaml.mjs` + `scripts/level-data/ladder.mjs` (both take a DIRECTORY — a mod's `maps/` goes through the same two) |

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
   node scripts/level-render.mjs <id> --seed 3 --dormant
   ```

   `--dormant` draws the mobs each spawn point still has queued — without it you
   are looking at an empty map and calling it a level. (A PARTS venue's whole
   garrison is real dormant enemies minted at creation, so it is drawn either
   way; every post also gets a small ring.) The schematic view is
   `node scripts/map-layout.mjs <id> --seed 3` (con colours, zones, labels —
   posts draw as con-coloured dots).
3. **LOOK at it — which means CROP it.** The render is the whole map at true
   world scale, upscaled by `--zoom` (default 2) — several thousand pixels on a
   side — and a
   whole-map thumbnail hides every defect this skill exists to catch (tiling in a
   ground tile, a rank that seals a room, a stub of wall). Always take a 1:1 crop
   of two or three places as well as the overview:

   ```sh
   node -e "
   const sharp=require('sharp'); const f='pwa/assets-preview/level_<id>.png';
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
- **Counts are DENSITIES (per 1,000,000 world px²), never numbers.** A cell's
  floor is whatever the split rolled it, so a fixed count piles up in a small
  chamber and leaves a plaza bare. And the remainder is
  settled stochastically (`densityCount`) — a density of 0.3 per cell must mean
  "one cell in three", not "every cell" (rounding up) or "never" (rounding down).
- **Every presentational layer gets its OWN rng stream** (layout, walls,
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
- **An OPEN border narrower than a body is a wall, not a way through.** Two cells
  of one open district have no wall between them, so any overlap used to read as
  connectivity — including the thirty-pixel slivers the carve leaves where two
  independent splits landed near each other. Nothing can walk one, and counting
  it as a graph edge lies to everything that asks whether the map hangs together:
  it told `survivesWithout` a car park was connected round the back and sealed
  the whole mission behind a keycard. `MIN_WALKABLE` (80, off the hero's 20 and
  `NAV_CELL`'s 40) is the floor, and a sliver below it is walled.
- **A cell whose every border is too short to open would be sealed for good** —
  the spanning tree can only open a border that is already a `door`. Rare on
  district-sized cells, real on ROOMS, so `carveChambers` promotes such a cell's
  longest border regardless.

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

## Capabilities a blueprint can ask for

**A DISTRICT KNOWS WHICH SIDE OF THE WALL IT IS ON — `space: inside | outside`,
and three things hang off it.** An enclosure says how a cell meets its
NEIGHBOURS; a fenced yard and a server room are both `hard` and only one has a
ceiling. Saying which is which buys:

- **ROOMS.** `roomSize:` carves an interior district a SECOND time, into rooms of
  at least that edge, all wearing the district's own area — so a corporate floor
  is thirty rooms off a corridor rather than four halls with desks in them.
  `Chamber.district` remembers the coarse cell, because anything priced per
  district (the caches) must not suddenly be priced per cupboard.
- **DOORS.** `doors:` names a `door` object hung in every doorway the district
  owns — shut until somebody walks up, then open for good, with its leaves left
  standing (`openSprite`). `doorWidth:` sizes the hole, and the opening taken is
  the SMALLER of the two areas' (a hangar-to-cupboard door is a cupboard door).
  Calibrate against a body: the hero is 20 across, so 56–64 is a person door and
  220 is the door a rocket leaves through.
- **PROPS.** A sprite is authored `space:` in its own YAML — a fact about the ART,
  true on every map — and the map schema refuses a palette entry that could
  scatter it into the wrong half. `MapObject.space` is the restriction that keeps
  being true when the palette grows another district, where an `areas` list rots.

**AND THE STAFF WALK THROUGH THE DOORS TOO.** `stepDoors` opens an approach door
for any mob that comes up to it, and a KEYED door for one carrying that key —
derived from `loot.storyItems`, so the mob a door opens for is exactly the mob
you can take the card from. A floor cut into rooms whose doors only the hero can
open is a floor with the night shift shut in the rooms.

**SOME ROOMS ARE ALWAYS THE SAME ROOM — `prefabs:`.** The carve buys replay value
by making every room new and pays for it in recognition: ten runs in, a player
cannot say one true sentence about the building. A prefab is a fixed-size room
with fixed contents (`props`, exact offsets, compiled to one-prop `propLines`)
GUILLOTINED out of a district — a real cell, with derived walls, a punched
doorway and its own fog. Its area may be its host's (a bank of parking bays is
not walled off from the car park). Nothing the run needs may live in one: a carve
too small to give it a corner simply does not have that room this shift.

**THE ARRIVAL CAN BE A PLACE, NOT A PREFERENCE — `landing:` and `regions:`.**
`spawn:` is a permission with a fallback that reopens the whole map, which is
right when a carve grew too little of the preferred district and wrong when the
arrival is a SCENE (GOODCO's hero parks in the lot and walks in). `landing: true`
confines the pick and promises the district a seed; `regions:` rolls ONE compass
region per run and confines the district to it, seed and spread both — which is
how a car park ends up at an edge, a different edge each shift.

**A KEYCARD OPENS A ROOM THE CARVE PICKED — `lock:` on an area, `locks:` on the
blueprint.** The campaign's keycards were lore for as long as a carve had no way
to say "this district is sealed": a blueprint names a `lock: true` AREA (the kind
of place worth locking — GoodCo's vault, Mars's shrine) and a `locks:` list of
STORY ITEM ids, and the carve hangs one door per key on the borders of the
deepest district it can afford to seal. Five rules make it a room rather than a
soft-lock:

- **A ROOM IS A DISTRICT, NOT A CELL.** Adjacent lockable cells are grouped into
  one room first; hanging a door per cell would put a second lock inside the
  room the first key already opened.
- **SEALING IT MUST NOT CUT THE MAP IN HALF** (`survivesWithout`). A district
  can grow across the map's waist, and a door there locks the boss away behind a
  key that is also behind it. A candidate whose removal disconnects the carve is
  refused and the next one tried.
- **NOTHING THE RUN NEEDS GOES INSIDE.** The landing, the objective, the boss's
  home, every set piece, bystander, placed item and well are excluded from the
  vault cells (`openCells`, `offMap`), so the key is always somewhere the hero
  can reach without it.
- **A LOCKABLE DISTRICT DOES NOT SPREAD** (`areas.ts`). Seeded like any other, it
  would swallow a small map; it stays the cell it was seeded on, and one seed per
  key is `promised` to `carveChambers` so a declared key always has a room.
- **THE ROOM PAYS FOR THE WALK.** Each vault gets its own cache and keeps its
  knot: what is worth locking up is worth standing over.

The ANNEX takes the same treatment through `annex.lock` — a keyed ELEVATOR
(`ElevatorState.opensWith`), refused in `elevator.ts` with an `elevatorLocked`
event rather than silently, so the app can answer with a locked call light and
the key's name.

**AND THE SENTRIES WALK A BEAT — `patrol: true` on an elite set piece.** A route
is DERIVED, never authored: `patrolBeat` sweeps the pinned elite down the long
axis of its own cell, inset off the walls, so the beat fits whatever room the
carve grew it in. One waypoint is the whole route (the engine walks `at →
patrol[0]` and back), and it deliberately avoids the cell's centre, which is
where the furniture stands — a patroller wedged on a crate is a patroller
standing still.

**THE ENDING IS NOT ON THE MAP: the ELEVATOR and the ANNEX.** The search worked,
but its last stretch did not — the fog-of-war minimap fills in as the hero walks,
and a walled compound with a doorway is SHAPED like the end of a mission, so the
player read the answer off the minimap a district or two early. An **annex**
(`MapAnnex`) fixes it by putting the boss somewhere the floor plan does not reach:
a sealed room in a band of its own past the carved rectangle, with no border to any
cell, so nothing adjoins it and the minimap has nothing at all to show where it is
until the hero has stood in it. The only way in is an **elevator** pad
(`LevelDef.elevators`, `engine/game/elevator.ts`) standing in the carved cell the
boss's compass regions picked — so the last thing to FIND is the way to the boss,
and it could be in any of thirty rooms. Two details carry it: the annex joins the
grid as a real chamber with an EMPTY neighbour list (so every dressing pass treats
it as the district it is, with no special cases — only the wall pass knows, and
gives it a sealed box), and `widthFrac` sizes it off the map so the band it costs
stays mostly room. Boot Hill ends in the buried ZAI CONTROL
ROOM; the bunker's vault is below its floor, because you do not walk to a vault.

**FAUNA is the canopy's twin on the ground plane.** A level whose only moving
things are trying to kill the hero reads as an arena with a texture on it; a field
with cattle standing in it was a field before he arrived — and on a map built
around SEARCHING that matters, because the player is looking at a lot of ground he
has no fight in. `LevelDef.fauna` places critters; the wander is a closed-form
function of the render clock (two incommensurate sines per axis — a Lissajous path
that never repeats), so a herd of forty costs the simulation nothing, cannot desync
a replay, and is not an actor: it collides with nothing, cannot be hurt, and never
blocks a shot.

**THE LANDING IS QUIET, NOT SAFE — and the opening beat's cast lands with the
hero.** A SAFE zone does not merely keep the horde from spawning in it, it REPELS
every minion out and holds them at its edge, so one centred on the hero is a
bubble he can stand in untouched all run. It also froze goodco_hq's opening beat
solid: `openingStrike` is held in order by `after` (the hero reads the crowd,
THEN the lone rusher breaks from the pack and starts swinging at him), and the
rusher was shoved straight back out of the pad it was placed in. A QUIET zone
gives the breather the landing wants — no ambient horde placed in it — without
the wall; the safe zone is spent on the trader's stall instead. The gate's other
half is distance: the
carve pins a few of the `firstSightThoughts` breed the `after` thought names
around the landing, inside that pin's own radius, because a crowd carved a
district away leaves the gate shut and the hero walking the map holstered.

**THE HORDE IS A DENSITY, and it is priced over the floor that may HOLD it.** One
knot per CELL is a count wearing a density's clothes: the carve grows its cells
with the map, so the horde thinned out exactly as the search got longer —
measured, 0.8–1.2 spawn points per million px² against the authored campaign's
1.6–3.8, which played as "no mobs on the map, just the elites and the boss".
`KNOT_DENSITY` (generate.ts) is the map's allowance in knots per million px², and
it is spread over the cells that may hold a horde rather than over the map,
because a third of the floor is quiet by design (the boss's cell, the caches, the
trader's) and pricing it per cell hands that third back as emptiness. A cell takes
as many knots as its floor is worth, cut into bands along its long axis so a hall
gets a fight at either end; the first keeps the cell's plain `k<id>` name for an
elite's `alarms` link. The horde's DEPTH axis is rescaled the same way — over the
knot-bearing cells, not the carve — or the deepest ramps of the ladder (and the
breed authored for `[0.8, 1]`) are never reached, because the deepest cells are
precisely the quiet ones.


## Verification — and the trap that makes a green check meaningless

`tests/content/generated_maps_test.ts` is the guard. Two things about it matter
more than the rest of the file:

**1. The nav grid and the def must come from the SAME carve.** `createGame`
resolves its own level from the id and the seed it is handed, so a grid built
from one run and a def resolved on another seed silently checks nothing — the
coordinates path through a different map's walls and every assertion passes.
Resolve the def and build the run from the SAME (id, seed):

```ts
const def = resolveLevelDef(id, seed);
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
  committed; `engine/generated/map-blueprints.ts` and `pwa/src/game/assets/` are
  gitignored build output — never commit them.
- Render every mission you touched at more than one seed and put the images in
  front of the user before shipping. A generator change that looked fine on
  `--seed 3` has been wrong on the next carve more than once.
- Record a rule a future session would otherwise have to re-derive in THIS
  skill (via `skill-reflection`), not in `AGENTS.md`, and add a changeset
  fragment.

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. It owns the
whole lesson lifecycle for this skill: recording what the pass learned (with a
`scope` and `concepts` so the next task can find it), fixing anything in this
file the pass proved WRONG, deleting what went stale, merging what now says the
same thing twice, and promoting anything true in 100% of runs into the steps above.

```sh
node scripts/skill-lessons.mjs mapgen-improvement --list
```

Worth recording here: a tell in a render, a lever that reliably fixes a look
problem, a schema trap.
