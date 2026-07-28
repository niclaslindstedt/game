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
import type { MapArea } from "./areas.ts";
import type {
  DifficultyHp,
  DifficultyMobLevels,
} from "../defs/levels/types.ts";
import type { MapSizeName } from "../flags.ts";

export type { MapSizeName };
export type { Enclosure, MapArea } from "./areas.ts";

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
  | "lair";

/** Where a `landmark` object is pinned once the chambers are carved. */
export type MapAnchor = "spawn" | "goal";

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
   * density rather than a count, because a blueprint is carved at three sizes
   * and a fixed count would leave LARGE bare. Scatter types only.
   */
  density?: number;
  /** A jumping hero clears it (the horde never jumps). Scatter types only. */
  jumpable?: boolean;
  /** Rectangular rock footprints, `[wCells, hCells]` — see `LevelDef`. */
  rockSizes?: [number, number][];
  /** World px per `rockSizes` cell. */
  cell?: number;
  /** A breakable prop's spill odds and themed drop weights (see `LevelDef`). */
  loot?: {
    chance?: number;
    drop?: { health?: number; stamina?: number; gear?: number };
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
  /** `landmark`: which carved feature it is pinned to. */
  at?: MapAnchor;
  /** `landmark`: `base` pins a standing prop's foot to its position. */
  anchor?: "base" | "center";
  /**
   * Restrict this prop to the named AREA types (`areas` palette ids). Omitted =
   * it belongs everywhere. This is what makes a district read as a district: the
   * cactus and the dry shrub scatter over the DESERT cells only, the crates and
   * the hardware over the COMPOUND cells, so walking from one to the other looks
   * like walking somewhere. Scatter and building purposes only.
   */
  areas?: string[];
};

/** One of the three sizes a blueprint may be carved at. */
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
   * rock either side of it as the carve scales up, which is exactly the shape of
   * a bug ("why is half my minimap empty?"). Sizing the room off the map keeps
   * the band mostly ROOM at all three sizes, and a long low gallery is a better
   * operations centre than a square hall anyway.
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
};

/** A compiled map blueprint — one `content/maps/<id>.yaml` file. */
export type MapBlueprint = {
  /** Blueprint id; equals the file stem AND the level it generates. */
  id: string;
  /** The hand-authored level every non-geometry field is inherited from. */
  level: string;
  sizes: Record<MapSizeName, MapSizeSpec>;
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
  hellborn?: MapHellborn;
  /** The boss; null on a `reachExit` mission that ends at a door instead. */
  boss: MapBoss | null;
  /** Regions the hero may START in. Omitted = the chamber FARTHEST from the
   * boss by doorway count, which is the longest search the grid can offer. */
  spawnRegions?: MapRegion[];
  /** Rolled rare/unique encounters, exactly as a `LevelDef` carries them. */
  rareSpawns?: { rare?: string[]; unique?: string[] };
};
