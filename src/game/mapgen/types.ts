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
 */
export type MapObjectType =
  | "wall"
  | "obstacle"
  | "cover"
  | "crate"
  | "chest"
  | "decor"
  | "landmark"
  | "building";

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
