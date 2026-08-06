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
import type { LevelDef, MissionDef } from "../defs/levels/types.ts";
import type { Zone } from "../zones.ts";
import type { Chamber, ChamberGrid, WallRun } from "./rooms.ts";
import { areaById, spaceOf } from "./areas.ts";
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
      const other =
        border.a === c.id ? border.b : border.b === c.id ? border.a : null;
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
              : {
                  x: from,
                  y: c.y + c.h - width,
                  width: to - from,
                  height: width,
                },
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
  o: Pick<MapObject, "areas" | "space">,
): { within?: Zone[]; area: number } {
  const total = grid.chambers.reduce((sum, c) => sum + c.w * c.h, 0);
  // A prop restricted only by SPACE (see `MapObject.space`) names no districts,
  // so the list it is priced over is built here rather than authored: every
  // district on the map that is on the right side of the wall. Saying it this
  // way round matters — `space` has to keep meaning what it means when the
  // palette grows another interior district, which an `areas` list cannot.
  const areas =
    o.areas ??
    (o.space
      ? [
          ...new Set(
            bp.areas.filter((a) => spaceOf(a) === o.space).map((a) => a.id),
          ),
        ]
      : undefined);
  if (!areas || areas.length === 0) return { area: total };
  const zones: Zone[] = [];
  let area = 0;
  for (const id of areas) {
    const spec = areaById(bp.areas, id);
    // Both restrictions hold at once: a prop that names its districts AND its
    // side of the wall gets the intersection, never the union.
    if (o.space && spaceOf(spec) !== o.space) continue;
    if (spec.shellOf) {
      // A shell owns no cells — its region is the band, and props that name it
      // scatter into that band.
      for (const rect of shellRects(
        grid,
        spec.shellOf,
        spec.shellWidth ?? 120,
      )) {
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
 * A district's floor as a RAGGED patch instead of a clean rectangle.
 *
 * A cell's ground override is the cell's rect, which is right indoors — the
 * rectangle really is the room — and wrong the moment there is no wall along it.
 * On an open map the seam between two kinds of ground is the ONLY thing marking
 * a district, and a ruled line across open country reads as a rug thrown on the
 * floor: grass does not stop dead in a straight line where nothing stopped it.
 *
 * So an open district's floor is emitted as a row of COLUMNS, each independently
 * trimmed at the top and the bottom. The interior is unchanged (the columns tile
 * it edge to edge) and the outline comes out stepped and irregular, which is
 * enough for the eye to stop reading a box. The columns overlap by a tile so no
 * seam of the mission's own ground shows between two of them.
 */
function raggedRects(c: Chamber, rng: Rng): Rect[] {
  // Enough columns that the outline steps rather than combs, and not so many
  // that it reads as pixel noise.
  const step = Math.max(GROUND_TILE * 6, Math.round(c.w / 9));
  const bite = Math.min(GROUND_TILE * 9, Math.round(Math.min(c.w, c.h) * 0.2));
  // The ENDS are bitten too, or the patch comes out with two ruled vertical
  // edges — which is most of the box back again.
  const left = c.x + Math.round(rng() * bite);
  const right = c.x + c.w - Math.round(rng() * bite);
  const out: Rect[] = [];
  for (let x = left; x < right; x += step) {
    const width = Math.min(step + GROUND_TILE, right - x);
    const top = Math.round(rng() * bite);
    const bottom = Math.round(rng() * bite);
    const height = c.h - top - bottom;
    if (width <= 0 || height <= GROUND_TILE) continue;
    out.push({ x, y: c.y + top, width, height });
  }
  return out;
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
  base: MissionDef,
  bp: MapBlueprint,
  grid: ChamberGrid,
  width: number,
  height: number,
  rng: Rng,
  /** The ANNEX BAND: the dead ground the elevator's room was cut into, laid
   * LAST so the room's own floor (a district zone) wins inside it. */
  band?: {
    rect: Rect;
    ground: { common: string; rare: string; rareEvery: number };
  },
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
    // An ENCLOSED district keeps its rectangle: there is a wall along it, the
    // rectangle IS the room, and a ragged floor under a straight wall would look
    // like a mistake. An OPEN one gets the ragged patch (see `raggedRects`) —
    // unless it is a PAVED one, which is unwalled and still laid to the inch.
    const rects =
      (area.ragged ?? area.enclosure === "none")
        ? raggedRects(c, rng)
        : [{ x: c.x, y: c.y, width: c.w, height: c.h }];
    for (const rect of rects) {
      const zone: NonNullable<TileSpec["zones"]>[number] = {
        rect: snap(rect),
        ground: area.ground,
      };
      if (area.patch) zone.patch = area.patch;
      zones.push(zone);
    }
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
  // The band goes last of all: `groundTileName` takes the first zone containing a
  // tile, so anything already claimed (the annex room's own floor) keeps its
  // ground and only the dead rock around it falls through to this.
  if (band) all.push({ rect: snap(band.rect), ground: band.ground });
  if (all.length > 0) tiles.zones = all;
  return tiles;
}

/**
 * The four walls that SEAL the annex — the one wall run set in a generated map
 * that is not derived from a border, because the annex has none.
 *
 * That is the point of it rather than an exception to the rule: every other wall
 * exists because two kinds of place meet, and this one exists because a place
 * meets NOTHING. There is no doorway anywhere in it — the only way in is the lift.
 */
export function annexWalls(
  bp: MapBlueprint,
  room: Chamber,
  material: string,
): NonNullable<LevelDef["walls"]> {
  const runs: WallRun[] = [
    { axis: "h", coord: room.y, from: room.x, to: room.x + room.w, material },
    {
      axis: "h",
      coord: room.y + room.h,
      from: room.x,
      to: room.x + room.w,
      material,
    },
    { axis: "v", coord: room.x, from: room.y, to: room.y + room.h, material },
    {
      axis: "v",
      coord: room.x + room.w,
      from: room.y,
      to: room.y + room.h,
      material,
    },
  ];
  return buildWalls(bp, runs);
}

/** A `wall`-type palette entry by id. */
function wallObject(bp: MapBlueprint, id: string): MapObject {
  const found = bp.objects.find((o) => o.id === id && o.type === "wall");
  if (!found)
    throw new Error(
      `map "${bp.id}": wall material "${id}" is not a wall object`,
    );
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
): NonNullable<LevelDef["walls"]> {
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
    const district = districtOf(bp, grid, o);
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
    // Wall-hugging furniture: only meaningful with district rects to hug.
    if (o.edge && district.within) line.edge = true;
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
    const district = districtOf(bp, grid, o);
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
  /** Structures already on the ground (the lair houses) — kept clear of, so a
   * saloon never lands on top of the one house that opens. */
  standing: NonNullable<LevelDef["buildings"]> = [],
): NonNullable<LevelDef["buildings"]> {
  const palette = bp.objects.filter((o) => o.type === "building");
  if (palette.length === 0) return [];
  const out: NonNullable<LevelDef["buildings"]> = [...standing];
  for (const c of grid.chambers) {
    if (exclude.has(c.id)) continue;
    const street = areaById(bp.areas, c.area).blocks;
    const here = palette.filter((o) => !o.areas || o.areas.includes(c.area));
    if (street !== undefined) {
      out.push(...streetBlock(c, here, street, out, rng));
      continue;
    }
    for (const o of here) {
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
  // The pre-standing structures were seeded into `out` only as spacing anchors —
  // the caller already has them.
  return out.slice(standing.length);
}

/**
 * A MAIN STREET: two rows of frontages facing each other across a lane, filling
 * one cell along its longer axis (see `MapArea.blocks`).
 *
 * What makes a town read as a town is alignment, not density. Scattered at the
 * same count these same structures are a rash of sheds; queued along a lane with
 * their fronts to it they are a street, and a street is somewhere — the one place
 * on a map of open range where the horde has to come at the hero down a corridor.
 *
 * The two rows are walked independently and each building is drawn from the
 * palette by its own density weight, so the frontages vary in width and the row
 * ends where the cell does rather than at a fixed count. The lane itself is left
 * clear the whole way: nothing is ever placed inside `street` of the centre line.
 */
function streetBlock(
  c: Chamber,
  palette: MapObject[],
  street: number,
  placed: NonNullable<LevelDef["buildings"]>,
  rng: Rng,
): NonNullable<LevelDef["buildings"]> {
  if (palette.length === 0) return [];
  const out: NonNullable<LevelDef["buildings"]> = [];
  const alongX = c.w >= c.h;
  const span = alongX ? c.w : c.h;
  const across = alongX ? c.h : c.w;
  const originAlong = alongX ? c.x : c.y;
  const mid = (alongX ? c.y + c.h / 2 : c.x + c.w / 2) + (rng() - 0.5) * 40;
  // Weighted pick over the palette — the density that scatters a building
  // elsewhere reads as how OFTEN it appears on a frontage here.
  const total = palette.reduce((sum, o) => sum + (o.density ?? 1), 0);
  const pick = (): MapObject => {
    let at = rng() * total;
    for (const o of palette) {
      at -= o.density ?? 1;
      if (at <= 0) return o;
    }
    return palette[palette.length - 1] as MapObject;
  };
  for (const side of [-1, 1] as const) {
    // Each row starts at its own offset, so the two sides are not mirror images
    // of each other — a street of matched pairs looks like a film set.
    let cursor = originAlong + WALL_INSET + rng() * 90;
    while (cursor < originAlong + span - WALL_INSET) {
      const o = pick();
      const w = o.w ?? 48;
      const h = o.h ?? 40;
      const long = alongX ? w : h;
      const deep = alongX ? h : w;
      if (cursor + long > originAlong + span - WALL_INSET) break;
      // Deep enough to sit off the lane, shallow enough to stay off the cell's
      // own wall — a frontage that overruns its block is a building in a field.
      const offset = street / 2 + deep / 2;
      if (offset + deep / 2 > across / 2 - WALL_INSET / 2) break;
      const along = cursor + long / 2;
      const pos = alongX
        ? vec(Math.round(along), Math.round(mid + side * offset))
        : vec(Math.round(mid + side * offset), Math.round(along));
      const clear = placed.every(
        (b) =>
          Math.abs(b.pos.x - pos.x) > (b.w + w) / 2 + 24 ||
          Math.abs(b.pos.y - pos.y) > (b.h + h) / 2 + 24,
      );
      if (clear) out.push({ sprite: o.sprite ?? o.id, pos, w, h });
      // A gap between frontages: mostly shoulder to shoulder, occasionally an
      // alley, which is where the horde spills out of.
      cursor += long + 18 + (rng() < 0.22 ? 90 : rng() * 26);
    }
  }
  return out;
}

/** The level's FAUNA lines — living scenery, sized and restricted exactly like a
 * scatter, but wandering off the render clock instead of standing still. */
export function buildFauna(
  bp: MapBlueprint,
  grid: ChamberGrid,
  rng: Rng,
): LevelDef["fauna"] {
  const out: NonNullable<LevelDef["fauna"]> = [];
  for (const o of bp.objects) {
    if (o.type !== "critter") continue;
    const district = districtOf(bp, grid, o);
    const count = densityCount(o.density, district.area, rng);
    if (count <= 0) continue;
    const line: NonNullable<LevelDef["fauna"]>[number] = {
      kind: o.kind ?? o.id,
      count,
    };
    if (o.sprite) line.sprite = o.sprite;
    if (o.animated) line.animated = true;
    if (o.range) line.range = o.range;
    if (o.speed) line.speed = o.speed;
    if (o.scale) line.scale = o.scale;
    if (district.within) line.within = district.within;
    out.push(line);
  }
  return out.length > 0 ? out : undefined;
}

/**
 * THE ROWS — aligned ranks of a prop across each cell they belong in, emitted as
 * `LevelDef.propLines`.
 *
 * This is the one arrangement the scatter cannot produce, and the difference
 * between a factory floor and an empty room. Server racks stand in AISLES;
 * fuselage sections queue down an assembly LINE; workstations line up in BANKS.
 * Randomly placed, the same props read as debris somebody dropped.
 *
 * Three rules keep the ranks from sealing a room, which is the obvious way for
 * this to go wrong:
 *
 *   COVERAGE   the ranks fill a centred share of the cell, so there is always a
 *              margin of clear floor round all four walls and a rank never
 *              crowds a doorway.
 *   CROSS AISLE  every rank is broken in the middle, so the cell has a walkable
 *              cross-corridor whichever way the ranks run — a real factory has
 *              one for the same reason.
 *   LONG AXIS  ranks run along the cell's longer axis, so an aisle is an aisle
 *              rather than a stub.
 */
export function buildRows(
  bp: MapBlueprint,
  grid: ChamberGrid,
  exclude: Set<number>,
  rng: Rng,
): NonNullable<LevelDef["propLines"]> {
  const palette = bp.objects.filter((o) => o.type === "row");
  if (palette.length === 0) return [];
  const out: NonNullable<LevelDef["propLines"]> = [];
  for (const c of grid.chambers) {
    if (exclude.has(c.id)) continue;
    for (const o of palette) {
      if (o.areas && !o.areas.includes(c.area)) continue;
      // Not every cell gets every rank: a floor where every bay holds the same
      // assembly line reads as wallpaper, not as a factory.
      if (rng() > (o.chance ?? 1)) continue;
      // …and the cells that do get one vary in how full they are, so two bays of
      // the same kind are not the same bay twice.
      const coverage =
        Math.max(0.2, Math.min(0.9, o.coverage ?? 0.7)) * (0.78 + rng() * 0.22);
      const gap = o.gap ?? 90;
      const bank = Math.max(1, o.bank ?? 2);
      const aisle = o.aisle ?? gap * 2;
      const spacing = o.spacing ?? 20;
      // Along the LONGER axis: an aisle down a cell's length reads as an aisle.
      const alongX = c.w >= c.h;
      const spanAlong = (alongX ? c.w : c.h) * coverage;
      const spanAcross = (alongX ? c.h : c.w) * coverage;
      const originAlong =
        (alongX ? c.x : c.y) + ((alongX ? c.w : c.h) - spanAlong) / 2;
      const originAcross =
        (alongX ? c.y : c.x) + ((alongX ? c.h : c.w) - spanAcross) / 2;
      // The cross aisle: a gap in the middle of every rank, wide enough to walk.
      const breakAt = originAlong + spanAlong / 2;
      const breakHalf = Math.max(90, spacing * 3) / 2;
      // Start the ranks a little off the cell's own edge, so neighbouring rooms
      // do not line their aisles up through the doorway between them.
      let across = originAcross + rng() * gap * 0.6;
      let inBank = 0;
      while (across <= originAcross + spanAcross) {
        for (const [from, to] of [
          [originAlong, breakAt - breakHalf],
          [breakAt + breakHalf, originAlong + spanAlong],
        ] as [number, number][]) {
          if (to - from < spacing) continue;
          const line: NonNullable<LevelDef["propLines"]>[number] = {
            sprite: o.sprite ?? o.id,
            from: alongX ? vec(from, across) : vec(across, from),
            to: alongX ? vec(to, across) : vec(across, to),
            spacing,
          };
          if (o.collide) {
            line.collide = true;
            if (o.half) line.half = vec(o.half.x, o.half.y);
            else if (o.radius !== undefined) line.radius = o.radius;
            if (o.jumpable) line.jumpable = true;
          }
          out.push(line);
        }
        inBank++;
        // A wide aisle after every `bank` ranks; the tight `gap` within one.
        across += inBank % bank === 0 ? aisle : gap;
      }
    }
  }
  return out;
}

/**
 * THE PREFABS' FIXED CONTENTS — every static room's authored props, stamped at
 * the offsets it authored them at (see `MapPrefab.props`).
 *
 * Emitted as one-prop `propLines` rather than as scatter, because a `propLine`
 * is the engine's only DETERMINISTIC placement: a line from a point to itself
 * puts exactly one prop exactly there, colliding or flat according to the
 * palette entry, and nothing about it is rolled. Which is the whole claim a
 * prefab makes — the mop bucket is by the door, and it is by the door on every
 * seed, or the room is not a room the player can recognise.
 *
 * A prop that would land outside its own room is dropped rather than clamped: an
 * offset past the wall is an authoring mistake, and a piece silently slid back
 * inside would hide it while leaving the room wrong.
 */
export function buildPrefabProps(
  bp: MapBlueprint,
  grid: ChamberGrid,
): NonNullable<LevelDef["propLines"]> {
  const out: NonNullable<LevelDef["propLines"]> = [];
  for (const placement of grid.prefabs) {
    const prefab = bp.prefabs?.find((p) => p.id === placement.id);
    if (!prefab) continue;
    for (const prop of prefab.props ?? []) {
      const o = bp.objects.find((entry) => entry.id === prop.object);
      if (!o) continue;
      const at = vec(
        Math.round(placement.x + prop.at[0]),
        Math.round(placement.y + prop.at[1]),
      );
      if (
        at.x < placement.x ||
        at.x > placement.x + placement.w ||
        at.y < placement.y ||
        at.y > placement.y + placement.h
      )
        continue;
      const line: NonNullable<LevelDef["propLines"]>[number] = {
        sprite: o.sprite ?? o.kind ?? o.id,
        from: at,
        // A COPY, never the same vector twice: two fields of one def sharing a
        // mutable point is a trap waiting for the first thing that writes to it.
        to: vec(at.x, at.y),
        spacing: 1,
      };
      // Anything that is not flat decor stands in the way, which is what makes a
      // prefab a room rather than a picture of one.
      if (o.type !== "decor") {
        line.collide = true;
        if (o.half) line.half = vec(o.half.x, o.half.y);
        else line.radius = o.radius ?? 8;
        if (o.jumpable) line.jumpable = true;
      }
      out.push(line);
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
  base: MissionDef,
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
  base: MissionDef,
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
