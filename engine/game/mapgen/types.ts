// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MAP BLUEPRINT — the compiled shape of a `content/maps/<id>.yaml` file, the
// "v2" level format that describes a mission as a RECIPE instead of a layout.
//
// A `LevelDef` (defs/levels/types.ts) says where every wall, knot and chest of a
// map SITS. A blueprint says what the map is MADE OF: which sprite the chamber
// walls are cut from, which props scatter over its floor and what each is FOR
// (an obstacle, a smashable crate, a reward chest, flat decor), which monsters
// hold which depth of it, how big it may be carved, and which compass corners
// its boss may be hiding in. `generate.ts` turns one plus a seed into a whole
// `LevelDef`, so a mission's geometry is rolled per run and the boss has to be
// FOUND — the Diablo II beat the hand-authored maps cannot have, because their
// boss is always pinned on the same rock.
//
// A blueprint carries ONLY what the carving needs. Everything else about the
// mission — its name, story intro, cutscenes, loot pools, merchant persona,
// hazards, thought pins, travel gates — is INHERITED from the hand-authored
// level it names (`level`), so the story lives in exactly one place and a
// generated run of THE MOON is still the moon.
//
// The per-difficulty numbers are already expanded here: an authored `ramp` name
// is resolved against `content/ladder.yaml` by the compile step
// (`scripts/generate-maps.mjs`), exactly as the level pipeline resolves a spawn
// point's ramp — so the ladder stays the single source of truth for every
// difficulty figure and the engine never reads it.

import type { Difficulty } from "../types/index.ts";
import type { MapArea, MapSpace } from "./areas.ts";
import type {
  DifficultyHp,
  DifficultyMobLevels,
} from "../defs/levels/types.ts";
export type { Enclosure, MapArea, MapSpace } from "./areas.ts";

/**
 * What a blueprint object is FOR. The type is what lets the generator place a
 * thing without being told where: a `wall` is the material chamber partitions
 * are cut from, a `chest` belongs at the end of a dead end, `decor` may land
 * anywhere. Adding a purpose means teaching `generate.ts` where that purpose
 * goes — never a free-form sprite list.
 *
 *   wall      the chamber partitions (chains of solid circles, doorways punched)
 *   obstacle  solid scatter — cover that blocks movement, sight and shots
 *   cover     jumpable scatter — a wall to the horde, a hop to the hero
 *   crate     breakable scatter that spills loot when smashed
 *   chest     a reward container, placed where the map wants a destination
 *   decor     flat scatter the hero walks over
 *   landmark  a story prop pinned to a named anchor (the spawn, the boss)
 *   building  a solid box filler — a structure the streets run between
 *   row       ALIGNED RANKS of a prop across a cell — server aisles, an assembly
 *             line, a bank of workstations
 *   critter   LIVING scenery — cattle on the range, chickens in a yard. Wanders
 *             off the render clock, collides with nothing, cannot be hurt.
 *   lair      an OCCUPIED house: a structure with a door that opens and an elite
 *             that comes out of it (see `LevelDef.lairs`)
 *   door      a real DOOR: a solid chain hung across a doorway that slides open
 *             for anybody who walks or drives up to it (`LevelDef.doors`,
 *             opens: "approach"). Where it hangs is said by whoever wants one —
 *             `at: spawn` puts it across every doorway of the hero's own
 *             chamber (the garage's roll-up, and the threshold a driven car
 *             departs through), and a district that names it in `MapArea.doors`
 *             gets one in every doorway of its own rooms.
 *   light     a LAMP: a pool of light on the ground, pinned to a carved anchor
 *             and burning only once the venue's `sky` has gone dark
 *             (`LevelDef.lights`). It draws NO sprite — the fixture hangs
 *             overhead, off the ground plane the game draws — so what the
 *             player sees of one is the light itself
 */
export type MapObjectType =
  | "wall"
  | "obstacle"
  | "cover"
  | "crate"
  | "chest"
  | "decor"
  | "landmark"
  | "building"
  | "row"
  | "critter"
  | "lair"
  | "door"
  | "light";

/** Where a `landmark` or a `light` object is pinned once the chambers are
 * carved: the hero's landing, the goal cell, the trader's own counter
 * (`counter`) or a step aside from it (`stall`), or a step off the landing
 * itself (`home` — the garage's rift seam hums on the bay wall beside the
 * car).
 *
 * `entrance` is the odd one out and is a DOOR's alone: it is not a spot at all
 * but a RULE — hang this door across every opening between the staff lot and
 * the building (`MapArea.arrivals`). A landmark pinned to it would have nothing
 * to stand on, which the schema says so. */
export type MapAnchor =
  "spawn" | "goal" | "stall" | "counter" | "home" | "entrance";

/**
 * A lamp's numbers as a blueprint authors them — the `LevelLight` a carve
 * compiles it into, minus the position the carve decides.
 */
export type MapLightSpec = {
  radius: number;
  color?: string;
  intensity?: number;
  flicker?: number;
};

/**
 * One entry of a blueprint's object palette: a sprite plus the purpose that
 * tells the generator what to do with it. Which fields matter depends on
 * `type` — the schema (`scripts/asset-tools/map-schema.mjs`) rejects a field
 * that belongs to another purpose, so a palette entry can't quietly carry
 * settings nothing reads.
 */
export type MapObject = {
  /** Palette key — referenced by `layout.wall`, and unique within the file. */
  id: string;
  type: MapObjectType;
  /** Obstacle `kind` (the collision/behavior family); defaults to `id`. */
  kind?: string;
  /** Sprite the renderer blits; defaults to `kind`. */
  sprite?: string;
  /**
   * `wall`: a SPRITE POOL the chain draws each stone from. A ridge built out of
   * one repeated sprite reads as a manufactured lattice, which is the opposite of
   * rubble; three or four stones in the pool is enough to break it. Wins over
   * `sprite`.
   */
  sprites?: string[];
  /**
   * `wall`: how far (world px) the chain may MEANDER off the straight line
   * between two cells. The drift is a bounded, end-tapered random walk, so the
   * wall still seals and still meets its neighbours (see `LevelDef.walls`).
   */
  wander?: number;
  /** Collision radius (world px) — walls, obstacles, cover, crates. */
  radius?: number;
  /**
   * How THICK the scatter lies, as placements per 1,000,000 world px² — a
   * density rather than a count, so the dressing follows the floor it is given
   * whatever a district's cells rolled. Scatter types only.
   */
  density?: number;
  /** A jumping hero clears it (the horde never jumps). Scatter types only. */
  jumpable?: boolean;
  /**
   * WALL-HUGGING scatter (`obstacle`/`cover`/`crate` with an `areas` list):
   * placements are drawn along the borders of the district's cells instead of
   * across their floor — furniture stands against the walls of its room
   * (the garage's workbench world), keeping the middle open.
   */
  edge?: boolean;
  /** Rectangular rock footprints, `[wCells, hCells]` — see `LevelDef`. */
  rockSizes?: [number, number][];
  /** World px per `rockSizes` cell. */
  cell?: number;
  /** A breakable prop's spill odds and themed drop weights (see `LevelDef`). */
  loot?: {
    chance?: number;
    drop?: {
      health?: number;
      stamina?: number;
      gear?: number;
      ammo?: number;
    };
  };
  /** `building` footprint (world px). */
  w?: number;
  h?: number;
  /**
   * `row`: how the ranks are laid out. A factory floor is not a scatter — server
   * racks stand in aisles, fuselage sections queue down an assembly line,
   * workstations line up in banks — and no amount of random placement produces
   * that read. A `row` object lays PARALLEL RANKS across each cell it belongs in,
   * emitted as `LevelDef.propLines`, which stamps a sprite at a fixed spacing
   * along a segment.
   */
  /** Distance between props ALONG a rank (world px). */
  spacing?: number;
  /** Distance between ranks within a bank (world px). */
  gap?: number;
  /** Ranks per bank before a wide aisle (default 2). */
  bank?: number;
  /** Width of the aisle between banks (world px). */
  aisle?: number;
  /** Share of the cell the ranks fill, centred (0..1, default 0.7). Leaves a
   * margin all round so a rank never crowds a doorway. Varied per cell. */
  coverage?: number;
  /** Probability a given cell gets these ranks at all (0..1, default 1) — the
   * knob that stops every bay being the same bay. */
  chance?: number;
  /** The ranks collide (a rack, a fuselage) rather than being painted on
   * (a lane marking). */
  collide?: boolean;
  /** Colliding: rectangular half-extents (world px). */
  half?: { x: number; y: number };
  /**
   * `critter`: the sprite names a TWO-FRAME walk (`<sprite>_0` / `<sprite>_1`)
   * rather than a single still. A grazing cow wants the flip; a lizard basking on
   * a rock does not.
   */
  animated?: boolean;
  /** `critter`: how far it strays from where it was put down (world px). */
  range?: [number, number];
  /** `critter`: wander speed (world px/s). */
  speed?: [number, number];
  /** `critter`: scale range, so a herd has calves in it. */
  scale?: [number, number];
  /** `lair`: the CLOSED door sprite drawn on the structure's near face. */
  door?: string;
  /** `lair`: the same door standing open. */
  doorOpen?: string;
  /** `lair`: how close the hero must come to be greeted (world px). */
  trigger?: number;
  /**
   * `door`: the same door STANDING OPEN — drawn in the jambs once it has slid
   * aside, so the doorway keeps a door in it instead of turning back into a
   * hole in the wall the moment the hero uses it.
   *
   * It is what makes the door read as architecture rather than as a barrier
   * that was removed. Optional, because the garage's roll-up rolls UP: there is
   * nothing left standing in the opening to draw.
   */
  openSprite?: string;
  /**
   * `door`: this one ROLLS UP rather than sliding aside — the garage door. It
   * picks the app's roll-up animation and its chain-drive sound instead of the
   * plain door slide (`LevelDef.doors[].rollUp`).
   */
  rollUp?: boolean;
  /** `landmark`: which carved feature it is pinned to.
   *
   * `door`: WHERE ONE HANGS. Only `spawn` means anything — every doorway of the
   * hero's own chamber, which is the garage's roll-up. A door that hangs by
   * DISTRICT is named by the district instead (`MapArea.doors`), because that
   * is a fact about the rooms, not about the door.
   *
   * `light`: which carved feature the lamp is pinned to. */
  at?: MapAnchor;
  /**
   * `light`: how far (world px) the lamp stands from the anchor it is pinned
   * to. A carve has no authored coordinates, so an anchor plus a nudge is how a
   * lamp reaches the far side of a doorway or the middle of the bay it lights,
   * and it stays true on every seed the way a fixed coordinate never could.
   * Omitted = right on the anchor.
   */
  offset?: { x: number; y: number };
  /**
   * `light`: THE FIXTURE — the sprite of the thing throwing the pool (a lamp
   * post, a bollard), emitted as a landmark standing at it.
   *
   * OMITTING IT IS A CHOICE, NOT A SHORTCUT, and the wrong choice is loud: a
   * pool of light on open ground with nothing above it reads as a bug — a bulb
   * burning in mid-air. Leave it off only when the fitting genuinely is not on
   * the ground plane (a gantry light, a strip over a counter) or when something
   * already drawn there is obviously the source.
   */
  fixture?: string;
  /** `landmark`: `base` pins a standing prop's foot to its position. */
  anchor?: "base" | "center";
  /**
   * THE LIGHT A `light` THROWS — the whole of what that purpose is. Compiled
   * straight into `LevelDef.lights`; see `LevelLight` for what each field
   * means. Refused by the schema on every other purpose except `door`'s
   * `lamps` below: a lamp riding a density-scattered prop is a map whose
   * lighting is rolled rather than designed.
   */
  light?: MapLightSpec;
  /**
   * `door`: THE PAIR OF LAMPS BOLTED EITHER SIDE OF THE OPENING — a real
   * fixture drawn on the wall (`sprite`) with its own pool under it, one at
   * each end of every chain this door hangs.
   *
   * It is part of the DOOR rather than two `light` objects because only the
   * carve knows where the doorway ended up: the lamps are placed at the chain's
   * own ends and pushed to the OUTSIDE face (away from the chamber the door
   * shuts), so they flank the opening on whatever border it was punched
   * through, at any size and on any seed. Authored coordinates could not
   * survive a re-carve, and a light with no fixture leaves a driveway lit by
   * nothing anybody can see.
   */
  lamps?: {
    /** The fixture sprite drawn on the wall (a landmark — it never collides). */
    sprite: string;
    /** How far outside the door's own line the lamps stand (world px,
     * default 8) — clear of the chain so the fitting reads as bolted beside
     * the opening rather than into it. */
    inset?: number;
    /** The pool each one throws. */
    light: MapLightSpec;
  };
  /**
   * Restrict this prop to the named AREA types (`areas` palette ids). Omitted =
   * it belongs everywhere. This is what makes a district read as a district: the
   * cactus and the dry shrub scatter over the DESERT cells only, the crates and
   * the hardware over the COMPOUND cells, so walking from one to the other looks
   * like walking somewhere. Scatter and building purposes only.
   */
  areas?: string[];
  /**
   * Restrict this prop to the INSIDE or the OUTSIDE districts (see
   * {@link MapSpace}) — the same restriction `areas` expresses, said once
   * instead of once per district.
   *
   * It is not merely shorthand, because the two rot differently: a map that
   * grows a new interior district has to remember to add it to the `areas` of
   * every indoor prop, and the failure when somebody forgets is silent — a wing
   * with no furniture in it. `space` is a statement about the PROP, so it stays
   * true as the palette changes.
   *
   * The build cross-checks it against the SPRITE's own declared space
   * (`content/sprites/**`, `space:`), which is where the fact really lives: a
   * server rack is an indoor object on every map in the game, and a palette
   * entry that could scatter one onto a car park fails the build rather than
   * shipping. Both may be given, and the prop then has to satisfy both.
   */
  space?: MapSpace;
};

/**
 * A PREFAB — a room that is the SAME room every run, cut into a carve that is
 * different every run.
 *
 * The generated maps buy their replay value by making every room new, and pay
 * for it in recognition: nothing on a carved floor is a landmark, because
 * nothing on it has been there before. A player who has run GOODCO ten times
 * cannot say one true sentence about the building. That is the price of the
 * search, and it does not have to be paid in full — a handful of rooms that ARE
 * always the same (the car park he arrives in, the cleaning cupboard, the
 * transformer room) give the floor plan something to be measured from, and
 * everything between them stays rolled.
 *
 * A prefab is cut out of a district as a GUILLOTINE (see `stampPrefab`), so it
 * is a real cell like any other: it takes its walls from its own AREA the way
 * every cell does, its doorway is punched by the same spanning tree, and the
 * horde, the fog and the minimap treat it as the room it is. What is authored is
 * only its SIZE and its CONTENTS.
 *
 * NOTHING THE RUN NEEDS MAY LIVE IN ONE. A carve too small to give a prefab its
 * corner simply does not have that room this run, and a mission whose keycard
 * was in it would be unfinishable on those seeds — the same rule the keyed rooms
 * follow, for the same reason.
 */
export type MapPrefab = {
  /** Blueprint-unique id (and what the map tooling labels it). */
  id: string;
  /**
   * The AREA this room wears — its floor, its walls, its doorway width, its
   * label. Usually an area of its own (weight 0, so the carve never grows a
   * second one); it may also be the host district's own area, for a prefab that
   * is an ARRANGEMENT rather than a room — a bank of parking bays is not walled
   * off from the car park it is in.
   */
  area: string;
  /** Room footprint in world px — identical on every seed and every size, which
   * is the entire point. */
  width: number;
  height: number;
  /** The district areas it may be cut out of. */
  in: string[];
  /**
   * The room's FIXED CONTENTS: a palette object stamped at an offset from the
   * room's top-left corner, in world px.
   *
   * Exact positions rather than a scatter, because "the same room every time" is
   * a claim about the furniture as much as about the walls — a cleaning cupboard
   * whose mop bucket moves is just a small room. Compiled to `LevelDef.propLines`
   * of one prop each, which is the engine's one deterministic placement.
   */
  props?: { object: string; at: [number, number] }[];
};

/** The extents a blueprint is carved into. */
export type MapSizeSpec = {
  width: number;
  height: number;
  /** How many chambers to carve the rectangle into. */
  rooms: number;
};

/**
 * One breed of the ambient horde, and the stretch of the map it holds.
 * `window` is a fraction of the DEPTH axis — 0 at the hero's chamber, 1 at the
 * boss's — so the breeds hand over to each other as the search runs deeper,
 * the way a hand-authored map ramps its knots basin by basin.
 */
export type MapHordeMember = {
  enemy: string;
  window: [number, number];
  /** Relative share of a chamber's count among the breeds live at its depth. */
  weight?: number;
};

/** A monster pinned to a carved chamber — an elite, a guardian, the boss. */
export type MapSetPiece = {
  enemy: string;
  /**
   * This one LIVES SOMEWHERE: the id of a `lair` object, which puts a house in
   * its cell and keeps it inside until the hero walks up to the door.
   *
   * The difference it makes is out of all proportion to the field. Every other
   * pinned elite is visible from across the room and gets approached; this one is
   * a building the hero walks past, and then does not get to walk past.
   */
  lair?: string;
  /** Per-difficulty level, compiled from the authored `ramp`. */
  level: DifficultyMobLevels;
  /** Per-difficulty base hp, compiled from the authored base `hp`. */
  hp: DifficultyHp;
  /** Retinue that stands with it — an oligarch's guard detail. */
  escort?: {
    enemy: string;
    count: number;
    level: DifficultyMobLevels;
    hp: DifficultyHp;
  }[];
  /**
   * THIS ONE WALKS ITS PATCH: a dormant beat across the cell it was placed in,
   * rather than a post it stands on (`SpawnSpec.patrol` — the engine walks the
   * route ping-pong at `ENEMY_AI.patrol.speedFactor` until something wakes it).
   *
   * It is the difference between a floor with staff on it and a floor with
   * statues on it, and it is the reason a room can be entered twice and not be
   * the same room: the manager pacing his aisle is somewhere else the second
   * time. The route is DERIVED from the cell — down its long axis, inset from
   * the walls — because a carve has no authored coordinates to walk to, and a
   * mob that walks the room it is in is the only route that is true on every
   * seed.
   *
   * Never on a boss (it guards its post), and never on a cache's keeper (it
   * guards the cache); the build refuses both.
   */
  patrol?: boolean;
};

/** The ambient horde: one finite spawn point per chamber, ramping with depth. */
export type MapHorde = {
  /** Mobs per chamber `[min, max]` at the average chamber size, before the
   * difficulty's own count scaling. A chamber's share is scaled by its area. */
  perRoom: [number, number];
  /** Concurrent-alive cap per chamber knot. */
  maxAlive: number;
  /** How many of a knot's mobs are already lingering there when it is found. */
  lingering?: number;
  /** Seconds-equivalent chase persistence is the engine's; this is the mob
   * LEVEL ladder: one compiled ramp per rung of the depth axis, walked from the
   * hero's chamber (`ramps[0]`) to the boss's (`ramps[n-1]`). */
  ramps: DifficultyMobLevels[];
  /** The breeds and the depths they hold. */
  members: MapHordeMember[];
  /** How many HELLGATES to lace across the map (nightmare and up). */
  hellgates?: number;
};

/** The rampage-only hellgate mix (see `SpawnerSpec.hellgate`). */
export type MapHellborn = {
  /** Per-difficulty level of the hellborn, compiled from the authored ramp. */
  level: DifficultyMobLevels;
  members: { enemy: string; count: number; minDifficulty?: Difficulty }[];
};

/**
 * A compass REGION of the map — where a chamber may be found. A name is one or
 * two terms joined by `-`, each naming a third of an axis:
 *
 *   north / south          the top / bottom third (either end of the map)
 *   west / east            the left / right third
 *   center                 the middle third of whichever axis is still free
 *   northeast, northwest, southeast, southwest   both axes in one word
 *
 * An axis no term names spans the WHOLE extent, so `north` is the entire
 * northern band while `center-east` is the single middle-right ninth. Resolved
 * by `regions.ts`; an unparseable name fails the build.
 */
export type MapRegion = string;

/** An authored floor plan (see `MapBlueprint.plan`). */
export type MapPlan = {
  /** The rooms, each an area id plus its rectangle (world px). Order is the
   * chamber order — stable, so everything keyed by chamber id stays put. */
  rooms: {
    area: string;
    rect: { x: number; y: number; width: number; height: number };
  }[];
  /** Which hard borders carry a doorway, named as area pairs. A pair with no
   * shared border is a schema error; every hard border not named stays a
   * solid wall. */
  doors?: { between: [string, string] }[];
  /** The GOAL room's area (the rocket's `goal` anchor lands in it). Omitted =
   * the ordinary roll. */
  goal?: string;
  /** The TRADER's room's area (his counter parks in it). Omitted = the
   * ordinary mid-depth pick. */
  stall?: string;
};

/** The boss and the corners it may be hiding in. */
export type MapBoss = MapSetPiece & {
  /** Candidate compass regions — one is rolled per run, and the boss's chamber
   * is picked inside it. The whole point of the search: a player who learned
   * where the boss was last time knows nothing about this run. */
  regions: MapRegion[];
};

/**
 * THE ANNEX — a room the map does not connect to, reached only by ELEVATOR.
 *
 * A generated mission's problem is its ending. The search itself works: thirty
 * rooms, no guidance arrow, a boss in a rolled corner. But the fog-of-war minimap
 * fills in as the hero walks, and a walled compound with a doorway in it is
 * SHAPED like the end of a mission — so the player reads the answer off the
 * minimap a district or two before he gets there, and the last stretch is a
 * commute again.
 *
 * An annex is not on the plan. It sits in a band of its own past the carved
 * rectangle, sealed on all four sides, with no border to any cell — so nothing
 * approaches it, nothing adjoins it, and the minimap has NOTHING to show where it
 * is until the hero has stood in it. The only way in is a pad in one of the carved
 * cells, which makes the last thing to find not the boss but the way to him.
 *
 * It is carried as a real chamber in the grid (with an empty neighbour list), so
 * every dressing pass — the district floor, the scatter, the ranks, the horde
 * multiplier — treats it as the district it is, without a single special case.
 */
export type MapAnnex = {
  /** Which area of the palette the room IS (its floor, wall and apron). */
  area: string;
  /** Room footprint in world px. */
  width: number;
  height: number;
  /**
   * Instead of a fixed width, span this FRACTION of the carved map's width
   * (clamped to at least `width`).
   *
   * The annex costs the level a whole band of its own — the room's height plus
   * its margins — and that band is as wide as the map whether the room is or
   * not. A fixed-width room therefore leaves a bigger and bigger apron of dead
   * rock either side of it on a wide map, which is exactly the shape of a bug
   * ("why is half my minimap empty?"). Sizing the room off the map keeps the
   * band mostly ROOM, and a long low gallery is a better operations centre
   * than a square hall anyway.
   */
  widthFrac?: number;
  /** Dead ground left around the room inside its band (world px, default 200). */
  margin?: number;
  /** The band's own floor — the rock the room was cut into, seen past its walls
   * at the edges of the screen. Omitted = the mission's level-wide ground. */
  ground?: { common: string; rare: string; rareEvery: number };
  /** The `landmark`-style sprite drawn on both pads. */
  padSprite?: string;
  /** What the pad in the MAP says (the way down). */
  downLabel?: string;
  /** What the pad in the ANNEX says (the way back up). */
  upLabel?: string;
  /**
   * A KEYED CAR: the door id (a story item's `unlocks`) the hero must carry
   * before the DOWN pad will take him — the mission's finale behind a keycard.
   *
   * It is the annex's answer to a locked room: an annex has no border to hang a
   * door in (that is the whole point of it), so the lock goes on the one link
   * it does have. The way back UP is never keyed — a hero who rode down and
   * dropped the pass would be sealed in.
   *
   * Never key it to something the annex itself holds: the boss down there
   * cannot be the one carrying the key to his own door.
   */
  lock?: string;
};

/** A compiled map blueprint — one `content/maps/<id>.yaml` file. */
export type MapBlueprint = {
  /** Blueprint id; equals the file stem AND the level it generates. */
  id: string;
  /** The hand-authored level every non-geometry field is inherited from. */
  level: string;
  /**
   * PIN THE CARVE — the STATIC map. When set, the carve (and the size roll)
   * runs on this constant instead of the run's seed, so the venue lays out
   * IDENTICALLY every visit: the hub's garage looks the same every time the
   * hero comes home, exactly as a home should. Everything the RUN rolls
   * (loot, the stall's stock, drops) still draws the run's own streams — only
   * the geometry is pinned. Omitted = carved fresh per run, as everywhere.
   */
  carveSeed?: number;
  /**
   * THE AUTHORED FLOOR PLAN — a static venue's rooms, drawn outright instead
   * of grown by the BSP. Each room names its AREA and its RECT; the walls
   * between rooms are still DERIVED from the areas' enclosures exactly as a
   * carve derives them (none↔none stays open ground), and `doors` names the
   * area pairs whose hard border gets a doorway punched (centered, at
   * `layout.doorWidth`) — every unnamed hard border stays a solid wall.
   * Everything downstream (dressing, landmarks, the scatter) reads the same
   * `ChamberGrid` a carve emits and cannot tell the difference. This is what
   * a COMPOSED venue uses — the garage laying out the cutscene's own shot:
   * bay southwest, lawn behind, the paved drive out the door — where a
   * weighted roll could only gamble at it. The rooms should tile the map's
   * `size` extents; `size.rooms` is ignored when a plan is present.
   */
  plan?: MapPlan;
  /**
   * THE ROOMS THAT ARE ALWAYS THE SAME ROOM — static rooms cut into the rolled
   * carve (see {@link MapPrefab}). A partial `plan`: the venue is generated, and
   * these few pieces of it are drawn.
   */
  prefabs?: MapPrefab[];
  /** The world rectangle this blueprint is carved into, and how many chambers
   * the carve splits it into. */
  size: MapSizeSpec;
  /**
   * The AREA PALETTE — what kinds of place this map is made of (see areas.ts).
   * Every carved cell is assigned one, and the walls between cells are DERIVED
   * from the pair of areas either side, never authored.
   */
  areas: MapArea[];
  layout: {
    /** Smallest chamber edge (world px) — the carve stops splitting here. */
    minRoom: number;
    /** Doorway opening (world px) punched through a chamber partition. */
    doorWidth: number;
    /** Share of the leftover chamber adjacencies opened as EXTRA doors, so the
     * grid loops instead of being a pure tree (0 = a strict tree, 1 = every
     * partition open). Loops are what make a search feel like a place rather
     * than a decision tree. */
    loopDoors: number;
    /**
     * How strongly a cell prefers an already-assigned neighbour's area type
     * (0..1). Low values checkerboard the palette; high values grow coherent
     * districts — a town of four cells rather than four scattered town cells.
     */
    cluster: number;
    /** The `wall`-type object the partitions are cut from. */
    wall: string;
  };
  objects: MapObject[];
  /** The elevator-only room the boss holds, when the mission ends in one. */
  annex?: MapAnnex;
  horde: MapHorde;
  /** Speaking elites, pinned one per chamber in depth order. */
  elites: MapSetPiece[];
  /** Dead-end guardians — the chest rooms' lone keepers. */
  guardians: MapSetPiece[];
  /**
   * THE NON-COMBATANTS: neutral mobs an errand sends the hero to talk to (see
   * `EnemyDef.disposition`). They are cast rather than horde — one archive
   * terminal, one surveyor, one assessor — so they are named here and dropped
   * into knot-bearing cells off the carve's own stream, which means the map
   * still has to be searched for them. Everything about one beyond where it
   * stands is its own def.
   *
   * They belong to the BLUEPRINT rather than to the mission for the same reason
   * the elites do: the mission has no map to stand them on. Without them a
   * campaign chain simply cannot be finished, with nothing on screen to say why
   * — which is exactly why the build refuses a non-neutral id here.
   */
  bystanders?: { enemy: string }[];
  hellborn?: MapHellborn;
  /** The boss; null on a `reachExit` mission that ends at a door instead. */
  boss: MapBoss | null;
  /** Regions the hero may START in. Omitted = the chamber FARTHEST from the
   * boss by doorway count, which is the longest search the grid can offer. */
  spawnRegions?: MapRegion[];
  /** Rolled rare/unique encounters, exactly as a `LevelDef` carries them. */
  rareSpawns?: { rare?: string[]; unique?: string[] };
  /**
   * THE KEYS THIS MAP'S DOORS ANSWER TO — story-item door ids (`unlocks` on a
   * `content/story-items.yaml` entry), spent one per SEALED cell the carve grew
   * out of a `lock`-able area.
   *
   * It is a LIST rather than a flag on the area because a key is a specific
   * object with a specific carrier: GOODCO HQ has three keycards on three named
   * elites, so it seals three rooms and no more. A carve that grew four
   * lockable cells locks three of them and leaves the fourth open — the
   * alternative (one id on every room of a kind) is one keycard opening every
   * vault in the building, which is not a key, it is a door that looks locked.
   */
  locks?: string[];
};
