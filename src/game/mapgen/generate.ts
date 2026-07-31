// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MAP GENERATOR — a blueprint (`content/maps/<id>.yaml`) plus a seed becomes
// a whole `LevelDef`, which the rest of the engine then builds a run from exactly
// as it builds one from a hand-authored map. Nothing downstream of here knows the
// difference: `create.ts` gets a `LevelDef`, and that is the entire contract.
//
// THE POINT IS THE SEARCH. A hand-authored mission pins its boss on a known rock
// and threads an intended `path` to it, so the second run of a map is a commute.
// A generated one carves a fresh grid of areas, drops the boss in a compass
// corner rolled from the blueprint's candidates, starts the hero as far from it as
// the map allows, and emits NO `path` — which is what silences the app's guidance
// arrow (`nextPathWaypoint` answers null without one) and leaves the fog-of-war
// minimap as the only record of where you have been. You find the boss by walking
// the map, district by district, the way you find Andariel.
//
// The DEPTH axis is the one number the whole placement pass reads: how many
// doorways a cell sits from the hero's, normalized to 0..1 at the boss's. The
// horde's breeds hand over along it, the mob-level ramp climbs it, the elites are
// strung along it, and the deepest cul-de-sacs are where the caches go — so the
// map gets harder the further the search runs without a single authored coordinate
// saying so.
//
// The geometry and the districts live next door (`rooms.ts`, `areas.ts`), the
// dressing in `place.ts`; this file is the decisions.
//
// Everything else about the mission — its name, story, loot pools, merchant,
// hazards, thought pins, travel gates — is INHERITED from the hand-authored level
// the blueprint names, so a generated THE MOON is still the moon.

import { createRng, type Rng } from "@game/lib/rng.ts";
import { vec, type Vec2 } from "@game/lib/vec.ts";
import { DIALOGUE } from "../config/index.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import type { LevelDef, SpawnerSpec, SpawnSpec } from "../defs/levels/types.ts";
import type { Zone } from "../zones.ts";
import { areaById, type MapArea } from "./areas.ts";
import {
  annexWalls,
  buildBuildings,
  buildDecor,
  buildFauna,
  buildObstacles,
  buildPlacedItems,
  buildRows,
  buildTiles,
  buildWalls,
  buildWells,
  chamberZone,
  densityCount,
  pointIn,
  spread,
  WALL_INSET,
} from "./place.ts";
import { regionContains, regionRect } from "./regions.ts";
import {
  carveChambers,
  chamberCenter,
  doorDistances,
  wallSegments,
  type Chamber,
  type ChamberGrid,
} from "./rooms.ts";
import type { MapBlueprint, MapSetPiece, MapSizeName } from "./types.ts";

/**
 * Mixed into the run seed before the layout stream is drawn, so a map's GEOMETRY
 * and its run's rolls (loot, scatter, mob picks) never walk the same sequence —
 * two runs on adjacent seeds would otherwise share a suspicious amount of shape.
 */
const LAYOUT_SALT = 0x9e3779b9;

/** A second, unrelated salt for the SIZE roll, so `random` sizing does not
 * correlate with where the first partition happens to land. */
const SIZE_SALT = 0x85ebca6b;

/**
 * Fields of the hand-authored level a carve DROPS rather than inherits, because
 * every one of them is tied to geometry that no longer exists.
 *
 * `path` is the load-bearing one: an intended route is what drives the app's
 * guidance arrow, and an arrow pointing at the boss is the opposite of a search.
 * `waves`/`tempo` go because the cell knots are this map's horde and a level uses
 * one model or the other; `doors`, `propLines` and `packs` go because their
 * coordinates were drawn for a map that is not this one.
 */
const DROPPED_ON_CARVE = [
  "path",
  "waves",
  "tempo",
  "doors",
  "propLines",
  "packs",
] as const satisfies readonly (keyof LevelDef)[];

/** The area an id names, for a cell. */
function areaOf(areas: MapArea[], c: Chamber): MapArea {
  return areaById(areas, c.area);
}

/**
 * Pick the cell the boss holds: one of the blueprint's candidate compass regions,
 * rolled per run, then — among the cells in it whose AREA may hold a boss — the
 * one deepest into that corner.
 *
 * Both filters degrade rather than fail. A region no eligible cell landed in
 * falls back to the whole map, because a `small` carve may genuinely have nothing
 * centred in a given ninth, and a run that cannot place its boss is worse than a
 * run whose boss is in the second-best place.
 */
function pickGoalChamber(
  grid: ChamberGrid,
  areas: MapArea[],
  regions: string[],
  width: number,
  height: number,
  rng: Rng,
): Chamber {
  const eligible = grid.chambers.filter((c) => areaOf(areas, c).boss !== false);
  const pool = eligible.length > 0 ? eligible : grid.chambers;
  const rect = regionRect(
    regions[Math.floor(rng() * regions.length)] as string,
    width,
    height,
  );
  const inside = pool.filter((c) => {
    const mid = chamberCenter(c);
    return regionContains(rect, mid.x, mid.y);
  });
  const candidates = inside.length > 0 ? inside : pool;
  // Deepest into the named corner first, floor area breaking ties: a boss pushed
  // out to the edge of its third is a boss the hero has to cross the map for,
  // where one hugging the middle gets found on the way to somewhere else.
  const cx = width / 2;
  const cy = height / 2;
  const outward = (c: Chamber): number => {
    const mid = chamberCenter(c);
    return Math.hypot(mid.x - cx, mid.y - cy);
  };
  return candidates.reduce((best, c) => {
    const d = outward(c);
    const bd = outward(best);
    return d > bd || (d === bd && c.w * c.h > best.w * best.h) ? c : best;
  });
}

/**
 * Where the hero lands: the cell farthest from the boss whose AREA may hold a
 * spawn. A blueprint may narrow it to candidate regions; otherwise the whole map
 * is in play, which is what makes the search as long as the grid can offer.
 */
function pickSpawnChamber(
  grid: ChamberGrid,
  areas: MapArea[],
  goal: Chamber,
  regions: string[] | undefined,
  width: number,
  height: number,
  rng: Rng,
): Chamber {
  const fromGoal = doorDistances(grid, goal.id);
  const goalMid = chamberCenter(goal);
  const reach = (c: Chamber): number => fromGoal[c.id] as number;
  const gap = (c: Chamber): number => {
    const mid = chamberCenter(c);
    return Math.hypot(mid.x - goalMid.x, mid.y - goalMid.y);
  };
  /**
   * Farthest from the boss, measured the way the SEARCH is — but with a doorway
   * of slack.
   *
   * Doorway count is the primary term: it is how many rooms have to be crossed.
   * Raw distance is not enough on its own (a cell right across a wall from the
   * boss can be far in a straight line). But taken alone, doorway count ties
   * constantly on a looped grid, and the tie can pick a cell two doors away that
   * is physically a stone's throw from the boss. So a cell one door short of the
   * maximum still counts as tied, and among the tied set the physically farthest
   * wins — which is what keeps a LARGE map from occasionally opening in the
   * boss's own neighbourhood.
   */
  const pickFarthest = (pool: Chamber[]): Chamber => {
    const maxReach = pool.reduce((m, c) => Math.max(m, reach(c)), 0);
    const tied = pool.filter((c) => reach(c) >= maxReach - 1);
    return tied.reduce((best, c) => (gap(c) > gap(best) ? c : best));
  };
  const eligible = grid.chambers.filter(
    (c) => c.id !== goal.id && areaOf(areas, c).spawn !== false,
  );
  const pool =
    eligible.length > 0
      ? eligible
      : grid.chambers.filter((c) => c.id !== goal.id);
  if (regions && regions.length > 0) {
    const rect = regionRect(
      regions[Math.floor(rng() * regions.length)] as string,
      width,
      height,
    );
    const inside = pool.filter((c) => {
      const mid = chamberCenter(c);
      return regionContains(rect, mid.x, mid.y);
    });
    if (inside.length > 0) return pickFarthest(inside);
  }
  return pickFarthest(pool);
}

/**
 * THE HORDE'S DENSITY: spawn points per million world px² of MAP.
 *
 * Measured off the campaign it has to feel like — the hand-authored maps stand at
 * 1.6 (eastworld, the rift, mars) to 1.8 (the moon) knots per million px², which
 * works out at a fight every 700-800 px of walking.
 *
 * The horde used to be one knot per CELL, which is a COUNT wearing a density's
 * clothes: the carve grows its cells with the map, so a knot on a medium moon was
 * covering two and a half times the floor a knot on the hand-authored moon covers,
 * and a LARGE carve was worse. Measured, generated maps stood at 0.8–1.2 spawn
 * points per million px² against the authored campaign's 1.6–3.8, with the horde
 * budget thinned to match — a map you could cross meeting nothing but the elite
 * standing in the middle of it, which is exactly what it played like.
 *
 * The map's whole allowance is spread over the cells that may HOLD a horde, not
 * over the map: a third of the floor is quiet by design (the boss's cell, the
 * cache cul-de-sacs, the trader's pitch), and pricing the allowance per cell just
 * hands that third back as emptiness — which is how a "1.7" that measured 1.0 on
 * a medium carve got shipped.
 */
const KNOT_DENSITY = 1.7;

/** The most knots one cell may hold, so a freak carve can't turn a single hall
 * into a wall of spawn points the hero cannot drain. */
const KNOTS_PER_CELL_MAX = 6;

/** How many of the opening beat's crowd stand around the hero's landing — enough
 * to read as the room he walked into, few enough to still be a breather. */
const OPENING_CROWD = 3;

/**
 * The ambient horde as finite knots spread across the cells (see `SpawnerSpec`):
 * each arms when the hero walks into it, drains as he clears it, and lets him move
 * on. The knot's mob LEVEL climbs the blueprint's ramp ladder with depth and its
 * BREEDS hand over along their authored windows, so the search gets tougher and
 * stranger the deeper it runs. A cell takes as many knots as its floor is worth
 * (`KNOT_DENSITY`), and its AREA's `horde` scales how many it takes — so a
 * scrapyard is a thicker run of fights than a plain, and a big cell is a longer
 * one rather than an emptier one.
 *
 * `quiet` names the cells that get NO knot — the boss's (a horde in the boss cell
 * floods the fight and kites the hero off him; measured on the hand-authored maps,
 * see the moon's `bay` note), the cache cul-de-sacs and the trader's cell (both
 * carry a design zone that would suppress the knot's spawns anyway, leaving a
 * budget of forty mobs that never arrives). The hero's own cell DOES get one, at
 * its `anchors` point rather than the centre, so the opening knot is something he
 * walks into rather than something he lands in.
 */
function buildSpawners(
  bp: MapBlueprint,
  grid: ChamberGrid,
  depth: number[],
  quiet: Set<number>,
  anchors: Map<number, Vec2>,
  rng: Rng,
): SpawnerSpec[] {
  const { ramps, members, perRoom, maxAlive, lingering } = bp.horde;
  const holds = (c: Chamber): boolean =>
    !quiet.has(c.id) && (areaOf(bp.areas, c).horde ?? 1) > 0;
  // The map's allowance, spread over the floor that may actually hold it.
  const floor = grid.chambers.reduce((sum, c) => sum + c.w * c.h, 0);
  const hordeFloor = grid.chambers
    .filter(holds)
    .reduce((sum, c) => sum + c.w * c.h, 0);
  const density =
    hordeFloor > 0 ? (KNOT_DENSITY * floor) / hordeFloor : KNOT_DENSITY;
  // THE HORDE'S DEPTH AXIS IS THE ONE THE HERO FIGHTS ALONG, not the carve's.
  // Raw depth is measured to the deepest cell on the map — and the deepest cells
  // are exactly the ones that never hold a knot (the boss's, the caches, the
  // trader's). Read the ramps off raw depth and the last rung or two of the
  // ladder is unreachable: the toughest knot on a generated moon came out two
  // levels below the toughest on the authored one, and the breed authored for
  // `[0.8, 1]` never stood anywhere. Rescaling over the knot-bearing cells' own
  // span spends the whole ladder — the shallow end is unmoved (the hero's cell
  // is depth 0 either way), the deep end now reaches the top ramp.
  const held = grid.chambers.filter(holds).map((c) => depth[c.id] as number);
  const deepest = held.length > 0 ? Math.max(...held) : 1;
  const shallowest = held.length > 0 ? Math.min(...held) : 0;
  const reach = deepest - shallowest;
  const out: SpawnerSpec[] = [];
  for (const c of grid.chambers) {
    if (!holds(c)) continue;
    const area = areaOf(bp.areas, c);
    const hordeMult = area.horde ?? 1;
    const raw = depth[c.id] as number;
    const d = reach > 0 ? (raw - shallowest) / reach : raw;
    const rampIndex = Math.min(ramps.length - 1, Math.floor(d * ramps.length));
    // Breeds whose window covers this depth; if a blueprint leaves a gap, the
    // breed with the nearest window holds the cell rather than leaving it empty.
    let live = members.filter((m) => d >= m.window[0] && d <= m.window[1]);
    if (live.length === 0) {
      const nearest = members.reduce((best, m) => {
        const mid = (m.window[0] + m.window[1]) / 2;
        const bestMid = (best.window[0] + best.window[1]) / 2;
        return Math.abs(mid - d) < Math.abs(bestMid - d) ? m : best;
      });
      live = [nearest];
    }
    // How many fights this cell's floor is worth, and the patches they hold. The
    // cell is cut into bands along its LONG axis — a hall gets a fight at either
    // end rather than two piled on its middle — and each band's own area sizes
    // its knot, so the mobs-per-floor rate is the same in a closet and a plaza.
    const slots = Math.max(
      1,
      Math.min(
        KNOTS_PER_CELL_MAX,
        densityCount(density * hordeMult, c.w * c.h, rng),
      ),
    );
    const wide = c.w >= c.h;
    const band: Chamber = {
      ...c,
      w: wide ? c.w / slots : c.w,
      h: wide ? c.h : c.h / slots,
    };
    // The blueprint's `perRoom` is a fight's worth of mobs at the average cell,
    // so a knot holding a smaller patch than that fields proportionally fewer —
    // bounded either way, because a knot the hero cannot drain at the alive cap
    // is a wall, and one with three mobs in it is not a fight.
    const bandScale = Math.max(
      0.6,
      Math.min(1.6, (band.w * band.h * density) / 1_000_000),
    );
    for (let slot = 0; slot < slots; slot++) {
      const patch: Chamber = {
        ...band,
        x: wide ? c.x + band.w * slot : c.x,
        y: wide ? c.y : c.y + band.h * slot,
      };
      const total =
        Math.round(
          (perRoom[0] + rng() * (perRoom[1] - perRoom[0])) * bandScale,
        ) || 1;
      const weightSum = live.reduce((sum, m) => sum + (m.weight ?? 1), 0);
      const mix = live.map((m) => ({
        enemy: m.enemy,
        count: Math.max(1, Math.round((total * (m.weight ?? 1)) / weightSum)),
      }));
      const knot: SpawnerSpec = {
        // The FIRST knot keeps the cell's plain name, because an elite standing
        // in that cell names it as its `alarms` link without a lookup table.
        id: slot === 0 ? `k${c.id}` : `k${c.id}_${slot}`,
        at:
          slot === 0
            ? (anchors.get(c.id) ?? chamberCenter(patch))
            : chamberCenter(patch),
        members: mix,
        mobLevels: ramps[rampIndex],
        maxAlive,
        // Wide enough that entering the patch from ANY side arms the knot — one
        // that only wakes at its exact centre lets the hero walk past it.
        triggerRadius: Math.round(
          Math.max(300, Math.min(patch.w, patch.h) * 0.6),
        ),
      };
      if (lingering !== undefined) knot.lingering = lingering;
      out.push(knot);
    }
  }
  return out;
}

/**
 * HELLGATES laced across the grid (config HELLGATES): rampage-only points, shut
 * until the hero's menace meter opens them, gated to the rungs the content exists
 * for. Spread by walking the cell list at a stride so they land corner to corner
 * instead of clustering wherever the rng looked first.
 */
function buildHellgates(
  bp: MapBlueprint,
  grid: ChamberGrid,
  spawn: Chamber,
  bossHome: Chamber,
): SpawnerSpec[] {
  const hellborn = bp.hellborn;
  const want = bp.horde.hellgates ?? 0;
  if (!hellborn || want <= 0) return [];
  // Never the hero's landing, and never the boss's room: a hellgate pouring into
  // the elevator's annex would turn the finale into an endless holding action.
  const pool = grid.chambers.filter(
    (c) => c.id !== spawn.id && c.id !== bossHome.id,
  );
  if (pool.length === 0) return [];
  const stride = Math.max(1, Math.floor(pool.length / want));
  const out: SpawnerSpec[] = [];
  for (let i = 0; i < want; i++) {
    const c = pool[(i * stride) % pool.length] as Chamber;
    out.push({
      id: `hell${i}`,
      at: chamberCenter(c),
      hellgate: true,
      minDifficulty: "nightmare",
      mobLevels: hellborn.level,
      members: hellborn.members.map((m) => ({ ...m })),
    });
  }
  return out;
}

/** A pinned set piece plus its retinue, scattered around `at`. */
function pinSetPiece(
  piece: MapSetPiece,
  at: Vec2,
  rng: Rng,
  chamber: Chamber,
  alarms?: string,
): SpawnSpec[] {
  const out: SpawnSpec[] = [];
  const lead: SpawnSpec = {
    enemy: piece.enemy,
    at,
    level: piece.level,
    hp: piece.hp,
  };
  // An elite that wakes RAISES its cell's knot — the sentry who pulls the whole
  // room, and the reason a careless search costs more than a careful one.
  if (alarms) lead.alarms = alarms;
  out.push(lead);
  for (const guard of piece.escort ?? []) {
    for (let i = 0; i < guard.count; i++) {
      const spread = Math.min(140, Math.min(chamber.w, chamber.h) / 4);
      out.push({
        enemy: guard.enemy,
        at: vec(
          Math.round(at.x + (rng() - 0.5) * spread * 2),
          Math.round(at.y + (rng() - 0.5) * spread * 2),
        ),
        level: guard.level,
        hp: guard.hp,
      });
    }
  }
  return out;
}

/**
 * Every cell ranked by how much of a DETOUR it is — the dead ends a search has to
 * step aside into, which is where a reward belongs. Fewest doorways first, then
 * deepest, so a true cul-de-sac out at the far end always outranks a thoroughfare
 * near the door.
 *
 * The whole list is returned rather than just the one-door cells, because a
 * heavily looped grid (or one of mostly open ground) can have none at all and the
 * caches still have to go somewhere: the ranking degrades gracefully from "a dead
 * end" to "the quietest corner this grid grew".
 */
function detourRank(
  grid: ChamberGrid,
  exclude: Set<number>,
  depth: number[],
): Chamber[] {
  return grid.chambers
    .filter((c) => !exclude.has(c.id))
    .sort((a, b) => {
      const doors =
        (grid.neighbors[a.id] as number[]).length -
        (grid.neighbors[b.id] as number[]).length;
      return doors !== 0
        ? doors
        : (depth[b.id] as number) - (depth[a.id] as number);
    });
}

/**
 * Where the elevator pad stands in its cell: a point rolled anywhere in it, held
 * a long walk from the hero's landing.
 *
 * The distance floor is the whole reason this is not a plain `pointIn`: the cell
 * the compass regions picked is far from the landing on average, but a big cell
 * can still offer a corner of itself that is not, and a lift the hero trips over
 * on his way out of the opening room throws the mission away.
 */
function liftSpot(c: Chamber, from: Vec2, rng: Rng): Vec2 {
  const inset = Math.min(WALL_INSET * 1.4, c.w / 3, c.h / 3);
  const floor = 1500;
  let best = pointIn(c, rng, inset);
  let bestGap = Math.hypot(best.x - from.x, best.y - from.y);
  for (let attempt = 0; attempt < 12 && bestGap < floor; attempt++) {
    const at = pointIn(c, rng, inset);
    const gap = Math.hypot(at.x - from.x, at.y - from.y);
    if (gap > bestGap) {
      best = at;
      bestGap = gap;
    }
  }
  // Nothing in the cell is far enough: take its far side, which is the most this
  // carve can offer.
  return bestGap >= floor ? best : farSide(c, from);
}

/** The point in a cell FARTHEST from `from` — where the opening knot stands, so
 * the hero has floor to land on before he meets it. */
function farSide(c: Chamber, from: Vec2): Vec2 {
  const inset = Math.min(WALL_INSET * 1.5, c.w / 3, c.h / 3);
  return vec(
    Math.round(from.x > c.x + c.w / 2 ? c.x + inset : c.x + c.w - inset),
    Math.round(from.y > c.y + c.h / 2 ? c.y + inset : c.y + c.h - inset),
  );
}

/**
 * Append the ANNEX to the grid as a chamber with NO neighbours (see `MapAnnex`).
 *
 * It lands in the band past the carved rectangle, at an x rolled per run, and
 * joins `grid.chambers` like any other cell — which is the whole trick. Every
 * dressing pass downstream keys off a chamber's AREA, so the annex gets its own
 * floor, its own scatter, its own ranks and its own horde multiplier for free;
 * the only thing that makes it special is the empty neighbour list, and the only
 * code that has to know about that is the wall pass (which gives it a sealed box
 * instead of derived borders).
 */
function appendAnnex(
  grid: ChamberGrid,
  annex: NonNullable<MapBlueprint["annex"]>,
  spec: { width: number; height: number },
  margin: number,
  rng: Rng,
): Chamber {
  const wide = annex.widthFrac
    ? Math.max(annex.width, Math.round(spec.width * annex.widthFrac))
    : annex.width;
  // Never wider than the band can hold, or the room runs off the map edge.
  const w = Math.min(wide, spec.width - margin * 2);
  const slack = Math.max(0, spec.width - w - margin * 2);
  const room: Chamber = {
    id: grid.chambers.length,
    x: Math.round(margin + rng() * slack),
    y: Math.round(spec.height + margin),
    w,
    h: annex.height,
    area: annex.area,
  };
  grid.chambers.push(room);
  grid.neighbors.push([]);
  return room;
}

/** Which of the three sizes this run is carved at — `random` rolls it off the
 * run's own seed, so the scale of the search varies as well as its shape. */
export function resolveMapSize(
  bp: MapBlueprint,
  requested: MapSizeName | "random",
  seed: number,
): MapSizeName {
  if (requested !== "random") return requested;
  const names: MapSizeName[] = ["small", "medium", "large"];
  const rng = createRng((seed ^ SIZE_SALT) >>> 0);
  return names[Math.floor(rng() * names.length)] as MapSizeName;
}

/**
 * Carve a `LevelDef` from a blueprint.
 *
 * @param bp    the compiled blueprint (`content/maps/<id>.yaml`)
 * @param base  the hand-authored level it inherits its story and rules from
 * @param seed  the run seed — the same one `createGame` builds the run with, so a
 *              run and its map replay together
 * @param size  which of the blueprint's three sizes to carve
 */
export function generateLevel(
  bp: MapBlueprint,
  base: LevelDef,
  seed: number,
  size: MapSizeName,
): LevelDef {
  const spec = bp.sizes[size];
  const rng = createRng((seed ^ LAYOUT_SALT) >>> 0);
  // The ANNEX gets a band of its own PAST the carved rectangle (see `MapAnnex`).
  // The carve never sees it, so nothing is ever adjacent to the room the lift
  // rides to and the minimap has nothing to draw where it is.
  const annexMargin = bp.annex ? (bp.annex.margin ?? 200) : 0;
  const band = bp.annex ? bp.annex.height + annexMargin * 2 : 0;
  const width = spec.width;
  const height = spec.height + band;
  const grid = carveChambers(
    spec.width,
    spec.height,
    spec.rooms,
    bp.layout.minRoom,
    bp.layout.doorWidth,
    bp.layout.loopDoors,
    bp.areas,
    bp.layout.cluster,
    bp.layout.wall,
    rng,
  );

  // --- Where the search ends, and where it starts ----------------------------
  // The boss first: everything else is positioned relative to him, including the
  // hero, whose whole job is to be far away.
  const goal = pickGoalChamber(
    grid,
    bp.areas,
    bp.boss ? bp.boss.regions : ["center"],
    spec.width,
    spec.height,
    rng,
  );
  const spawn = pickSpawnChamber(
    grid,
    bp.areas,
    goal,
    bp.spawnRegions,
    spec.width,
    spec.height,
    rng,
  );
  // The ANNEX, appended AFTER both endpoints are chosen so it can never be picked
  // as one: it is not a candidate for anything, it is where the lift goes. It
  // joins the grid as a real chamber with an EMPTY neighbour list, which is what
  // lets every dressing pass below treat it as the district it is — its own
  // floor, its own scatter, its own ranks — without a single special case.
  const annexRoom = bp.annex
    ? appendAnnex(grid, bp.annex, spec, annexMargin, rng)
    : null;
  const bossHome = annexRoom ?? goal;
  const steps = doorDistances(grid, spawn.id);
  const reach = Math.max(1, ...steps.filter((d) => Number.isFinite(d)));
  // The annex is unreachable on foot, so its door distance is infinite — which
  // lands it at depth 1, the deepest the map goes. Which is exactly right: it is.
  const depth = steps.map((d) => (Number.isFinite(d) ? d / reach : 1));
  const playerSpawn = pointIn(
    spawn,
    rng,
    Math.min(WALL_INSET * 1.4, spawn.w / 3, spawn.h / 3),
  );
  const goalCenter = chamberCenter(bossHome);
  // Where the LIFT stands: JUST SOMEWHERE, in the cell the boss's compass regions
  // picked. A random point rather than the room's far corner, because on an open
  // map there are no corners to speak of and a pad parked on the same relative
  // spot every run is a pattern a player can learn. The only constraint is that
  // it stays a real walk from the landing — a lift found in the opening minute is
  // not a search — so the roll is retried and falls back to the far side.
  const liftAt = annexRoom ? liftSpot(goal, playerSpawn, rng) : null;

  // --- The quiet cells ------------------------------------------------------
  // Decided BEFORE the horde, because they are decided BY excluding it: a cache
  // cul-de-sac and the trader's pitch carry design zones that suppress ambient
  // spawns, so a knot placed there would budget forty mobs that never arrive.
  const offLimits = new Set([spawn.id, goal.id, bossHome.id]);
  const chestRooms = detourRank(grid, offLimits, depth).slice(
    0,
    Math.max(2, Math.round(grid.chambers.length / 5)),
  );
  const chestIds = new Set(chestRooms.map((c) => c.id));
  const throughfare = grid.chambers
    .filter((c) => !offLimits.has(c.id) && !chestIds.has(c.id))
    .sort((a, b) => (depth[a.id] as number) - (depth[b.id] as number));
  // The trader keeps a mid-depth cell — the halfway shop every mission wants,
  // wherever halfway turned out to be.
  const shopRoom = throughfare[Math.floor(throughfare.length / 2)] ?? spawn;
  // The boss's room stays quiet (a knot there floods the fight); the LIFT's room
  // does not — a guard on the way down is the whole reward for finding it.
  const quiet = new Set([bossHome.id, shopRoom.id, ...chestIds]);

  // --- The horde ------------------------------------------------------------
  const knots = buildSpawners(
    bp,
    grid,
    depth,
    quiet,
    new Map([[spawn.id, farSide(spawn, playerSpawn)]]),
    rng,
  );
  // A knot is named after the cell it holds (`k<id>`), so an elite standing in
  // that cell can name it as its `alarms` link without a lookup table.
  const knotted = new Set(knots.map((k) => k.id));
  const knotIn = (c: Chamber): string | undefined =>
    knotted.has(`k${c.id}`) ? `k${c.id}` : undefined;
  const spawners = [...knots, ...buildHellgates(bp, grid, spawn, bossHome)];

  // --- The set pieces -------------------------------------------------------
  const spawns: SpawnSpec[] = [];
  // The LAIRS and the houses they live in, filled in as the elites are placed.
  const lairs: NonNullable<LevelDef["lairs"]> = [];
  const lairHouses: NonNullable<LevelDef["buildings"]> = [];
  // One lair per cell — two named neighbours on the same patch of street reads
  // as a coincidence rather than as somebody's house.
  const lairRooms = new Set<number>();
  const elitePool = throughfare.length > 0 ? throughfare : grid.chambers;
  const eliteRooms = spread(elitePool, bp.elites.length);
  bp.elites.forEach((piece, i) => {
    const room = eliteRooms[i] as Chamber;
    const at = pointIn(
      room,
      rng,
      Math.min(WALL_INSET * 1.5, room.w / 3, room.h / 3),
    );
    // An elite that LIVES somewhere gets a house instead of a patch of floor: the
    // structure goes down here (so it never collides with the street blocks the
    // dressing pass lays out later), and the mob itself stays off the field until
    // the hero walks up to the door (see lairs.ts).
    const house = piece.lair
      ? bp.objects.find((o) => o.id === piece.lair && o.type === "lair")
      : undefined;
    if (house) {
      // A lair says where it belongs (`areas`), and it means it: a marshal's
      // house standing alone in the desert is a set, where the same house on the
      // street is a house the hero has already walked past. So the elite is
      // re-homed into a cell of the right kind if the carve grew one, and only
      // falls back to its spread pick if it did not.
      const home =
        house.areas && !lairRooms.has(room.id)
          ? (elitePool.find(
              (c) => house.areas?.includes(c.area) && !lairRooms.has(c.id),
            ) ?? room)
          : room;
      lairRooms.add(home.id);
      const at2 =
        home === room
          ? at
          : pointIn(
              home,
              rng,
              Math.min(WALL_INSET * 1.5, home.w / 3, home.h / 3),
            );
      at.x = at2.x;
      at.y = at2.y;
      const w = house.w ?? 72;
      const h = house.h ?? 60;
      lairHouses.push({ sprite: house.sprite ?? house.id, pos: at, w, h });
      const entry: NonNullable<LevelDef["lairs"]>[number] = {
        id: `lair${i}`,
        // The door is on the SOUTH face — the camera looks down and slightly on,
        // so the near face is the one the player can see swing open.
        pos: vec(Math.round(at.x), Math.round(at.y + h / 2)),
        enemy: piece.enemy,
        level: piece.level,
        hp: piece.hp,
        sprite: house.door ?? "lair_door",
        openSprite: house.doorOpen ?? `${house.door ?? "lair_door"}_open`,
      };
      if (house.trigger !== undefined) entry.triggerRadius = house.trigger;
      if (piece.escort)
        entry.escort = piece.escort.map((g) => ({
          enemy: g.enemy,
          count: g.count,
          level: g.level,
          hp: g.hp,
        }));
      lairs.push(entry);
      return;
    }
    spawns.push(...pinSetPiece(piece, at, rng, room, knotIn(room)));
  });

  // The caches and their keepers: the deepest detours, each a cul-de-sac worth
  // stepping into — the "explore for loot" lesson the hand-authored maps teach
  // with two authored pockets, here as many as the grid grew.
  const chests: NonNullable<LevelDef["chests"]> = [];
  const quietZones: Zone[] = [];
  chestRooms.forEach((room, i) => {
    chests.push({
      at: pointIn(room, rng, Math.min(WALL_INSET, room.w / 3, room.h / 3)),
    });
    quietZones.push(chamberZone(room, "CACHE"));
    const keeper = bp.guardians[i % bp.guardians.length];
    if (keeper)
      spawns.push(...pinSetPiece(keeper, chamberCenter(room), rng, room));
  });

  // The boss holds the goal cell — the annex when the mission ends in one, the
  // carved corner otherwise — offset off dead centre so a `reachExit` door (or
  // its landmark) is not standing inside him. His escort stands with him.
  if (bp.boss)
    spawns.push(
      ...pinSetPiece(
        bp.boss,
        vec(
          Math.round(goalCenter.x + Math.min(bossHome.w / 5, 120)),
          Math.round(goalCenter.y - Math.min(bossHome.h / 5, 100)),
        ),
        rng,
        bossHome,
      ),
    );

  // --- The breathers --------------------------------------------------------
  const merchantAt = pointIn(
    shopRoom,
    rng,
    Math.min(WALL_INSET, shopRoom.w / 3, shopRoom.h / 3),
  );
  // The trader's pitch is the one true SAFE pocket — the horde is pushed out of
  // it, the way every hand-authored map treats its stall (PIT STOP, AIRLOCK,
  // SALOON).
  const safeZones: Zone[] = [
    { shape: "circle", pos: merchantAt, radius: 190, label: "TRADING POST" },
  ];
  // THE LANDING IS QUIET, NOT SAFE. It is a breather — the opening cell should be
  // somewhere to read the map from rather than somewhere to be ambushed in — and a
  // QUIET zone buys exactly that: no ambient horde is placed in it. A SAFE zone
  // (what this used to be) also REPELS every minion out of it and holds them at
  // its edge, which is a bubble the hero can stand in untouched all run — and on
  // goodco_hq it froze the mission's opening beat solid: the scripted rusher was
  // shoved back out of the pad it was placed in and could never land the touch
  // that draws the hero's blade. No hand-authored map puts a safe zone on the
  // landing; they spend them on the trader's stall.
  quietZones.push({
    shape: "circle",
    pos: playerSpawn,
    radius: 170,
    label: "LANDING",
  });

  // --- The errand cast ------------------------------------------------------
  // A carve replaces the authored spawn list wholesale, which is right for the
  // HORDE (the cell knots are this map's horde) and wrong for the handful of
  // NEUTRAL mobs an errand sends the hero to talk to: drop those and a campaign
  // chain simply cannot be finished on a generated map, with nothing on screen
  // to say why. They are re-homed rather than kept at their authored spot — a
  // bystander in a wall is no better than a missing one — into a knot-bearing
  // cell picked off the carve's own stream, so the map still has to be searched
  // for them. Everything about them beyond the position is the authored def.
  for (const spawn of base.spawns ?? []) {
    if (!("at" in spawn) || spawn.at === undefined) continue;
    if (enemyDef(spawn.enemy).disposition !== "neutral") continue;
    // A cell the horde stands in, so the bystander is somewhere the player has
    // a reason to walk — never the boss's cell, the trader's or a cache's,
    // which are quiet by design and would hide him behind the ending.
    const rooms = grid.chambers.filter((c) => knotIn(c) !== undefined);
    const room = rooms[Math.floor(rng() * rooms.length)];
    if (!room) continue;
    const at = chamberCenter(room);
    spawns.push({ ...spawn, at: vec(Math.round(at.x), Math.round(at.y)) });
  }

  // --- Props ----------------------------------------------------------------
  const landmarks: LevelDef["landmarks"] = bp.objects
    .filter((o) => o.type === "landmark")
    .map((o) => {
      const pos =
        o.at === "goal"
          ? vec(Math.round(goalCenter.x), Math.round(goalCenter.y))
          : vec(Math.round(playerSpawn.x), Math.round(playerSpawn.y));
      const mark: LevelDef["landmarks"][number] = { kind: o.kind ?? o.id, pos };
      if (o.sprite) mark.sprite = o.sprite;
      if (o.anchor) mark.anchor = o.anchor;
      return mark;
    });

  // --- Assemble -------------------------------------------------------------
  // Inherit every non-geometry field, then override exactly what the carve owns.
  // `path` is deliberately DROPPED: no intended route means no guidance arrow,
  // which is what turns the run into a search. `waves` and `tempo` go too — the
  // cell knots are this map's horde, and a level uses one model or the other —
  // as do the authored `doors`, `propLines` and `packs`, whose coordinates mean
  // nothing on geometry they were not drawn for.
  const inherited: LevelDef = { ...base };
  for (const key of DROPPED_ON_CARVE) delete inherited[key];
  // Two exclusion sets, and the difference matters. Nothing STRUCTURAL goes in
  // the hero's landing cell or the lift's cell. The annex joins that list only
  // for the mission's own PICKUPS and hazards — Ada's trail belongs along the
  // walk, not stranded past a lift — while its furniture is the whole point of
  // it: the control room has to look like a control room.
  const endpoints = new Set([spawn.id, goal.id]);
  const offMap = new Set([spawn.id, goal.id, bossHome.id]);
  const walls: NonNullable<LevelDef["walls"]> = buildWalls(
    bp,
    wallSegments(grid, bp.layout.doorWidth),
  );
  // The annex's own box, the one wall set not derived from a border — it has
  // none, which is the point of it (see `MapAnnex`).
  if (annexRoom && bp.annex)
    walls.push(
      ...annexWalls(
        bp,
        annexRoom,
        areaById(bp.areas, bp.annex.area).wall ?? bp.layout.wall,
      ),
    );
  const def: LevelDef = {
    ...inherited,
    width,
    height,
    // Each district's own floor, as regional overrides on the mission's tiles —
    // plus, past the carve, the dead rock the annex was cut into.
    tiles: buildTiles(
      base,
      bp,
      grid,
      width,
      height,
      rng,
      bp.annex?.ground
        ? {
            rect: { x: 0, y: spec.height, width, height: band },
            ground: bp.annex.ground,
          }
        : undefined,
    ),
    playerSpawn,
    landmarks,
    objective:
      base.objective.type === "reachExit"
        ? { ...base.objective, at: vec(goalCenter.x, goalCenter.y) }
        : base.objective,
    spawns,
    spawners,
    chests,
    safeZones,
    quietZones,
    merchantSpawns: [merchantAt],
    obstacles: buildObstacles(bp, grid, rng),
    decor: buildDecor(bp, grid, rng),
    walls,
  };
  // THE LIFT — a pad in the carved cell the boss regions picked, and its twin in
  // the annex riding back up. Two pads that name each other's positions make it a
  // two-way car, so a hero who went down for a look can come back for the loot he
  // left upstairs.
  if (annexRoom && liftAt && bp.annex) {
    const padSprite = bp.annex.padSprite ?? "elevator_pad";
    const arrival = vec(
      Math.round(chamberCenter(annexRoom).x),
      Math.round(annexRoom.y + annexRoom.h - WALL_INSET),
    );
    def.elevators = [
      {
        id: "lift_down",
        pos: vec(Math.round(liftAt.x), Math.round(liftAt.y)),
        to: arrival,
        sprite: padSprite,
        ...(bp.annex.downLabel ? { label: bp.annex.downLabel } : {}),
      },
      {
        id: "lift_up",
        pos: arrival,
        to: vec(Math.round(liftAt.x), Math.round(liftAt.y)),
        sprite: padSprite,
        ...(bp.annex.upLabel ? { label: bp.annex.upLabel } : {}),
      },
    ];
  }
  const fauna = buildFauna(bp, grid, rng);
  if (fauna) def.fauna = fauna;
  if (lairs.length > 0) def.lairs = lairs;
  if (bp.rareSpawns) def.rareSpawns = bp.rareSpawns;
  // The lair houses go down FIRST, so the street blocks that follow keep their
  // clearance from them rather than the other way round.
  const buildings = [
    ...lairHouses,
    ...buildBuildings(bp, grid, endpoints, rng, lairHouses),
  ];
  if (buildings.length > 0) def.buildings = buildings;
  // The ranks go in every cell but the two endpoints: the hero must land on clear
  // floor, and the boss needs room to be fought in.
  const rows = buildRows(bp, grid, endpoints, rng);
  if (rows.length > 0) def.propLines = rows;
  const placedItems = buildPlacedItems(base, grid, depth, offMap, rng);
  if (placedItems) def.placedItems = placedItems;
  const wells = buildWells(base, grid, offMap, rng);
  if (wells) def.wells = wells;
  // The scripted first-blow beat re-anchors beside the hero: it exists to put a
  // harmless swing on him in the opening seconds, which only works within sight.
  if (base.openingStrike) {
    def.openingStrike = {
      ...base.openingStrike,
      at: vec(
        Math.round(playerSpawn.x + Math.min(spawn.w / 4, 200)),
        Math.round(playerSpawn.y),
      ),
    };
    // …AND ITS SUPPORTING CAST COMES WITH IT. The beat is a two-parter held in
    // order by `after`: the hero reads the crowd ("these are STAFF"), and only
    // then does the one that rushes him draw his blade (`stepOpeningStrike`
    // waits on that thought). The hand-authored map stands the crowd at his
    // elbow, so the first line lands in the opening second. A carve puts the
    // horde in knots a district apart, which left the nearest of that breed 500
    // px away on goodco_hq — so the rusher arrived, struck a hero the gate would
    // not arm, and he stayed HOLSTERED, chased around a map he could not fight
    // on until he happened to walk into one. So the crowd is pinned where he
    // lands, inside the pin's own sighting radius, exactly as it is authored.
    const pin = base.openingStrike.after
      ? base.firstSightThoughts?.find(
          (t) => t.thought === base.openingStrike?.after,
        )
      : undefined;
    if (pin) {
      const reach = Math.min((pin.radius ?? DIALOGUE.sightRadius) * 0.5, 120);
      for (let i = 0; i < OPENING_CROWD; i++) {
        const angle = ((i + rng()) / OPENING_CROWD) * Math.PI * 2;
        def.spawns.push({
          enemy: pin.enemy,
          at: vec(
            Math.round(playerSpawn.x + Math.cos(angle) * reach),
            Math.round(playerSpawn.y + Math.sin(angle) * reach),
          ),
        });
      }
    }
  }
  return def;
}
