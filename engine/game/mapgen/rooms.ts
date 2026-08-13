// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CHAMBER GRID — the geometry half of a generated map.
//
// The whole rectangle is split, largest-first, into CELLS that tile it edge to
// edge, each cell is assigned an AREA type (see areas.ts), and then every SHARED
// BORDER between two cells is given a treatment DERIVED from the pair of areas
// either side of it: nothing at all between two open plains, a wide archway into
// a yard, a solid wall with one doorway into a compound. Nothing is left over — a
// generated map has no unreachable filler, because there is no "outside the
// rooms": the cells ARE the map.
//
// WALLS ARE EMITTED PER BORDER, NOT PER SPLIT LINE, and that is the load-bearing
// decision here. A split line spans a whole ancestor rectangle and knows nothing
// about which cells ended up either side of it, so emitting walls from split
// lines produces stubs that jut into open floor and doorways jammed against
// corners — architecture nobody designed. A border knows exactly which two cells
// it separates, so its wall is exactly as long as those two cells are adjacent
// and its doorway sits in the MIDDLE of it. Every wall in a generated map is
// therefore the answer to "what separates these two places", which is what makes
// the result read as built rather than as noise.
//
// The doorway set is a randomized SPANNING TREE over the cell graph — with the
// freely-passable borders (open ground, archways) UNIONED FIRST, so the tree only
// spends doorways where a wall actually blocks the way — plus a share of the
// leftover walls opened as LOOPS, so the map reads as a place instead of a
// decision tree.
//
// Everything here is a pure function of its inputs — no wall clock, no module
// state — so a seed replays the same grid on every device, which is what lets a
// test assert reachability and a bug be reproduced from its seed alone.

import type { Rng } from "@game/lib/rng.ts";
import {
  areaById,
  assignAreas,
  borderEnclosure,
  borderOwner,
  confineAreas,
  type Enclosure,
  type MapArea,
} from "./areas.ts";
import type { MapPlan, MapPrefab } from "./types.ts";

/** One carved cell: an axis-aligned rectangle in world px, plus what it IS. */
export type Chamber = {
  /** Index into the chamber list — the id the cell graph is keyed by. */
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The assigned area palette id (see areas.ts). */
  area: string;
  /**
   * The DISTRICT this cell was cut out of — the coarse cell the area walk
   * assigned, before an interior area was subdivided into rooms
   * (`MapArea.roomSize`).
   *
   * It exists because half the placement pass is priced per DISTRICT and half
   * per ROOM, and once a building's floor is thirty rooms instead of four halls
   * the two stop meaning the same thing: a cache in every dead end is right when
   * a dead end is a district and absurd when it is a broom cupboard. Everything
   * about CONTENT (the scatter, the horde, the ranks) stays per cell; everything
   * about HOW MANY of a thing the map pays for counts districts.
   *
   * Equal to `id` on a map that subdivides nothing, so nothing changes for one.
   */
  district: number;
};

/**
 * How a border between two cells is treated. `open` and `arch` are always
 * passable; a `door` border is passable and carries a punched opening; a `closed`
 * border is a solid wall.
 */
export type BorderLink = "open" | "arch" | "door" | "closed";

/** A shared border between two cells. */
export type Border = {
  a: number;
  b: number;
  /** `v` runs along y at x = `coord`; `h` runs along x at y = `coord`. */
  axis: "v" | "h";
  coord: number;
  /** The overlap of the two cells along the border, `[from, to]`. */
  from: number;
  to: number;
  link: BorderLink;
  /** The `wall` object id this border's barrier is cut from — the material of
   * whichever area owns it (see `borderOwner`). */
  material: string;
  /** The area id that owns it — the one whose enclosure decided there is a wall
   * here at all. It decides the material, the opening width, and whether a real
   * DOOR is hung in that opening (`MapArea.doors`). */
  owner: string;
  /** The opening (world px) punched through it — the owning area's own
   * `doorWidth`, or the blueprint's. */
  door: number;
  /**
   * WHERE the opening sits along the border (its CENTER coordinate), when the
   * doorway was AUTHORED rather than rolled — a PART's door socket is a fact
   * about the room (the kitchen's door is beside the counter, not wherever the
   * overlap's middle lands), so the assembly records the matched socket here.
   * Omitted = the middle of the border, which is what every carved and planned
   * map has always done.
   */
  doorAt?: number;
};

export type ChamberGrid = {
  chambers: Chamber[];
  borders: Border[];
  /** Cell id → the cells it can be WALKED to (open, arch or doored borders). */
  neighbors: number[][];
  /** The STATIC rooms stamped into the carve (see `MapBlueprint.prefabs`) —
   * where each one landed, so the dressing pass can stand its fixed contents in
   * it. Empty on a blueprint that authors none. */
  prefabs: PrefabPlacement[];
};

/** Where one prefab room ended up on this carve. */
export type PrefabPlacement = {
  /** The `prefabs` entry's id. */
  id: string;
  /** The cell it became — its rect is that cell's rect. */
  cell: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** A shared border before its treatment, its material and its owner are
 * decided — pure geometry, which is all `findBorders` can know. */
type RawBorder = Omit<Border, "link" | "material" | "owner" | "door">;

/** A wall run to be expanded into a chain of solid circles. */
export type WallRun = {
  axis: "v" | "h";
  coord: number;
  from: number;
  to: number;
  /** The `wall` object id to build this run from. */
  material: string;
};

/**
 * The OPENING a `door` border leaves in its wall — the span between the two
 * runs either side of it, and the two cells it joins.
 *
 * It exists so a doorway can be SHUT again: a keyed room's gaps are filled back
 * in as `LevelDef.doors` (a chain of `door_locked` circles the matching story
 * item dissolves), and the only honest way to draw that door is across exactly
 * the hole the wall was given.
 */
export type DoorGap = {
  axis: "v" | "h";
  coord: number;
  from: number;
  to: number;
  /** The cells either side, so a caller can ask whether one of them is sealed. */
  a: number;
  b: number;
  /** The area that owns the wall this hole is in — whose `doors` entry, if it
   * has one, is the door hung across it. */
  owner: string;
  /** The wall's own radius scale: the opening width it was cut to. */
  width: number;
};

/** Where a `door` border's opening sits: the authored socket when a PART said
 * so (`doorAt`, clamped so the hole stays inside the border), else the MIDDLE
 * of the border — the one placement that leaves matching walls either side
 * instead of a corner sliver. Shared by the wall runs and the door gaps so the
 * two can never disagree about where the hole is. */
function doorwaySpan(border: Border): { from: number; to: number } {
  const half = border.door / 2;
  const mid =
    border.doorAt !== undefined
      ? Math.min(border.to - half, Math.max(border.from + half, border.doorAt))
      : (border.from + border.to) / 2;
  return { from: mid - half, to: mid + half };
}

/**
 * Every doorway the grid punched through a wall, as a span.
 *
 * Only `door` borders have one: an `open` border is not a wall at all and an
 * `arch` is a gateway too wide to hang a door in — which is also why an area is
 * only lockable when it is sealed `hard` (see `MapArea.lock`).
 */
export function doorGaps(grid: ChamberGrid): DoorGap[] {
  const out: DoorGap[] = [];
  for (const border of grid.borders) {
    if (border.link !== "door") continue;
    const span = doorwaySpan(border);
    out.push({
      axis: border.axis,
      coord: border.coord,
      from: span.from,
      to: span.to,
      a: border.a,
      b: border.b,
      owner: border.owner,
      width: border.door,
    });
  }
  return out;
}

/** The cell centre — where a knot, a set piece or a chest is anchored. */
export function chamberCenter(c: Chamber): { x: number; y: number } {
  return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
}

/**
 * How wide an ARCHWAY's opening is, as a multiple of the doorway width, and the
 * share of the border it may take at most.
 *
 * An archway has to read as a WALL WITH A GATE, which means the wall either side
 * has to be the bigger part of it. Sizing the opening as a share of the border
 * (the obvious first try) gets that backwards on a long border: a quarter-stub at
 * each end of a 700px border is two 170px fragments flanking a 360px hole, which
 * on screen is not a fence, it is two lumps of rock. Sizing the OPENING instead —
 * a fixed multiple of a doorway, capped so it never eats a short border whole —
 * keeps the stubs growing with the border and the gate always reading as a gate.
 */
const ARCH_GATE_DOORS = 1.7;
const ARCH_GATE_MAX_SHARE = 0.45;

/**
 * The narrowest stretch of OPEN border that is a way through rather than a
 * crack between two walls (world px).
 *
 * Measured off a body and the grid that routes it, not off a doorway: the hero
 * is 20 across (`PLAYER.radius`), and the autopilot's nav grid resolves at
 * `NAV_CELL` = 40, so a gap that cannot spare a couple of cells is somewhere
 * nothing can be routed through even when the geometry technically allows it.
 */
const MIN_WALKABLE = 80;

/**
 * Split the map rectangle into `target` cells, largest-first.
 *
 * Largest-first (rather than the usual recursive BSP descent) is what keeps the
 * cells EVEN: a recursive split halves an already-small cell as eagerly as a
 * huge one, which on a three-cell-wide map yields one hall and a row of closets.
 * Splitting whichever cell is currently biggest converges on a set of rooms that
 * are all roughly a fight's worth of floor. The cut lands anywhere that leaves
 * both halves at least `minRoom` across, so no two runs share a grid.
 */
function carve(
  width: number,
  height: number,
  target: number,
  minRoom: number,
  rng: Rng,
): { x: number; y: number; w: number; h: number }[] {
  const rects = [{ x: 0, y: 0, w: width, h: height }];
  while (rects.length < target) {
    let pick = -1;
    let bestArea = 0;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i] as { x: number; y: number; w: number; h: number };
      // Splittable at all? A cell must be able to give both halves `minRoom`.
      if (r.w < minRoom * 2 && r.h < minRoom * 2) continue;
      const area = r.w * r.h;
      if (area > bestArea) {
        bestArea = area;
        pick = i;
      }
    }
    // Every cell is at its floor — the requested count simply does not fit this
    // rectangle, which is a valid outcome: the size spec asked for more cells
    // than `minRoom` allows and the grid stops where the geometry does.
    if (pick < 0) break;
    const r = rects.splice(pick, 1)[0] as {
      x: number;
      y: number;
      w: number;
      h: number;
    };
    // Cut across the LONGER axis so cells stay squarish; fall back to the other
    // when only one axis has the room.
    const vertical = r.w >= minRoom * 2 && (r.h < minRoom * 2 || r.w >= r.h);
    const span = vertical ? r.w : r.h;
    const cut = Math.round(minRoom + rng() * (span - minRoom * 2));
    if (vertical) {
      rects.push(
        { x: r.x, y: r.y, w: cut, h: r.h },
        { x: r.x + cut, y: r.y, w: r.w - cut, h: r.h },
      );
    } else {
      rects.push(
        { x: r.x, y: r.y, w: r.w, h: cut },
        { x: r.x, y: r.y + cut, w: r.w, h: r.h - cut },
      );
    }
  }
  return rects;
}

/**
 * Every pair of cells that shares a border, with the exact span they share.
 *
 * EVERY overlap is reported, however thin, because a border is what a wall is
 * built from: skipping a sliver would leave an unexplained hole in a compound's
 * wall. Whether the border is wide enough to take a DOORWAY is a separate
 * question, answered by `doorable` below.
 */
function findBorders(
  cells: { x: number; y: number; w: number; h: number }[],
): RawBorder[] {
  const out: RawBorder[] = [];
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i] as { x: number; y: number; w: number; h: number };
    for (let j = i + 1; j < cells.length; j++) {
      const b = cells[j] as { x: number; y: number; w: number; h: number };
      // A vertical border: one cell's right edge is the other's left edge.
      const vertical =
        a.x + a.w === b.x ? a.x + a.w : b.x + b.w === a.x ? a.x : null;
      if (vertical !== null) {
        const from = Math.max(a.y, b.y);
        const to = Math.min(a.y + a.h, b.y + b.h);
        if (to > from)
          out.push({ a: i, b: j, axis: "v", coord: vertical, from, to });
        continue;
      }
      const horizontal =
        a.y + a.h === b.y ? a.y + a.h : b.y + b.h === a.y ? a.y : null;
      if (horizontal !== null) {
        const from = Math.max(a.x, b.x);
        const to = Math.min(a.x + a.w, b.x + b.w);
        if (to > from)
          out.push({ a: i, b: j, axis: "h", coord: horizontal, from, to });
      }
    }
  }
  return out;
}

/** Fisher-Yates over the seeded stream — the shuffle the spanning tree walks. */
function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Union-find over the cells, path-compressed so it stays flat over a few
 * hundred of them. */
function unionFind(count: number) {
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] as number;
    let walk = i;
    while (parent[walk] !== root) {
      const next = parent[walk] as number;
      parent[walk] = root;
      walk = next;
    }
    return root;
  };
  return {
    find,
    /** Join two cells; false if they were already connected. */
    join(a: number, b: number): boolean {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return false;
      parent[ra] = rb;
      return true;
    },
  };
}

/**
 * Carve a chamber grid: split the rectangle, assign an area type to every cell,
 * derive each border's treatment from the pair of areas it separates, and open
 * exactly the doorways the map needs to be walkable.
 *
 * @param width      map width (world px)
 * @param height     map height (world px)
 * @param target     how many cells to aim for (geometry may allow fewer)
 * @param minRoom    smallest cell edge (world px)
 * @param doorWidth  doorway opening (world px) punched through a solid wall
 * @param loopDoors  share of the leftover walls opened as extra doors (0..1)
 * @param areas      the blueprint's area palette
 * @param cluster    0..1 — how strongly a cell prefers a neighbour's area type
 * @param defaultWall the `wall` object id an area with no `wall` of its own uses
 * @param rng        the seeded stream — same seed, same grid
 * @param promised   districts the map must grow whatever the weights roll (see
 *                   `assignAreas`) — the keyed rooms, one per key
 */
/**
 * AUTHORED CHAMBERS — a static venue's floor plan, drawn instead of grown
 * (see `MapBlueprint.plan`). The rooms come in with their areas already
 * named; the borders are found exactly as the carve finds them, and their
 * treatment is DERIVED from the areas' enclosures by the same rule — with
 * one difference: which hard border carries a doorway is AUTHORED (`doors`
 * names the area pairs) rather than rolled by a spanning tree. No rng at
 * all: a plan is a picture, and it comes out the same picture every time.
 */
export function planChambers(
  plan: MapPlan,
  areas: MapArea[],
  doorWidth: number,
  defaultWall: string,
): ChamberGrid {
  const chambers: Chamber[] = plan.rooms.map((room, id) => ({
    id,
    x: room.rect.x,
    y: room.rect.y,
    w: room.rect.width,
    h: room.rect.height,
    area: room.area,
    // A drawn room IS its own district: nothing subdivides a plan, because the
    // author already drew every room they wanted.
    district: id,
  }));
  const raw = findBorders(chambers);
  const areaOf = (id: number): MapArea =>
    areaById(areas, (chambers[id] as Chamber).area);
  const wantsDoor = (a: number, b: number): boolean =>
    (plan.doors ?? []).some(
      (d) =>
        (d.between[0] === (chambers[a] as Chamber).area &&
          d.between[1] === (chambers[b] as Chamber).area) ||
        (d.between[1] === (chambers[a] as Chamber).area &&
          d.between[0] === (chambers[b] as Chamber).area),
    );
  const borders: Border[] = raw.map((border) => {
    const strength = borderEnclosure(
      areaOf(border.a).enclosure,
      areaOf(border.b).enclosure,
    );
    const link: BorderLink =
      strength === "none"
        ? "open"
        : wantsDoor(border.a, border.b)
          ? strength === "soft"
            ? "arch"
            : "door"
          : "closed";
    const owner = borderOwner(areaOf(border.a), areaOf(border.b), areas);
    return {
      ...border,
      link,
      material: owner.wall ?? defaultWall,
      owner: owner.id,
      door: owner.doorWidth ?? doorWidth,
    };
  });
  const neighbors: number[][] = chambers.map(() => []);
  for (const b of borders) {
    if (b.link === "closed") continue;
    (neighbors[b.a] as number[]).push(b.b);
    (neighbors[b.b] as number[]).push(b.a);
  }
  return { chambers, borders, neighbors, prefabs: [] };
}

/** A cell mid-carve: a rect that knows its district and whether anything is
 * still allowed to cut it up. */
type Cut = {
  x: number;
  y: number;
  w: number;
  h: number;
  area: string;
  district: number;
  /** A PREFAB room — drawn, not grown, so the room carve leaves it alone. */
  prefab?: string;
};

/**
 * The smallest leftover a prefab may cut an OPEN district down to.
 *
 * An enclosed district's leftovers are ROOMS, and a room has to be able to hold
 * a doorway or it seals itself — so there the floor is the same `doorWidth * 2`
 * the carve already uses to decide whether a border can be opened at all. Open
 * ground has no walls and no doorways, so its cells are an accounting fiction: a
 * thin strip of car park beside a prefab is not a thin room, it is car park, and
 * holding it to a room's floor is what would stop a small map having its parking
 * bays at all.
 */
const OPEN_LEFTOVER = 120;

/**
 * Cut one PREFAB room out of a district it belongs in (see `MapBlueprint.prefabs`).
 *
 * The cut is a GUILLOTINE from a rolled corner: the room itself, the full-depth
 * strip beside it, and what is left above or below it. Three rects that tile the
 * host exactly — which is the whole reason it is done here rather than by
 * dropping a rect on top of the grid later. A generated map has no "outside the
 * rooms"; a prefab stamped over one would leave a rectangle of floor that no
 * cell owns, with no wall around it and no border to derive one from, and every
 * pass downstream would dress straight through it.
 *
 * @returns whether it was placed — a carve too small to give one a corner
 *   simply does not have that room this run, which is the honest outcome and
 *   the reason nothing the mission NEEDS may live in a prefab.
 */
function stampPrefab(
  cells: Cut[],
  prefab: MapPrefab,
  areas: MapArea[],
  doorWidth: number,
  rng: Rng,
): boolean {
  // A leftover is either NOTHING (the prefab took the whole span, and the room
  // simply replaces the cell) or big enough to be a place in its own right.
  // Anything between the two is a sliver, which indoors is a corridor with no
  // door and outdoors is a seam.
  const leftoverOk = (slack: number, keep: number): boolean =>
    slack === 0 || slack >= keep;
  const candidates: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const host = cells[i] as Cut;
    if (host.prefab !== undefined) continue;
    if (!prefab.in.includes(host.area)) continue;
    const area = areaById(areas, host.area);
    const keep =
      area.enclosure === "none"
        ? OPEN_LEFTOVER
        : (area.doorWidth ?? doorWidth) * 2;
    const slackX = host.w - prefab.width;
    const slackY = host.h - prefab.height;
    if (slackX < 0 || slackY < 0) continue;
    if (!leftoverOk(slackX, keep) || !leftoverOk(slackY, keep)) continue;
    candidates.push(i);
  }
  if (candidates.length === 0) return false;
  const at = candidates[Math.floor(rng() * candidates.length)] as number;
  const host = cells[at] as Cut;
  // A rolled corner, so the same room is not always in the same part of the
  // same kind of district — the ROOM is what the player learns, not the walk.
  const east = rng() < 0.5;
  const south = rng() < 0.5;
  const px = east ? host.x + host.w - prefab.width : host.x;
  const py = south ? host.y + host.h - prefab.height : host.y;
  const room: Cut = {
    x: px,
    y: py,
    w: prefab.width,
    h: prefab.height,
    area: prefab.area,
    district: host.district,
    prefab: prefab.id,
  };
  const beside: Cut = {
    ...host,
    x: east ? host.x : px + prefab.width,
    w: host.w - prefab.width,
  };
  const over: Cut = {
    ...host,
    x: px,
    y: south ? host.y : py + prefab.height,
    w: prefab.width,
    h: host.h - prefab.height,
  };
  // A leftover of zero is not a cell — the prefab took that whole span.
  cells.splice(
    at,
    1,
    room,
    ...[beside, over].filter((c) => c.w > 0 && c.h > 0),
  );
  return true;
}

/**
 * Cut one interior district into ROOMS of at least `size` across (see
 * `MapArea.roomSize`) — the same largest-first split the map itself is carved
 * with, so the rooms come out even rather than as one hall and a row of closets.
 *
 * The floor is priced at two minimum rooms apiece: `size` is the SMALLEST a room
 * may be, and a target that assumed every room would be exactly that leaves the
 * split no slack and comes out as a grid. At 2× the rooms vary, and the smallest
 * of them is still a room.
 */
function subdivide(cell: Cut, size: number, rng: Rng): Cut[] {
  const target = Math.max(2, Math.round((cell.w * cell.h) / (size * size * 2)));
  const parts = carve(cell.w, cell.h, target, size, rng);
  if (parts.length <= 1) return [cell];
  return parts.map((r) => ({
    ...cell,
    x: cell.x + r.x,
    y: cell.y + r.y,
    w: r.w,
    h: r.h,
  }));
}

export function carveChambers(
  width: number,
  height: number,
  target: number,
  minRoom: number,
  doorWidth: number,
  loopDoors: number,
  areas: MapArea[],
  cluster: number,
  defaultWall: string,
  rng: Rng,
  promised: string[] = [],
  prefabs: MapPrefab[] = [],
): ChamberGrid {
  // --- 1. THE DISTRICTS -----------------------------------------------------
  // The coarse carve: what KIND of place goes where. Nothing here knows about
  // rooms yet, because a district's type has to be settled before anything can
  // ask whether it is the sort of place that HAS rooms.
  const districts = carve(width, height, target, minRoom, rng);
  const districtBorders = findBorders(districts);

  // Raw adjacency (every shared border, walled or not) — what the area walk
  // clusters over, so a district is a district regardless of how it is fenced.
  const adjacent: number[][] = districts.map(() => []);
  for (const border of districtBorders) {
    (adjacent[border.a] as number[]).push(border.b);
    (adjacent[border.b] as number[]).push(border.a);
  }
  const confine = confineAreas(areas, width, height, rng);
  const cellAreas = assignAreas(
    districts.map((c, id) => ({ id, ...c, area: "", district: id })),
    adjacent,
    areas,
    cluster,
    rng,
    promised,
    confine,
  );

  // --- 2. THE STATIC ROOMS --------------------------------------------------
  // A prefab is cut out of a DISTRICT, before the room carve, so it takes its
  // corner out of a whole hall rather than out of whichever closet the split
  // happened to leave. Everything it does not take is carved as usual.
  let cut: Cut[] = districts.map((c, id) => ({
    ...c,
    area: cellAreas[id] as string,
    district: id,
  }));
  for (const prefab of prefabs) stampPrefab(cut, prefab, areas, doorWidth, rng);

  // --- 3. THE ROOMS ---------------------------------------------------------
  // …and an interior district is carved a second time, into rooms (see
  // `MapArea.roomSize`). They all wear the district's own area, so every
  // dressing pass downstream is unchanged; what changes is that there are now
  // walls and doorways between them.
  cut = cut.flatMap((c) => {
    if (c.prefab !== undefined) return [c];
    const size = areaById(areas, c.area).roomSize;
    return size !== undefined ? subdivide(c, size, rng) : [c];
  });

  const chambers: Chamber[] = cut.map((c, id) => ({
    id,
    x: c.x,
    y: c.y,
    w: c.w,
    h: c.h,
    area: c.area,
    district: c.district,
  }));
  const placed: PrefabPlacement[] = [];
  cut.forEach((c, id) => {
    if (c.prefab === undefined) return;
    placed.push({ id: c.prefab, cell: id, x: c.x, y: c.y, w: c.w, h: c.h });
  });
  const raw = findBorders(chambers);

  const areaOf = (id: number): MapArea =>
    areaById(areas, chambers[id]?.area ?? "");
  const enclosureOf = (id: number): Enclosure => areaOf(id).enclosure;
  // The material is the OWNING area's, decided the same way the treatment is: the
  // stronger enclosure wins, so a dome's seam is dome panel even where it abuts
  // open ground built of rubble — and so is the WIDTH of the hole cut in it,
  // because a bay's roll-up and a cupboard's door are not the same opening.
  const ownerOf = (a: number, b: number): MapArea =>
    borderOwner(areaOf(a), areaOf(b), areas);
  // THE OPENING IS THE SMALLER ROOM'S, which is the one rule here that is not
  // the owner's. A wall's MATERIAL belongs to whichever district raised it — a
  // dome's seam is dome panel wherever it runs — but the size of the hole in it
  // is decided by what has to get through, and that is the humbler of the two
  // sides: the door between an assembly hangar and a broom cupboard is a
  // cupboard door, in this building and in every real one. Taking the owner's
  // instead put roller shutters on the cleaning store.
  const openingOf = (a: number, b: number): number =>
    Math.min(
      areaOf(a).doorWidth ?? doorWidth,
      areaOf(b).doorWidth ?? doorWidth,
    );

  // Every border's treatment, before connectivity: the stronger of the two
  // areas' enclosures, downgraded to a solid wall when the border is too short
  // to hold the opening that treatment implies.
  const link = new Map<RawBorder, BorderLink>();
  for (const border of raw) {
    const span = border.to - border.from;
    const strength = borderEnclosure(
      enclosureOf(border.a),
      enclosureOf(border.b),
    );
    // A doorway needs the opening itself plus half of one clear at each end, so
    // it never opens flush into a corner.
    const opening = openingOf(border.a, border.b);
    const doorSpan = opening * 2;
    // …AND OPEN GROUND HAS A MINIMUM TOO, which is not obvious and was wrong for
    // a long time. Two cells of one open district have no wall between them, so
    // ANY overlap read as a way through — including the thirty-pixel slivers the
    // carve leaves where two independent splits landed near each other
    // (`coalesce` already knew about those). A sliver is a gap between two walls,
    // not a route: nothing can walk it, and counting it as an edge told the
    // vault picker that a car park with a keyed room on one side and a hall on
    // the other was still connected round the back, which sealed the mission
    // behind a keycard on one goodco seed in eight.
    //
    // The floor is a BODY's rather than a doorway's: open ground has no
    // doorways, and its `doorWidth` may be anything or nothing at all.
    if (strength === "none")
      link.set(border, span >= MIN_WALKABLE ? "open" : "closed");
    else if (strength === "soft")
      link.set(border, span >= doorSpan ? "arch" : "closed");
    else link.set(border, span >= doorSpan ? "door" : "closed");
  }

  // A ROOM WITH NO WAY IN IS NOT A ROOM. Every border above is downgraded to a
  // solid wall when it is too short to hold the opening its treatment implies,
  // and a cell every one of whose borders is too short is sealed for good — the
  // spanning tree below can only open a border that is already a `door`, so it
  // cannot rescue one. On district-sized cells that was a theoretical worry; on
  // ROOMS (`MapArea.roomSize`) it is a real one, because a room is only a couple
  // of doorways wide and two of them can overlap by very little.
  //
  // So a cell with nothing openable takes its LONGEST border regardless. The
  // opening is then wider than the border can hold, which `wallSegments` renders
  // as the honest thing: no wall along it at all — an opening rather than a
  // doorway, which is what a gap that narrow is anyway.
  const openable = chambers.map(() => false);
  for (const border of raw) {
    if (link.get(border) === "closed") continue;
    openable[border.a] = true;
    openable[border.b] = true;
  }
  for (const c of chambers) {
    if (openable[c.id]) continue;
    let widest: RawBorder | null = null;
    for (const border of raw) {
      if (border.a !== c.id && border.b !== c.id) continue;
      if (!widest || border.to - border.from > widest.to - widest.from)
        widest = border;
    }
    if (!widest) continue;
    link.set(widest, "door");
    openable[widest.a] = true;
    openable[widest.b] = true;
  }

  // Connectivity. The freely-passable borders are unioned FIRST: open ground and
  // archways already join their cells, so the spanning tree spends doorways only
  // where a solid wall is genuinely in the way — which is why a map of open
  // plains does not end up pointlessly perforated.
  const uf = unionFind(chambers.length);
  for (const border of raw) {
    const kind = link.get(border);
    if (kind === "open" || kind === "arch") uf.join(border.a, border.b);
  }
  const walls = shuffle(
    raw.filter((b) => link.get(b) === "door"),
    rng,
  );
  const spare: RawBorder[] = [];
  for (const border of walls) {
    if (uf.join(border.a, border.b)) continue;
    spare.push(border);
  }
  // The rest stay shut, except a share reinstated as loops.
  const loops = Math.round(spare.length * Math.max(0, Math.min(1, loopDoors)));
  const opened = new Set(spare.slice(0, loops));
  for (const border of spare)
    if (!opened.has(border)) link.set(border, "closed");

  const borders: Border[] = raw.map((b) => {
    const owner = ownerOf(b.a, b.b);
    return {
      ...b,
      link: link.get(b) as BorderLink,
      material: owner.wall ?? defaultWall,
      owner: owner.id,
      door: owner.doorWidth ?? doorWidth,
    };
  });
  const neighbors: number[][] = chambers.map(() => []);
  for (const border of borders) {
    if (border.link === "closed") continue;
    (neighbors[border.a] as number[]).push(border.b);
    (neighbors[border.b] as number[]).push(border.a);
  }
  return { chambers, borders, neighbors, prefabs: placed };
}

/**
 * The grid's walls as runs to expand into chains of solid circles — one run per
 * stretch of border that is actually blocked.
 *
 * Because a run is clipped to the exact span two cells share, and the spans along
 * one split line tile it end to end, a wall that continues past a doorway
 * continues as one straight line with a hole in it; and a wall that STOPS does so
 * because the ground either side of it stopped being two different kinds of
 * place. There are no orphan stubs to explain.
 */
export function wallSegments(grid: ChamberGrid): WallRun[] {
  const out: WallRun[] = [];
  const run = (b: Border, from: number, to: number) => {
    if (to - from < 1) return;
    out.push({
      axis: b.axis,
      coord: b.coord,
      from,
      to,
      material: b.material,
    });
  };
  for (const border of grid.borders) {
    switch (border.link) {
      case "open":
        break;
      case "arch": {
        // A fence with a broad gate in the middle — wider than a doorway, but
        // never more than a share of the border, so the wall stays the bigger part.
        const gate = Math.min(
          border.door * ARCH_GATE_DOORS,
          (border.to - border.from) * ARCH_GATE_MAX_SHARE,
        );
        const mid = (border.from + border.to) / 2;
        run(border, border.from, mid - gate / 2);
        run(border, mid + gate / 2, border.to);
        break;
      }
      case "door": {
        const gap = doorwaySpan(border);
        run(border, border.from, gap.from);
        run(border, gap.to, border.to);
        break;
      }
      case "closed":
        run(border, border.from, border.to);
        break;
    }
  }
  return coalesce(out);
}

/**
 * Merge wall runs that lie on the same line and touch, so one wall is ONE run.
 *
 * Two things make this necessary rather than cosmetic. A long wall crossed by
 * several cell borders is emitted as one run per border, and left alone it comes
 * out as a row of separate stones with seams. And the carve can leave two cells
 * sharing only a sliver of border — thirty pixels where two independent splits
 * landed near each other — which alone is an absurd little wall standing in the
 * open, but merged into the collinear run beside it is simply part of that wall.
 * Both cases are the same fix: sort by line, then sweep and join anything that
 * overlaps or abuts.
 */
function coalesce(runs: WallRun[]): WallRun[] {
  const sorted = runs
    .slice()
    .sort(
      (a, b) =>
        a.material.localeCompare(b.material) ||
        a.axis.localeCompare(b.axis) ||
        a.coord - b.coord ||
        a.from - b.from,
    );
  const out: WallRun[] = [];
  for (const seg of sorted) {
    const last = out[out.length - 1];
    // Same MATERIAL as well as the same line: a dome panel and a rubble spine may
    // be collinear where a district ends, and merging them would build one out of
    // the other's stones.
    if (
      last &&
      last.material === seg.material &&
      last.axis === seg.axis &&
      last.coord === seg.coord &&
      seg.from <= last.to + 1
    ) {
      last.to = Math.max(last.to, seg.to);
      continue;
    }
    out.push({ ...seg });
  }
  return out;
}

/**
 * Doorway distance from `start` to every cell (breadth-first over the walkable
 * cell graph), `Infinity` for anything the graph cannot reach — which the
 * spanning tree means is nothing, and which a test asserts rather than assumes.
 *
 * This is the DEPTH axis the whole placement pass reads: how far into the search
 * a cell sits, in the only unit that matters to a player walking it — how many
 * rooms they had to cross to get here.
 */
export function doorDistances(grid: ChamberGrid, start: number): number[] {
  const dist = grid.chambers.map(() => Infinity);
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as number;
    const step = (dist[at] as number) + 1;
    for (const next of grid.neighbors[at] as number[]) {
      if ((dist[next] as number) <= step) continue;
      dist[next] = step;
      queue.push(next);
    }
  }
  return dist;
}
