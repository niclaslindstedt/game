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
import type { LevelDef, SpawnerSpec, SpawnSpec } from "../defs/levels/types.ts";
import type { Zone } from "../zones.ts";
import { areaById, type MapArea } from "./areas.ts";
import {
  buildBuildings,
  buildDecor,
  buildObstacles,
  buildPlacedItems,
  buildTiles,
  buildWalls,
  buildWells,
  chamberZone,
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
import type {
  MapBlueprint,
  MapSetPiece,
  MapSizeName,
} from "./types.ts";

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
  const eligible = grid.chambers.filter(
    (c) => areaOf(areas, c).boss !== false,
  );
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
  const pool = eligible.length > 0 ? eligible : grid.chambers.filter((c) => c.id !== goal.id);
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
 * The ambient horde as one finite knot per cell (see `SpawnerSpec`): it arms when
 * the hero walks in, drains as he clears it, and lets him move on. The knot's mob
 * LEVEL climbs the blueprint's ramp ladder with depth and its BREEDS hand over
 * along their authored windows, so the search gets tougher and stranger the
 * deeper it runs. A cell's AREA scales the count (`horde`), so a scrapyard stands
 * thicker than a plain.
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
  const avgArea =
    grid.chambers.reduce((sum, c) => sum + c.w * c.h, 0) / grid.chambers.length;
  const out: SpawnerSpec[] = [];
  for (const c of grid.chambers) {
    if (quiet.has(c.id)) continue;
    const area = areaOf(bp.areas, c);
    const hordeMult = area.horde ?? 1;
    if (hordeMult <= 0) continue;
    const d = depth[c.id] as number;
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
    // A bigger cell holds a bigger fight, but only up to a point: the carve can
    // grow one cell three times the average, and a knot scaled straight off area
    // becomes a hundred-mob grind the hero cannot drain at the alive cap.
    const areaScale = Math.max(0.75, Math.min(1.35, (c.w * c.h) / avgArea));
    const total =
      Math.round(
        (perRoom[0] + rng() * (perRoom[1] - perRoom[0])) * areaScale * hordeMult,
      ) || 1;
    const weightSum = live.reduce((sum, m) => sum + (m.weight ?? 1), 0);
    const mix = live.map((m) => ({
      enemy: m.enemy,
      count: Math.max(1, Math.round((total * (m.weight ?? 1)) / weightSum)),
    }));
    const knot: SpawnerSpec = {
      id: `k${c.id}`,
      at: anchors.get(c.id) ?? chamberCenter(c),
      members: mix,
      mobLevels: ramps[rampIndex],
      maxAlive,
      // Wide enough that entering the cell by ANY of its doorways arms the knot —
      // a knot that only wakes at the room's exact centre lets the hero walk its
      // wall and never meet it.
      triggerRadius: Math.round(Math.max(300, Math.min(c.w, c.h) * 0.6)),
    };
    if (lingering !== undefined) knot.lingering = lingering;
    out.push(knot);
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
): SpawnerSpec[] {
  const hellborn = bp.hellborn;
  const want = bp.horde.hellgates ?? 0;
  if (!hellborn || want <= 0) return [];
  const pool = grid.chambers.filter((c) => c.id !== spawn.id);
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

/** The point in a cell FARTHEST from `from` — where the opening knot stands, so
 * the hero has floor to land on before he meets it. */
function farSide(c: Chamber, from: Vec2): Vec2 {
  const inset = Math.min(WALL_INSET * 1.5, c.w / 3, c.h / 3);
  return vec(
    Math.round(from.x > c.x + c.w / 2 ? c.x + inset : c.x + c.w - inset),
    Math.round(from.y > c.y + c.h / 2 ? c.y + inset : c.y + c.h - inset),
  );
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
  const steps = doorDistances(grid, spawn.id);
  const reach = Math.max(1, ...steps.filter((d) => Number.isFinite(d)));
  const depth = steps.map((d) => (Number.isFinite(d) ? d / reach : 1));
  const playerSpawn = pointIn(
    spawn,
    rng,
    Math.min(WALL_INSET * 1.4, spawn.w / 3, spawn.h / 3),
  );
  const goalCenter = chamberCenter(goal);

  // --- The quiet cells ------------------------------------------------------
  // Decided BEFORE the horde, because they are decided BY excluding it: a cache
  // cul-de-sac and the trader's pitch carry design zones that suppress ambient
  // spawns, so a knot placed there would budget forty mobs that never arrive.
  const chestRooms = detourRank(
    grid,
    new Set([spawn.id, goal.id]),
    depth,
  ).slice(0, Math.max(2, Math.round(grid.chambers.length / 5)));
  const chestIds = new Set(chestRooms.map((c) => c.id));
  const throughfare = grid.chambers
    .filter((c) => c.id !== spawn.id && c.id !== goal.id && !chestIds.has(c.id))
    .sort((a, b) => (depth[a.id] as number) - (depth[b.id] as number));
  // The trader keeps a mid-depth cell — the halfway shop every mission wants,
  // wherever halfway turned out to be.
  const shopRoom = throughfare[Math.floor(throughfare.length / 2)] ?? spawn;
  const quiet = new Set([goal.id, shopRoom.id, ...chestIds]);

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
  const spawners = [...knots, ...buildHellgates(bp, grid, spawn)];

  // --- The set pieces -------------------------------------------------------
  const spawns: SpawnSpec[] = [];
  const elitePool = throughfare.length > 0 ? throughfare : grid.chambers;
  const eliteRooms = spread(elitePool, bp.elites.length);
  bp.elites.forEach((piece, i) => {
    const room = eliteRooms[i] as Chamber;
    spawns.push(
      ...pinSetPiece(
        piece,
        pointIn(room, rng, Math.min(WALL_INSET * 1.5, room.w / 3, room.h / 3)),
        rng,
        room,
        knotIn(room),
      ),
    );
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

  // The boss holds the goal cell, offset off dead centre so a `reachExit` door
  // (or its landmark) is not standing inside him.
  if (bp.boss)
    spawns.push({
      enemy: bp.boss.enemy,
      at: vec(
        Math.round(goalCenter.x + Math.min(goal.w / 5, 120)),
        Math.round(goalCenter.y - Math.min(goal.h / 5, 100)),
      ),
      level: bp.boss.level,
      hp: bp.boss.hp,
    });

  // --- The breathers --------------------------------------------------------
  const merchantAt = pointIn(
    shopRoom,
    rng,
    Math.min(WALL_INSET, shopRoom.w / 3, shopRoom.h / 3),
  );
  const safeZones: Zone[] = [
    // The landing pad: a small breather at the hero's feet, so the opening cell is
    // somewhere to read the map from rather than somewhere to be ambushed in.
    { shape: "circle", pos: playerSpawn, radius: 170, label: "LANDING" },
    { shape: "circle", pos: merchantAt, radius: 190, label: "TRADING POST" },
  ];

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
  const endpoints = new Set([spawn.id, goal.id]);
  const def: LevelDef = {
    ...inherited,
    width: spec.width,
    height: spec.height,
    // Each district's own floor, as regional overrides on the mission's tiles.
    tiles: buildTiles(base, bp, grid, spec.width, spec.height),
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
    walls: buildWalls(bp, wallSegments(grid, bp.layout.doorWidth)),
  };
  if (bp.rareSpawns) def.rareSpawns = bp.rareSpawns;
  const buildings = buildBuildings(bp, grid, endpoints, rng);
  if (buildings.length > 0) def.buildings = buildings;
  const placedItems = buildPlacedItems(base, grid, depth, endpoints, rng);
  if (placedItems) def.placedItems = placedItems;
  const wells = buildWells(base, grid, endpoints, rng);
  if (wells) def.wells = wells;
  // The scripted first-blow beat re-anchors beside the hero: it exists to put a
  // harmless swing on him in the opening seconds, which only works within sight.
  if (base.openingStrike)
    def.openingStrike = {
      ...base.openingStrike,
      at: vec(
        Math.round(playerSpawn.x + Math.min(spawn.w / 4, 200)),
        Math.round(playerSpawn.y),
      ),
    };
  return def;
}
