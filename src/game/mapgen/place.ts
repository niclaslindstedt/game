// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRESSING PASS — everything a carved grid gets covered in: the walls cut
// from the blueprint's wall material, the scatter lines for its props, the
// structures that stand in its districts, and the mission's own pickups and
// hazards re-anchored onto the new geometry.
//
// The one idea running through all of it is that a prop belongs to a KIND OF
// PLACE, not to a coordinate. A blueprint object may name the AREA types it
// belongs in (`areas`), and the scatter line it compiles to carries a `within`
// restriction built from exactly those cells' rectangles — so the cactus stays
// out on the hardpan, the crates stay inside the compound, and walking from one
// district to the next looks like walking somewhere. Counts come from a DENSITY
// against the restricted floor rather than a fixed number, because a blueprint
// is carved at three sizes and a fixed count would leave LARGE bare.
//
// `generate.ts` owns the decisions (where the boss is, where the hero lands, how
// deep each cell sits); this file owns the consequences.

import { randomRange, type Rng } from "@game/lib/rng.ts";
import { vec, type Vec2 } from "@game/lib/vec.ts";
import type { TileSpec } from "../types/index.ts";
import type { LevelDef } from "../defs/levels/types.ts";
import type { Zone } from "../zones.ts";
import type { Chamber, ChamberGrid, WallRun } from "./rooms.ts";
import { areaById } from "./areas.ts";
import type { MapBlueprint, MapObject } from "./types.ts";

/** A world rect in the ground plane. */
type Rect = { x: number; y: number; width: number; height: number };

/** Scatter density is authored per this much floor (see `MapObject.density`). */
const DENSITY_AREA = 1_000_000;

/**
 * The ground-tile size the renderer paints on, mirrored here because a regional
 * ground override is resolved PER TILE: `groundTileName` asks whether a tile's
 * ORIGIN falls inside a zone rect, so a zone whose edge lands mid-tile leaves that
 * whole row of tiles outside it. Carved cell edges are arbitrary integers, so
 * without snapping, a dome came out with a stripe of bare Mars dust between its
 * wall and its floor — the tiles the wall stands on belonged to no zone.
 *
 * Kept in step with `TILE` in `pwa/src/game/render/shared.ts`.
 */
const GROUND_TILE = 16;

/**
 * Grow a rect out to the ground-tile grid, so every tile it touches at all is
 * inside it. Outward rather than inward on purpose: a district's floor reaching a
 * few pixels under its own wall is invisible, where stopping a few pixels short of
 * it is the stripe described above.
 */
function snapToTiles(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.floor(rect.x / GROUND_TILE) * GROUND_TILE);
  const y = Math.max(0, Math.floor(rect.y / GROUND_TILE) * GROUND_TILE);
  // Clamped to the map: a cell on the far edge already ends exactly at the map's
  // width, and rounding UP from there would claim ground that does not exist —
  // which the level checker rightly rejects.
  const right = Math.min(
    width,
    Math.ceil((rect.x + rect.width) / GROUND_TILE) * GROUND_TILE,
  );
  const bottom = Math.min(
    height,
    Math.ceil((rect.y + rect.height) / GROUND_TILE) * GROUND_TILE,
  );
  return { x, y, width: right - x, height: bottom - y };
}

/** Keep a placement this far inside a cell's walls (world px). */
export const WALL_INSET = 90;

/** A random point inside a cell, held `inset` off its walls. */
export function pointIn(c: Chamber, rng: Rng, inset = WALL_INSET): Vec2 {
  const ix = Math.min(inset, c.w / 2 - 8);
  const iy = Math.min(inset, c.h / 2 - 8);
  return vec(
    Math.round(randomRange(rng, c.x + ix, c.x + c.w - ix)),
    Math.round(randomRange(rng, c.y + iy, c.y + c.h - iy)),
  );
}

/** The cell rectangle as a `Zone`, for a `within` restriction. */
function chamberRect(c: Chamber): Zone {
  return { shape: "rect", rect: { x: c.x, y: c.y, width: c.w, height: c.h } };
}

/**
 * The SHELL BAND of an area: the strip of floor just inside the outer boundary of
 * every district of `shellOf`, `width` world px deep — the outer dome wrapped
 * around the inner one.
 *
 * "Outer boundary" means every cell edge that faces something ELSE: a cell of a
 * different area, or the edge of the map. Edges between two cells of the same
 * district are interior and get no band, which is what makes a nine-cell dome read
 * as one dome with one shell rather than as nine domes stacked together.
 */
export function shellRects(
  grid: ChamberGrid,
  of: string,
  width: number,
): Rect[] {
  const out: Rect[] = [];
  const inner = grid.chambers.filter((c) => c.area === of);
  const sameDistrict = new Map<number, Set<number>>();
  for (const border of grid.borders) {
    const a = grid.chambers[border.a];
    const b = grid.chambers[border.b];
    if (!a || !b || a.area !== of || b.area !== of) continue;
    if (!sameDistrict.has(a.id)) sameDistrict.set(a.id, new Set());
    if (!sameDistrict.has(b.id)) sameDistrict.set(b.id, new Set());
    // Record the SPAN each interior border covers, so a cell that is only partly
    // backed by its own district still gets a band along the rest of that side.
    (sameDistrict.get(a.id) as Set<number>).add(border.b);
    (sameDistrict.get(b.id) as Set<number>).add(border.a);
  }
  const covered = (c: Chamber, side: "l" | "r" | "t" | "b"): Rect[] => {
    // The stretches of this side that face another cell of the SAME district.
    const spans: [number, number][] = [];
    for (const border of grid.borders) {
      const other = border.a === c.id ? border.b : border.b === c.id ? border.a : null;
      if (other === null) continue;
      const o = grid.chambers[other];
      if (!o || o.area !== of) continue;
      const vertical = border.axis === "v";
      const matches =
        (side === "l" && vertical && border.coord === c.x) ||
        (side === "r" && vertical && border.coord === c.x + c.w) ||
        (side === "t" && !vertical && border.coord === c.y) ||
        (side === "b" && !vertical && border.coord === c.y + c.h);
      if (matches) spans.push([border.from, border.to]);
    }
    // Subtract those stretches from the side's full extent.
    const lo = side === "l" || side === "r" ? c.y : c.x;
    const hi = side === "l" || side === "r" ? c.y + c.h : c.x + c.w;
    spans.sort((p, q) => p[0] - q[0]);
    const gaps: [number, number][] = [];
    let cursor = lo;
    for (const [from, to] of spans) {
      if (from > cursor) gaps.push([cursor, from]);
      cursor = Math.max(cursor, to);
    }
    if (cursor < hi) gaps.push([cursor, hi]);
    return gaps
      .filter(([from, to]) => to - from > 1)
      .map(([from, to]) =>
        side === "l"
          ? { x: c.x, y: from, width, height: to - from }
          : side === "r"
            ? { x: c.x + c.w - width, y: from, width, height: to - from }
            : side === "t"
              ? { x: from, y: c.y, width: to - from, height: width }
              : { x: from, y: c.y + c.h - width, width: to - from, height: width },
      );
  };
  for (const c of inner)
    for (const side of ["l", "r", "t", "b"] as const)
      out.push(...covered(c, side));
  return out;
}

/** Spread `count` picks evenly over an ordered cell list (never empty). */
export function spread(pool: Chamber[], count: number): Chamber[] {
  if (pool.length === 0 || count <= 0) return [];
  const out: Chamber[] = [];
  for (let i = 0; i < count; i++)
    out.push(pool[Math.floor((i * pool.length) / count)] as Chamber);
  return out;
}

/** A circular zone covering most of a cell — a district-sized design zone. */
export function chamberZone(c: Chamber, label: string): Zone {
  return {
    shape: "circle",
    pos: { x: c.x + c.w / 2, y: c.y + c.h / 2 },
    radius: Math.round(Math.min(c.w, c.h) * 0.42),
    label,
  };
}

/**
 * How many placements a density asks for over `area` world px².
 *
 * The remainder is settled STOCHASTICALLY off the layout stream rather than
 * rounded: a density that works out to 0.3 buildings per cell must mean "one cell
 * in three has one", not "every cell has one" (what rounding up gives) and not
 * "none ever" (what rounding down gives). Over a whole map the counts come out at
 * the authored density either way, and drawing from the seeded stream keeps it
 * deterministic.
 */
export function densityCount(
  density: number | undefined,
  area: number,
  rng: Rng,
): number {
  if (!density) return 0;
  const exact = (density * area) / DENSITY_AREA;
  const whole = Math.floor(exact);
  return whole + (rng() < exact - whole ? 1 : 0);
}

/**
 * The cells a prop is allowed in, and their combined floor area.
 *
 * An object with no `areas` list belongs everywhere, and gets NO `within`
 * restriction at all — which matters beyond tidiness: an unrestricted line skips
 * the containment test on every placement attempt, and the whole-map case is the
 * common one.
 */
function districtOf(
  bp: MapBlueprint,
  grid: ChamberGrid,
  areas: string[] | undefined,
): { within?: Zone[]; area: number } {
  const total = grid.chambers.reduce((sum, c) => sum + c.w * c.h, 0);
  if (!areas || areas.length === 0) return { area: total };
  const zones: Zone[] = [];
  let area = 0;
  for (const id of areas) {
    const spec = areaById(bp.areas, id);
    if (spec.shellOf) {
      // A shell owns no cells — its region is the band, and props that name it
      // scatter into that band.
      for (const rect of shellRects(grid, spec.shellOf, spec.shellWidth ?? 120)) {
        zones.push({ shape: "rect", rect });
        area += rect.width * rect.height;
      }
      continue;
    }
    for (const c of grid.chambers) {
      if (c.area !== id) continue;
      zones.push(chamberRect(c));
      area += c.w * c.h;
    }
  }
  return { within: zones, area };
}

/**
 * The level's ground, with one REGIONAL OVERRIDE per cell whose area declares its
 * own floor — compiled into `TileSpec.zones`, the mechanism the hand-authored maps
 * already use to hand martian dust over to deck plating inside a base.
 *
 * This is what makes the districts legible, and legibility is not decoration
 * here: the walls of a generated map are derived from where one kind of place
 * meets another, so if every cell has the same floor, a compound's wall reads as
 * an arbitrary stub of rock standing in an empty plain. Change the ground
 * underfoot and the same wall obviously encloses somewhere.
 *
 * Cells whose area declares no ground are simply left out of the list, so they
 * fall through to the mission's own level-wide tiles — and when NO area declares
 * one, the mission's `tiles` are handed back untouched.
 *
 * It is the right tool INDOORS, where a district really does have its own floor
 * (deck plating inside a base, carpet through a wing) and the rectangle is a room.
 * Outdoors it is usually the wrong one: the override region is axis-aligned, so on
 * an open plain the seam reads as tiling rather than as terrain. That is a
 * judgement each blueprint makes for itself — see the note in
 * `content/maps/moon.yaml`, which deliberately declines it.
 */
export function buildTiles(
  base: LevelDef,
  bp: MapBlueprint,
  grid: ChamberGrid,
  width: number,
  height: number,
): TileSpec {
  const snap = (rect: Rect): Rect => snapToTiles(rect, width, height);
  // The mission's level-wide ground is inherited; its own `zones` are NOT. Those
  // are rectangles a designer drew around a building that exists at one place on
  // one hand-authored map — carried onto a carved grid they land on whatever
  // happens to be there, which is how a generated Mars ended up with a city block
  // of base plating sitting in the middle of open hardpan. Only the districts get
  // to override the floor here.
  const tiles: TileSpec = { ground: base.tiles.ground };
  if (base.tiles.patch) tiles.patch = base.tiles.patch;
  const zones: NonNullable<TileSpec["zones"]> = [];
  for (const c of grid.chambers) {
    const area = areaById(bp.areas, c.area);
    if (!area.ground) continue;
    const zone: NonNullable<TileSpec["zones"]>[number] = {
      rect: snap({ x: c.x, y: c.y, width: c.w, height: c.h }),
      ground: area.ground,
    };
    if (area.patch) zone.patch = area.patch;
    zones.push(zone);
  }
  // SHELL BANDS over the district ground they wrap — pushed before it, because
  // `groundTileName` takes the first zone that contains a tile.
  const shells: NonNullable<TileSpec["zones"]> = [];
  for (const area of bp.areas) {
    if (!area.shellOf || !area.ground) continue;
    for (const rect of shellRects(grid, area.shellOf, area.shellWidth ?? 120)) {
      const zone: NonNullable<TileSpec["zones"]>[number] = {
        rect: snap(rect),
        ground: area.ground,
      };
      if (area.patch) zone.patch = area.patch;
      shells.push(zone);
    }
  }
  zones.unshift(...shells);
  // ENTRANCE APRONS last, so they paint over the district ground they sit in:
  // a square of hard standing just inside every doorway into an area that asks for
  // one. `groundTileName` takes the FIRST zone containing a tile, so these are
  // pushed after the district zones and win where they overlap.
  const aprons: NonNullable<TileSpec["zones"]> = [];
  for (const border of grid.borders) {
    if (border.link === "closed") continue;
    const mid =
      border.axis === "v"
        ? { x: border.coord, y: (border.from + border.to) / 2 }
        : { x: (border.from + border.to) / 2, y: border.coord };
    for (const cell of [border.a, border.b]) {
      const chamber = grid.chambers[cell];
      if (!chamber) continue;
      const apron = areaById(bp.areas, chamber.area).apron;
      if (!apron) continue;
      const r = apron.radius ?? 90;
      // Clipped to the cell, so an apron never spills through the doorway into the
      // room on the other side — which is a different kind of place with its own floor.
      const x0 = Math.max(chamber.x, mid.x - r);
      const y0 = Math.max(chamber.y, mid.y - r);
      const x1 = Math.min(chamber.x + chamber.w, mid.x + r);
      const y1 = Math.min(chamber.y + chamber.h, mid.y + r);
      if (x1 <= x0 || y1 <= y0) continue;
      aprons.push({
        rect: snap({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }),
        ground: apron.ground,
      });
    }
  }
  const all = [...aprons, ...zones];
  if (all.length > 0) tiles.zones = all;
  return tiles;
}

/** A `wall`-type palette entry by id. */
function wallObject(bp: MapBlueprint, id: string): MapObject {
  const found = bp.objects.find((o) => o.id === id && o.type === "wall");
  if (!found)
    throw new Error(`map "${bp.id}": wall material "${id}" is not a wall object`);
  return found;
}

/**
 * The grid's walls as `LevelDef.walls` segments. `wallSegments` decides WHERE a
 * wall exists; each run also names the MATERIAL it is built from — the owning
 * district's own (see `MapArea.wall`) — so one map can fence its plains with
 * rubble and seal its domes with panel in the same pass.
 */
export function buildWalls(
  bp: MapBlueprint,
  runs: WallRun[],
): LevelDef["walls"] {
  return runs.map((seg) => {
    const material = wallObject(bp, seg.material);
    const kind = material.kind ?? material.id;
    return {
      kind,
      sprite: material.sprite ?? kind,
      ...(material.sprites ? { sprites: material.sprites } : {}),
      ...(material.wander !== undefined ? { wander: material.wander } : {}),
      from:
        seg.axis === "v"
          ? vec(seg.coord, Math.round(seg.from))
          : vec(Math.round(seg.from), seg.coord),
      to:
        seg.axis === "v"
          ? vec(seg.coord, Math.round(seg.to))
          : vec(Math.round(seg.to), seg.coord),
      radius: material.radius ?? 10,
      jumpable: material.jumpable ?? false,
    };
  });
}

/** The scattered obstacles/cover/crates as `LevelDef.obstacles` count lines,
 * each sized from its density against the floor of the districts it belongs to. */
export function buildObstacles(
  bp: MapBlueprint,
  grid: ChamberGrid,
  rng: Rng,
): LevelDef["obstacles"] {
  const out: LevelDef["obstacles"] = [];
  for (const o of bp.objects) {
    if (o.type !== "obstacle" && o.type !== "cover" && o.type !== "crate")
      continue;
    const district = districtOf(bp, grid, o.areas);
    const count = densityCount(o.density, district.area, rng);
    if (count <= 0) continue;
    const kind = o.kind ?? o.id;
    const line: LevelDef["obstacles"][number] = {
      kind,
      count,
      radius: o.radius ?? 8,
      // Cover is the jumpable class by definition; the other two take the
      // authored answer (a crate is usually hoppable, an obstacle rarely).
      jumpable:
        o.type === "cover" ? (o.jumpable ?? true) : (o.jumpable ?? false),
    };
    if (o.sprite && o.sprite !== kind) line.sprite = o.sprite;
    if (o.rockSizes) line.rockSizes = o.rockSizes;
    if (o.cell !== undefined) line.cell = o.cell;
    // A prop with a `loot` block is BREAKABLE by definition — the spill odds mean
    // nothing on something the hero's weapon cannot smash, and the level checker
    // rejects the combination. So a vending machine or a wine rack is a solid,
    // non-jumpable OBSTACLE that happens to break, without having to be typed as a
    // supply crate to earn it.
    if (o.type === "crate" || o.loot) line.breakable = true;
    if (o.loot) line.loot = o.loot;
    if (district.within) line.within = district.within;
    out.push(line);
  }
  return out;
}

/** The flat decor lines, sized and restricted the same way. */
export function buildDecor(
  bp: MapBlueprint,
  grid: ChamberGrid,
  rng: Rng,
): LevelDef["decor"] {
  const out: LevelDef["decor"] = [];
  for (const o of bp.objects) {
    if (o.type !== "decor") continue;
    const district = districtOf(bp, grid, o.areas);
    const count = densityCount(o.density, district.area, rng);
    if (count <= 0) continue;
    const kind = o.kind ?? o.id;
    const line: LevelDef["decor"][number] = { kind, count };
    if (o.sprite && o.sprite !== kind) line.sprite = o.sprite;
    if (district.within) line.within = district.within;
    out.push(line);
  }
  return out;
}

/**
 * The solid box structures (`building` palette entries) — the town a western
 * street runs between, a bunker's fountains. Placed cell by cell so a structure
 * never straddles a wall, only in the districts that entry belongs to, and held
 * clear of the cell's own walls and of each other so the lanes between them stay
 * walkable.
 */
export function buildBuildings(
  bp: MapBlueprint,
  grid: ChamberGrid,
  exclude: Set<number>,
  rng: Rng,
): NonNullable<LevelDef["buildings"]> {
  const palette = bp.objects.filter((o) => o.type === "building");
  if (palette.length === 0) return [];
  const out: NonNullable<LevelDef["buildings"]> = [];
  for (const c of grid.chambers) {
    if (exclude.has(c.id)) continue;
    for (const o of palette) {
      if (o.areas && !o.areas.includes(c.area)) continue;
      const want = densityCount(o.density, c.w * c.h, rng);
      const w = o.w ?? 48;
      const h = o.h ?? 40;
      for (let i = 0; i < want; i++) {
        for (let attempt = 0; attempt < 12; attempt++) {
          const pos = pointIn(c, rng, Math.max(WALL_INSET, w, h));
          // A street's worth of clearance between footprints, so the structures
          // read as a block with lanes rather than one fused mass.
          const clear = out.every(
            (b) =>
              Math.abs(b.pos.x - pos.x) > (b.w + w) / 2 + 70 ||
              Math.abs(b.pos.y - pos.y) > (b.h + h) / 2 + 70,
          );
          if (!clear) continue;
          out.push({ sprite: o.sprite ?? o.id, pos, w, h });
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Re-place the hand-authored level's PICKUPS on the carved grid. The generated
 * map inherits WHAT a mission leaves lying around — Ada's trail, a keycard, the
 * field medkits — and decides WHERE: the story pieces are strung along the depth
 * axis (so the trail is followed rather than stumbled over) and the consumables
 * are scattered through the cells between.
 */
export function buildPlacedItems(
  base: LevelDef,
  grid: ChamberGrid,
  depth: number[],
  exclude: Set<number>,
  rng: Rng,
): LevelDef["placedItems"] {
  const items = base.placedItems ?? [];
  if (items.length === 0) return undefined;
  const interior = grid.chambers
    .filter((c) => !exclude.has(c.id))
    .sort((a, b) => (depth[a.id] as number) - (depth[b.id] as number));
  const pool = interior.length > 0 ? interior : grid.chambers;
  const story = items.filter(
    (i) => i.kind === "story" || i.kind === "equipment",
  );
  const rest = items.filter(
    (i) => i.kind !== "story" && i.kind !== "equipment",
  );
  const storyRooms = spread(pool, story.length);
  const out: NonNullable<LevelDef["placedItems"]> = [];
  story.forEach((item, i) => {
    out.push({ ...item, pos: pointIn(storyRooms[i] as Chamber, rng) });
  });
  for (const item of rest) {
    const c = pool[Math.floor(rng() * pool.length)] as Chamber;
    out.push({ ...item, pos: pointIn(c, rng) });
  }
  return out;
}

/** Re-anchor the gravity wells (the rift's black holes) into carved cells,
 * keeping their authored pull geometry. */
export function buildWells(
  base: LevelDef,
  grid: ChamberGrid,
  exclude: Set<number>,
  rng: Rng,
): LevelDef["wells"] {
  const wells = base.wells ?? [];
  if (wells.length === 0) return undefined;
  const pool = grid.chambers.filter((c) => !exclude.has(c.id));
  const rooms = spread(pool.length > 0 ? pool : grid.chambers, wells.length);
  return wells.map((well, i) => ({
    ...well,
    pos: pointIn(rooms[i] as Chamber, rng, 140),
  }));
}
