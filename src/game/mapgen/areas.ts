// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AREA TYPES — the rule engine that decides what each carved cell IS.
//
// A grid of identical walled boxes is a spreadsheet, not a place. What makes a
// generated map read as somewhere is that its cells are DIFFERENT KINDS of
// ground: open plain, fenced yard, sealed compound. So a blueprint declares an
// AREA PALETTE (`areas` in `content/maps/<id>.yaml`) and every carved cell is
// assigned one, which then decides three things:
//
//   ENCLOSURE  how the cell meets its neighbours — the walls are DERIVED from the
//              pair of areas either side of a border, never authored. Two open
//              plains simply flow into each other with no wall at all; a compound
//              beside anything gets a solid wall with a doorway; a yard gets a
//              wide archway. That is the whole reason a generated map stops
//              looking like a maze of stubs: a wall exists because the two cells
//              it separates are different kinds of place.
//   CONTENT    which scatter props belong here, which structures may stand here,
//              and how thick the horde is (`props` / `buildings` / `horde`).
//   ROLE       whether the cell may hold the boss or the hero's landing
//              (`boss` / `spawn`) — so "the boss is always found inside a
//              compound, never out on the open plain" is one flag, not code.
//
// Assignment CLUSTERS on purpose (`layout.cluster`): a cell usually takes a type
// one of its already-assigned neighbours has, and only sometimes rolls a fresh
// one. Without that the palette comes out as a checkerboard — a town cell, a
// desert cell, a town cell — and nothing reads as a district. With it, the same
// weights grow a town of four cells with desert around it.

import type { Rng } from "@game/lib/rng.ts";
import type { Chamber } from "./rooms.ts";

/**
 * How a cell meets its neighbours, weakest to strongest. The border between two
 * cells takes the STRONGER of the two (see {@link borderEnclosure}), so a
 * compound is sealed by its own nature wherever it happens to land, and open
 * ground never fences itself in.
 *
 *   none  no wall at all — the two cells are one continuous piece of ground
 *   soft  a wall with a WIDE opening: a fence, a rubble ridge, a broken hull
 *   hard  a solid wall with a single DOORWAY, punched only where the map needs
 *         the connection
 */
export type Enclosure = "none" | "soft" | "hard";

const STRENGTH: Record<Enclosure, number> = { none: 0, soft: 1, hard: 2 };

/** One entry of a blueprint's area palette. */
export type MapArea = {
  /** Palette key, referenced by an object's `areas` list. */
  id: string;
  enclosure: Enclosure;
  /**
   * Relative share of the districts. `0` means this area is NEVER seeded on its
   * own — it exists only as another area's shell (see {@link shellOf}), or as an
   * {@link MapAnnex} the elevator rides to.
   */
  weight: number;
  /**
   * THERE IS EXACTLY ONE OF THESE. Seeded once, never rolled again — so the map
   * has A town rather than town blocks.
   *
   * The distinction is the whole difference between a frontier and a suburb.
   * Weights alone cannot express it: a weight low enough that towns are rare
   * gives runs with none at all, and one high enough to guarantee a town gives
   * runs with five. A player asked to find something needs it to BE somewhere —
   * one place, in a rolled corner of a big empty map, that he either has walked
   * into or has not.
   *
   * The `weight` still applies, as the odds this district gets one of the map's
   * seeds at all; a `once` area with a weight it never wins simply does not
   * appear on that run.
   */
  once?: boolean;
  /**
   * A KEYED ROOM: this district may be SEALED, its doorways carrying a locked
   * door that only its own keycard opens (`LevelDef.doors`, the engine's
   * story-item keys).
   *
   * It is a permission rather than an instruction: the carve locks a cell of
   * this kind only while the blueprint still has an unspent door id in its
   * `locks` list, so a map with one key has one vault however many cells of the
   * kind it grew. What is behind the door is the payoff — a cache and whatever
   * stands guard over it — and what is NEVER behind it is anything the run
   * requires: no boss, no landing, no set piece, no story pickup. A key locked
   * inside the room it opens is a run that cannot be finished, and it would be
   * rolled rather than authored, which is the worst kind of bug to ship.
   *
   * Only a `hard` district can be locked (the build refuses otherwise): a door
   * across a border that was already open or gated is a door with a way round.
   */
  lock?: boolean;
  /**
   * STREET BLOCKS: lay this area's `building` structures out along a street
   * instead of scattering them (see `buildBuildings`). The number is the street's
   * width in world px.
   *
   * A scatter of houses is a hamlet at best and a rash at worst, because the thing
   * that makes a town read as a town is not its density, it is its ALIGNMENT: two
   * rows of frontages facing each other across a lane the eye can run down. That
   * is also the read the mission wants — a main street is a corridor, and a
   * corridor is where a western gunfight happens.
   */
  blocks?: number;
  /**
   * Multiplies this area's chamber knot count — how thick the horde stands here.
   * 0 makes the area ambient-free (a genuinely empty quarter). Default 1.
   */
  horde?: number;
  /** May the BOSS's cell be one of these? Default true. */
  boss?: boolean;
  /** May the hero LAND here? Default true. */
  spawn?: boolean;
  /**
   * THE ROAD OUT: a DRIVEN car that reaches this district has left — the trip
   * its travel door names is booked from here rather than from the garage
   * door's own threshold.
   *
   * A departure wants somewhere to depart TO. Booking the trip at the roll-up
   * meant the drive ended the moment the bumper cleared the door: the car was
   * still in its own driveway, nose barely straight, and the screen cut. A
   * strip of public road along the map's edge gives the beat its second half —
   * out of the bay, across the drive, onto the road — and the road is where the
   * level lets go. Compiled into `LevelDef.driveOut`; see `vehicles.ts`.
   */
  driveOut?: boolean;
  /**
   * THIS DISTRICT IS LIT — how much of the venue's NIGHT its own lights hold
   * off, 0 (none: outdoor ground, dark after dusk) to 1 (as bright as noon).
   * Read only on a venue whose mission names a `sky`; everywhere else it is
   * inert, because everywhere else is never dark to begin with.
   *
   * It is a DISTRICT rather than a lamp because a roofed room is lit as a room:
   * the garage bay has strip lights on, and the honest picture of that is the
   * whole floor up to the walls, not a circle in the middle of it with the
   * corners in shadow. The carve emits each such chamber as a rect
   * (`LevelDef.litZones`), so the light stops exactly where the wall does — a
   * radial pool cannot do that, and pools big enough to fill a room leak
   * straight through it onto the lawn.
   *
   * Author it on ROOFED districts only (`enclosure: hard`). On open ground it
   * is a rectangle of daylight sitting in the middle of a night, and the shape
   * of it is unmissable.
   */
  lit?: number;
  /**
   * The area's OWN GROUND, as a `TileSpec` ground pair (and optional patch pair)
   * of sprite names. This is what makes a district legible: without it every cell
   * is the same floor and the wall around a compound reads as a stub of rock in
   * an empty plain, because nothing shows where the compound starts. With it, the
   * ground itself changes underfoot — regolith giving way to deck plating — and
   * the wall is obviously the edge of somewhere. Compiled into the level's
   * `tiles.zones`, the regional-override mechanism the hand-authored maps already
   * use for exactly this. Omitted = the mission's own level-wide ground.
   */
  ground?: { common: string; rare: string; rareEvery: number };
  patch?: { a: string; b: string; every: number };
  /**
   * SHELL: this area is not a district of its own but a BAND laid just inside the
   * outer boundary of the named area's districts — an outer dome wrapped around an
   * inner one.
   *
   * The obvious alternative was to make the shell its own district and demote the
   * rim CELLS of the inner one into it. That fails at the only scale that matters:
   * a district is three or four cells, every one of them is on the rim, and the
   * garden it was supposed to wrap disappears entirely. A band is measured in
   * pixels instead of cells, so it is the same handspan of concrete whether the
   * dome is one cell or nine, and the garden inside it always survives.
   *
   * The band is a REGION, not geometry: it supplies its own ground (and its own
   * `wall` where it meets the outside), and props may target it by naming this
   * area, but it consumes no cells and changes no walls of its own.
   */
  shellOf?: string;
  /** Shell band width in world px (default 120). */
  shellWidth?: number;
  /**
   * ENTRANCE APRON: the ground laid immediately inside every doorway into this
   * area. A dome's floor is lawn and timber, but nobody walks off an airlock onto
   * a lawn — there is concrete at the door. Compiled into `tiles.zones` alongside
   * the area's own ground, and drawn AFTER it so it sits on top.
   */
  apron?: {
    ground: { common: string; rare: string; rareEvery: number };
    /** Half-extent of the apron square in world px (default 90). */
    radius?: number;
  };
  /**
   * The `wall`-type object this area's own barriers are cut from — used on every
   * border where THIS area is the one that decided there is a wall at all (see
   * {@link borderEnclosure}). Omitted = the blueprint's `layout.wall`.
   *
   * This is what lets one map own two kinds of barrier honestly. A rubble spine is
   * right between two stretches of open ground and wrong around a pressurized
   * dome: a colony is a built thing, and its wall has to be a built thing, or the
   * map says the settlers piled rocks up and called it an atmosphere.
   */
  wall?: string;
  /** Name the map tooling and the design zones print over the region. */
  label?: string;
};

/** The stronger of two enclosures — the rule every wall in a generated map
 * comes from. */
export function borderEnclosure(a: Enclosure, b: Enclosure): Enclosure {
  return STRENGTH[a] >= STRENGTH[b] ? a : b;
}

/**
 * Which of two areas OWNS the border between them — the one whose enclosure
 * decided there is a wall there, and therefore whose material it is built from.
 *
 * Ties go to whichever is declared FIRST in the palette, so a blueprint that puts
 * two equally-sealed districts beside each other decides the seam's material by
 * authoring order rather than by whichever cell the carve happened to number
 * lower.
 */
export function borderOwner(a: MapArea, b: MapArea, order: MapArea[]): MapArea {
  if (STRENGTH[a.enclosure] !== STRENGTH[b.enclosure])
    return STRENGTH[a.enclosure] > STRENGTH[b.enclosure] ? a : b;
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
}

/** Look an area up by id; throws on a palette reference the compile step should
 * already have rejected. */
export function areaById(areas: MapArea[], id: string): MapArea {
  const found = areas.find((a) => a.id === id);
  if (!found) throw new Error(`unknown map area "${id}"`);
  return found;
}

/** Weighted pick over the palette. */
function rollArea(areas: MapArea[], rng: Rng): MapArea {
  const total = areas.reduce((sum, a) => sum + a.weight, 0);
  let at = rng() * total;
  for (const area of areas) {
    at -= area.weight;
    if (at <= 0) return area;
  }
  return areas[areas.length - 1] as MapArea;
}

/**
 * Assign an area type to every carved cell by GROWING DISTRICTS from seeds.
 *
 * A handful of cells are picked as seeds, each rolls the palette once, and the
 * rest of the map is filled by a simultaneous breadth-first spread from all seeds
 * at once — so every district is a contiguous blob of cells and the mix of
 * districts follows the authored weights.
 *
 * Seeding it this way rather than "each cell inherits a neighbour's type with
 * probability `cluster`" is deliberate, and the difference is not subtle: an
 * inherit-from-neighbour walk COMPOUNDS. Each cell that copies its neighbour
 * makes the copied type more available to the next cell, so whichever type the
 * walk rolled first swallows the map, and at a cluster of 0.6 a palette weighted
 * 4:3:2 comes out as one biome with a couple of freckles. Seeding decouples the
 * two knobs cleanly: `cluster` controls how BIG a district is (how many seeds
 * there are), the weights control WHICH districts appear, and neither distorts
 * the other.
 *
 * @param chambers  the carved cells
 * @param adjacent  cell id → the cells it shares any border with
 * @param areas     the blueprint's area palette
 * @param cluster   0..1 — bigger districts (fewer seeds) as it climbs
 * @param promised  area ids the map is PROMISED — one seed each, taken before
 *                  the weighted roll, so a district something else depends on
 *                  cannot fail to appear. The keyed rooms use it: a map with
 *                  three keycards on three elites has to have three rooms, or a
 *                  card the player fought for opens nothing on that seed.
 * @returns one area id per cell, indexed by cell id
 */
export function assignAreas(
  chambers: Chamber[],
  adjacent: number[][],
  areas: MapArea[],
  cluster: number,
  rng: Rng,
  promised: string[] = [],
): string[] {
  if (chambers.length === 0) return [];
  const clamped = Math.max(0, Math.min(0.95, cluster));
  // How many districts to grow: every cell its own at cluster 0, a handful of
  // large ones as it approaches 1. At least two, or "districts" means nothing.
  const seedCount = Math.max(
    Math.min(2, chambers.length),
    Math.round(chambers.length * (1 - clamped)),
  );
  // Seeds are spread by taking every k-th cell of a shuffled order, which on the
  // carve's row-major-ish cell list keeps them from all landing in one corner.
  const order = chambers.map((c) => c.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  const assigned: (string | null)[] = chambers.map(() => null);
  const queue: number[] = [];
  const pool = seedable(areas);
  // A `once` area is drawn from the palette on its FIRST win and then withdrawn,
  // so the map grows exactly one of it. Rolling it out of the pool (rather than
  // filtering after the fact) keeps the remaining weights meaningful: the seeds a
  // one-off district did not win are still distributed by the authored ratio.
  let live = pool;
  for (let i = 0; i < seedCount; i++) {
    const id = order[i] as number;
    // The PROMISED districts take the first seeds, in order, and are then out of
    // the running: they are the ones something else in the mission depends on
    // existing, so they cannot be left to the odds. Everything after them is the
    // ordinary weighted roll.
    const owed = promised[i];
    const area = owed
      ? (live.find((a) => a.id === owed) ??
        pool.find((a) => a.id === owed) ??
        rollArea(live, rng))
      : rollArea(live, rng);
    assigned[id] = area.id;
    if (area.once) live = live.filter((a) => a !== area);
    // Withdrawing the last entry would leave nothing to roll; the map falls back
    // to the full palette rather than crashing on an empty pool.
    if (live.length === 0) live = pool;
    queue.push(id);
  }
  // Simultaneous spread: every district advances one ring per pass, so two
  // neighbouring districts meet halfway instead of one overrunning the other.
  //
  // A LOCKABLE district does not spread at all, and that is what keeps it a
  // ROOM. It is seeded first (it is promised), so in a simultaneous spread it
  // has the head start and grows fastest — measured, one keyed seed took four of
  // Mars's six cells and the "vault" became most of the map with the mission
  // inside it. A keyed room is a room: one cell, or the couple that happen to
  // adjoin when two keys seed side by side.
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as number;
    if (areaById(areas, assigned[at] as string).lock === true) continue;
    for (const next of adjacent[at] as number[]) {
      if (assigned[next] !== null) continue;
      assigned[next] = assigned[at] as string;
      queue.push(next);
    }
  }
  // A cell the spread never reached (one with no adjacency at all) still needs a
  // type. It takes an ordinary district, never a `once` one — the map already
  // grew its single town, and a stray second one is exactly what `once` is for.
  const leftovers = pool.filter((a) => !a.once && a.lock !== true);
  const fallback = leftovers.length > 0 ? leftovers : pool;
  return assigned.map((t) => t ?? rollArea(fallback, rng).id);
}

/** The areas a district may be seeded as — everything except the pure shells,
 * which only ever appear wrapped around something else. */
export function seedable(areas: MapArea[]): MapArea[] {
  const open = areas.filter((a) => !a.shellOf && a.weight > 0);
  return open.length > 0 ? open : areas;
}
