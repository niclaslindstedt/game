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
import { clamp, distance, vec, type Vec2 } from "@game/lib/vec.ts";
import { DIALOGUE } from "../config/index.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import type {
  LevelDef,
  LevelLight,
  MissionDef,
  SpawnerSpec,
  SpawnSpec,
} from "../defs/levels/types.ts";
import { zonesBounds, type Zone } from "../zones.ts";
import { areaById, spaceOf, type MapArea } from "./areas.ts";
import {
  annexWalls,
  buildBuildings,
  buildDecor,
  buildFauna,
  buildObstacles,
  buildPlacedItems,
  buildPrefabProps,
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
  doorGaps,
  planChambers,
  wallSegments,
  type Chamber,
  type ChamberGrid,
  type DoorGap,
} from "./rooms.ts";
import type {
  MapAnchor,
  MapBlueprint,
  MapObject,
  MapSetPiece,
} from "./types.ts";

/**
 * Mixed into the run seed before the layout stream is drawn, so a map's GEOMETRY
 * and its run's rolls (loot, scatter, mob picks) never walk the same sequence —
 * two runs on adjacent seeds would otherwise share a suspicious amount of shape.
 */
const LAYOUT_SALT = 0x9e3779b9;

/**
 * Fields of the hand-authored level a carve DROPS rather than inherits, because
 * every one of them is tied to geometry that no longer exists.
 *
 * `path` is the load-bearing one: an intended route is what drives the app's
 * guidance arrow, and an arrow pointing at the boss is the opposite of a search.
 * `waves`/`tempo` go because the cell knots are this map's horde and a level uses
 * one model or the other; `doors`, `propLines`, `packs` and `lights` go because
 * their coordinates were drawn for a map that is not this one — the carve hangs
 * its own doors and hangs its own lamps.
 */
const DROPPED_ON_CARVE = [
  "path",
  "waves",
  "tempo",
  "doors",
  "propLines",
  "packs",
  "lights",
] as const satisfies readonly (keyof MissionDef)[];

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
  /** The cell the hero is PINNED to land in (`MapArea.landing`), when a
   * blueprint names one — see the note below. */
  landing?: Chamber,
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
  let candidates = inside.length > 0 ? inside : pool;
  // A PINNED ARRIVAL INVERTS THE ORDER OF THESE TWO PICKS. Normally the boss is
  // rolled first and the hero is stood as far from it as the grid allows, which
  // is what makes the search long. When the landing is a fact about the mission
  // instead (`MapArea.landing` — GOODCO's car park, one cell, in a corner rolled
  // per run), the hero cannot be moved: two rolled corners can be the same
  // corner, and then the run opens with the objective 600 px away. So the boss
  // gives ground rather than the arrival — its own region first, the rest of the
  // map if that region has nothing far enough, and only then the best available.
  if (landing) {
    const far = Math.hypot(width, height) / 3;
    const away = (c: Chamber): number => {
      const mid = chamberCenter(c);
      const from = chamberCenter(landing);
      return Math.hypot(mid.x - from.x, mid.y - from.y);
    };
    const clear = candidates.filter((c) => away(c) >= far);
    const elsewhere = pool.filter((c) => away(c) >= far);
    candidates =
      clear.length > 0
        ? clear
        : elsewhere.length > 0
          ? elsewhere
          : [pool.reduce((best, c) => (away(c) > away(best) ? c : best))];
  }
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
  /** Did an AUTHORED PLAN draw these rooms? Then `spawn: false` is the law
   * rather than a preference — see the LONG WALK note at the bottom. */
  planned = false,
): Chamber {
  // THE ARRIVAL, when a district claims it (`MapArea.landing`): the pool is that
  // district and the fallback below is off. `spawn` is a permission and the
  // fallback exists to rescue a carve that grew too little of the preferred
  // district; `landing` is a statement about the MISSION — the hero parks in the
  // lot and walks in — and there is nothing for a fallback to rescue, only a
  // scene for it to skip.
  const landings = new Set(
    areas.filter((a) => a.landing === true).map((a) => a.id),
  );
  const pinned = landings.size > 0;
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
  //
  // …and the slack WIDENS until the landing is genuinely far away. One doorway
  // of it is enough almost always; on the seeds where it is not, every cell at
  // the graph's far end sits in the boss's own neighbourhood and the map opens
  // with the objective in plain sight — measured, one goodco seed in eight
  // landed the hero 540 px from PAYLOAD-1. So the doorway requirement is
  // relaxed a door at a time until the winner clears a floor of a third of the
  // map's diagonal, which is the distance at which the thing being hidden is
  // over the horizon rather than across the room.
  const floor = Math.hypot(width, height) / 3;
  const pickFarthest = (pool: Chamber[]): Chamber => {
    const maxReach = pool.reduce((m, c) => Math.max(m, reach(c)), 0);
    let best: Chamber | null = null;
    for (let slack = 1; slack <= maxReach + 1; slack++) {
      const tied = pool.filter((c) => reach(c) >= maxReach - slack);
      best = tied.reduce((far, c) => (gap(c) > gap(far) ? c : far));
      if (gap(best) >= floor) break;
    }
    return best as Chamber;
  };
  const anywhere = grid.chambers.filter((c) => c.id !== goal.id);
  const eligible = anywhere.filter((c) =>
    pinned ? landings.has(c.area) : areaOf(areas, c).spawn !== false,
  );
  const pool = eligible.length > 0 ? eligible : anywhere;
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
    if (inside.length > 0) {
      const pick = pickFarthest(inside);
      if (gap(pick) >= floor) return pick;
    }
  }
  const pick = pickFarthest(pool);
  // WHERE he may land is a preference; the LONG WALK is the rule. A carve can
  // come out with barely any of the district a mission lands its hero on — one
  // outdoor cell on a floor of sealed labs — and then the preference decides the
  // landing all by itself, boss in plain sight. When that happens the whole map
  // is back in play and the far side of it wins.
  //
  // UNDER AN AUTHORED PLAN IT IS THE RULE INSTEAD, for the same reason
  // `plan.goal` beats the rolled one: the districts are DRAWN, not grown, so
  // "the carve came out short of somewhere to land" cannot happen and the
  // fallback has nothing to rescue. Left in, it quietly overrules the author —
  // adding a strip of road down one edge of the garage stretched the map's
  // diagonal past this floor and the hero opened the hub standing in the middle
  // of the public highway, with the roll-up door hung on the wrong room behind
  // him.
  return gap(pick) >= floor || pool === anywhere || planned || pinned
    ? pick
    : pickFarthest(anywhere);
}

/**
 * THE HORDE'S DENSITY: spawn points per million world px² of MAP.
 *
 * Measured off the campaign it has to feel like — the hand-authored maps stand at
 * 1.6 (boot_hill, the rift, mars) to 1.8 (the moon) knots per million px², which
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
 * The smallest room (shortest edge, world px) a PATROLLING set piece may be
 * placed in.
 *
 * `patrolBeat` insets its waypoint off the walls, so the round a room can offer
 * is its edge minus two insets — and below about this the remainder is a pace or
 * two, which reads as a man fidgeting rather than as a sentry walking his patch.
 * Better a sentry in the wrong room than a sentry standing still: the pacing IS
 * the set piece.
 */
const PATROL_ROOM = 460;

/**
 * How far off the hero the OPENING STRIKE's rusher is stood — a floor and a
 * ceiling on the step it has to cross.
 *
 * The beat is two-part and ordered: the hero reads the crowd, and only then does
 * the one that breaks from it draw his blade. That only reads as a rush if the
 * rusher is somewhere to rush FROM, so the floor matters more than the ceiling —
 * placed a quarter of the way across a small landing it is already there when
 * the read fires, and the scene plays as a man being shoved rather than charged.
 */
const OPENING_REACH = 170;
const OPENING_REACH_MAX = 200;

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
  //
  // AND NEVER OUTDOORS, on a map that has an inside at all. A gate is a tear in
  // the world with a crop of hellborn coming out of it, and the ground outside a
  // building is the ground a level uses for its quiet: the staff lot, the
  // forecourt, the approach. A district authored with no ambient horde on it
  // (`MapArea.horde: 0`) has said the same thing in the other direction, so both
  // are read here — a quarter the map deliberately keeps empty is not a quarter
  // to hang a rampage on.
  const indoors = grid.chambers.some(
    (c) => spaceOf(areaOf(bp.areas, c)) === "inside",
  );
  const pool = grid.chambers.filter((c) => {
    if (c.id === spawn.id || c.id === bossHome.id) return false;
    const area = areaOf(bp.areas, c);
    if ((area.horde ?? 1) <= 0) return false;
    return !indoors || spaceOf(area) === "inside";
  });
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

/**
 * HOW FAR PAST THE ENTRANCE THE FIRST ROOM'S BEAT STANDS (world px).
 *
 * Well clear of the doorway, because the scene it anchors is a CROWD with a
 * rusher in it and the doorway is the one piece of floor the hero has to be
 * able to walk through. Held to the room, so a small first room simply plays
 * the beat at its middle instead of through its far wall.
 */
const ENTRANCE_INSIDE = 210;

/** The blueprint's `at: entrance` door, on a map that actually has a lot to
 * hang it off. Undefined everywhere but GOODCO. */
function entranceObject(
  bp: MapBlueprint,
  arrivalCells: Set<number>,
): MapObject | undefined {
  return arrivalCells.size > 0
    ? bp.objects.find((o) => o.type === "door" && o.at === "entrance")
    : undefined;
}

/** Is this border the wall between the staff lot and the building? */
function crossesTheLot(
  border: { a: number; b: number },
  arrivalCells: Set<number>,
): boolean {
  return arrivalCells.has(border.a) !== arrivalCells.has(border.b);
}

/**
 * GIVE EVERY DOOR THAT SIZES ITS OWN HOLE (`MapObject.opening`) the hole it
 * asked for — on the BORDER, before a single wall stone is placed.
 *
 * A doorway's width is otherwise a fact about the DISTRICT that owns the wall
 * (`MapArea.doorWidth`), which is the right owner for nearly every door in the
 * game: a cupboard door and a hangar door are what the rooms either side of
 * them are for. It is the wrong owner for a door that is one specific OBJECT —
 * GOODCO's front gate, which is punched through whichever wall the carve put
 * the staff lot against and so came out 220 px wide, a hangar opening, on every
 * seed that landed the lot beside an assembly bay.
 *
 * The precedence is `hangDoor`'s, because it has to be: the ENTRANCE claims a
 * border before the district's own door gets a look at it, so a border that is
 * both is sized by the entrance. Nothing here decides WHICH doorways exist —
 * that was the carve's call and is already made — so this can only ever change
 * how wide a hole already punched is cut.
 */
function sizeOpenings(
  bp: MapBlueprint,
  grid: ChamberGrid,
  arrivalCells: Set<number>,
): void {
  const entrance = entranceObject(bp, arrivalCells);
  const doorOf = (id: string | undefined): MapObject | undefined =>
    id ? bp.objects.find((o) => o.id === id && o.type === "door") : undefined;
  for (const border of grid.borders) {
    if (border.link !== "door") continue;
    const obj =
      entrance && crossesTheLot(border, arrivalCells)
        ? entrance
        : doorOf(areaById(bp.areas, border.owner).doors);
    if (obj?.opening !== undefined) border.door = obj.opening;
  }
}

/** How far a doorway's mid-point is from the middle of the staff lot — the one
 * ordering `planArrivals` and the carve both read "the entrance" off. */
function gapNearness(
  gap: DoorGap,
  lot: { minX: number; minY: number; maxX: number; maxY: number } | null,
): number {
  if (!lot) return 0;
  const mid = (gap.from + gap.to) / 2;
  const at = gap.axis === "v" ? vec(gap.coord, mid) : vec(mid, gap.coord);
  return distance(at, {
    x: (lot.minX + lot.maxX) / 2,
    y: (lot.minY + lot.maxY) / 2,
  });
}

/**
 * THE FIRST ROOM PAST THE WAY IN — the point a step inside the entrance, and
 * the room it stands in.
 *
 * A doorway gap names the two cells it joins and the axis it was punched
 * through, which is everything needed: the side that is NOT the staff lot is
 * the building, the opening's midpoint is the threshold, and walking straight
 * in off it along the wall's normal lands in the room. Returns null on a map
 * with no entrance at all, which is every map but GOODCO.
 */
function insideEntrance(
  grid: ChamberGrid,
  gap: DoorGap | undefined,
  isLot: (id: number) => boolean,
): { at: Vec2; room: Chamber } | null {
  if (!gap) return null;
  const room = grid.chambers.find(
    (c) => c.id === (isLot(gap.a) ? gap.b : gap.a),
  );
  if (!room) return null;
  // The threshold, and the way through it: the opening runs down `axis`, so
  // walking IN is a step along the other one, toward the room's own middle.
  const mid = (gap.from + gap.to) / 2;
  const threshold =
    gap.axis === "v" ? vec(gap.coord, mid) : vec(mid, gap.coord);
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const step = Math.min(
    ENTRANCE_INSIDE,
    // Never past the middle of a shallow room, or the beat plays in its far
    // wall — and never so short that the crowd is standing in the doorway.
    Math.max(WALL_INSET * 2, gap.axis === "v" ? room.w / 2 : room.h / 2),
  );
  const at =
    gap.axis === "v"
      ? vec(threshold.x + Math.sign(cx - threshold.x) * step, threshold.y)
      : vec(threshold.x, threshold.y + Math.sign(cy - threshold.y) * step);
  return {
    at: vec(
      Math.round(
        clamp(at.x, room.x + WALL_INSET, room.x + room.w - WALL_INSET),
      ),
      Math.round(
        clamp(at.y, room.y + WALL_INSET, room.y + room.h - WALL_INSET),
      ),
    ),
    room,
  };
}

/**
 * A BEAT ACROSS THE ROOM: the far end of the cell a set piece was placed in,
 * measured down its LONGER axis and held a wall's width off the far side.
 *
 * One waypoint is the whole route, because the engine walks `at → patrol[0]`
 * and back for as long as the mob stays dormant (`stepPatrol`) — so a single
 * point is a sweep, and a sweep is what a sentry walks. Down the long axis
 * rather than diagonally, because the diagonal of a cell is the line most
 * likely to have the room's furniture standing on it, and a patroller that
 * wedges on a crate is a patroller standing still.
 */
function patrolBeat(room: Chamber, at: Vec2): Vec2 {
  // A QUARTER of the room, not a third — and never more than the standard wall
  // clearance. The beat is what is left after the inset is taken off BOTH ends,
  // so a generous inset eats a small room's round entirely: a third of a 340 px
  // office left the night manager a 114 px shuffle. A quarter leaves him a walk
  // in the same room, and in a hall the cap does the same job it always did.
  const inset = Math.min(WALL_INSET, room.w / 4, room.h / 4);
  return room.w >= room.h
    ? vec(
        Math.round(
          at.x - room.x < room.w / 2 ? room.x + room.w - inset : room.x + inset,
        ),
        Math.round(at.y),
      )
    : vec(
        Math.round(at.x),
        Math.round(
          at.y - room.y < room.h / 2 ? room.y + room.h - inset : room.y + inset,
        ),
      );
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
  // …and one that WALKS its patch is somewhere else the second time the hero
  // comes through, which is the difference between staff and statues.
  if (piece.patrol) lead.patrol = [patrolBeat(chamber, at)];
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
    // Its own district: it is not part of anything the carve grew, which is the
    // whole point of it.
    district: grid.chambers.length,
  };
  grid.chambers.push(room);
  grid.neighbors.push([]);
  return room;
}

/**
 * Carve a `LevelDef` from a blueprint.
 *
 * @param bp    the compiled blueprint (`content/maps/<id>.yaml`)
 * @param base  the hand-authored level it inherits its story and rules from
 * @param seed  the run seed — the same one `createGame` builds the run with, so a
 *              run and its map replay together
 */
export function generateLevel(
  bp: MapBlueprint,
  base: MissionDef,
  seed: number,
): LevelDef {
  const spec = bp.size;
  const rng = createRng((seed ^ LAYOUT_SALT) >>> 0);
  // The ANNEX gets a band of its own PAST the carved rectangle (see `MapAnnex`).
  // The carve never sees it, so nothing is ever adjacent to the room the lift
  // rides to and the minimap has nothing to draw where it is.
  const annexMargin = bp.annex ? (bp.annex.margin ?? 200) : 0;
  const band = bp.annex ? bp.annex.height + annexMargin * 2 : 0;
  const width = spec.width;
  const height = spec.height + band;
  // A KEY PROMISES ITS ROOM. The lockable districts are seeded once per key
  // before the weighted roll (see `assignAreas`), because a keycard the player
  // fought an elite for and which opens nothing on this seed is worse than no
  // keycard at all — and the odds alone left a third of the runs without one.
  const lockable = bp.areas.filter((a) => a.lock === true).map((a) => a.id);
  const keyRooms =
    lockable.length > 0
      ? (bp.locks ?? []).map((_, i) => lockable[i % lockable.length] as string)
      : [];
  // …AND SO IS THE ARRIVAL, first of all. A district the hero is DECLARED to
  // land in (`MapArea.landing`) is one the map cannot be without: left to its
  // weight, a seed that never rolls it strands the landing pick with nothing
  // eligible and the mission opens wherever the fallback lands — which on
  // GOODCO is halfway down a corridor rather than out in the car park.
  const promised = [
    ...bp.areas.filter((a) => a.landing === true).map((a) => a.id),
    ...keyRooms,
  ];
  // An AUTHORED PLAN draws the rooms outright (the static hub's composed
  // shot); everything else is grown by the BSP as always. A plan consumes no
  // rng, so the dressing draws land on the same stream either way.
  const grid = bp.plan
    ? planChambers(bp.plan, bp.areas, bp.layout.doorWidth, bp.layout.wall)
    : carveChambers(
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
        promised,
        bp.prefabs ?? [],
      );
  // THE LAST WORD ON HOW WIDE THE DOORWAYS ARE, spent HERE, on the grid, the
  // moment the carve hands it over: a door that sizes its own hole
  // (`MapObject.opening`) gets it, and the walls are built round the answer.
  //
  // AFTER the carve and not inside it, which is the whole trick. How wide a
  // district's doorway is (`MapArea.doorWidth`) is an input the carve reasons
  // WITH — which borders are long enough to take a door at all, how small a
  // room may be cut before it seals itself — so narrowing it there does not
  // narrow the doorways, it redraws the building. (Measured: taking GOODCO's
  // ladder down to a person door moved every wall, gave the staff lot four ways
  // into the building instead of one, and staged the arrivals beat off the
  // hero's screen on a seed that had been fine for a year.) Applied to the HOLE
  // instead, the floor plan is the one that ships and only the opening in it
  // changes.
  const lotCells = new Set(
    grid.chambers
      .filter((c) => areaOf(bp.areas, c).arrivals === true)
      .map((c) => c.id),
  );
  sizeOpenings(bp, grid, lotCells);

  // --- Where the search ends, and where it starts ----------------------------
  // The boss first: everything else is positioned relative to him, including the
  // hero, whose whole job is to be far away. An authored plan may NAME the goal
  // room outright (`plan.goal` — the rocket stands on the lawn, not wherever
  // the roll lands); the rng is still drawn so a plan changes no later rolls.
  // …and where the hero is PINNED to land, when the blueprint says so, because
  // the boss then has to be picked away from it rather than the other way round.
  // The largest of the district's cells, so the tie is settled the same way
  // everywhere and a one-cell district (the usual case — see `maxCells`) simply
  // is the answer.
  const landingAreas = new Set(
    bp.areas.filter((a) => a.landing === true).map((a) => a.id),
  );
  const landingCell =
    landingAreas.size > 0
      ? grid.chambers
          .filter((c) => landingAreas.has(c.area))
          .sort((a, b) => b.w * b.h - a.w * a.h)[0]
      : undefined;
  const rolledGoal = pickGoalChamber(
    grid,
    bp.areas,
    bp.boss ? bp.boss.regions : ["center"],
    spec.width,
    spec.height,
    rng,
    landingCell,
  );
  const goal =
    (bp.plan?.goal
      ? grid.chambers.find((c) => c.area === bp.plan?.goal)
      : undefined) ?? rolledGoal;
  const spawn = pickSpawnChamber(
    grid,
    bp.areas,
    goal,
    bp.spawnRegions,
    spec.width,
    spec.height,
    rng,
    bp.plan !== undefined,
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
  // A LOCKABLE cell is a dead end by construction, which is exactly what the
  // cache picker looks for — so without this the two features fight over the
  // same rooms and a map's one keyed door goes missing on the seeds where the
  // cache won. The vaults pay their own cache out below.
  const lockableIds = new Set(
    grid.chambers
      .filter((c) => areaOf(bp.areas, c).lock === true)
      .map((c) => c.id),
  );
  // A blueprint with NO chest object pays no caches at all (the garage: a
  // hero does not loot his own home) — the schema already warns that its
  // dead ends pay nothing, so the silence is a choice, never an accident.
  const wantsChests = bp.objects.some((o) => o.type === "chest");
  // …and HOW MANY is priced per DISTRICT, not per cell. A cache in every fifth
  // dead end is right when a dead end is a district and absurd once an interior
  // district has been cut into rooms: the same fraction of thirty offices is six
  // caches on a floor that used to pay two, which is a loot piñata rather than a
  // reward for searching (see `Chamber.district`).
  const districts = new Set(grid.chambers.map((c) => c.district)).size;
  const chestRooms = wantsChests
    ? detourRank(grid, new Set([...offLimits, ...lockableIds]), depth).slice(
        0,
        Math.max(2, Math.round(districts / 5)),
      )
    : [];
  const chestIds = new Set(chestRooms.map((c) => c.id));

  // --- The vaults -----------------------------------------------------------
  // THE KEYED ROOMS: one sealed cell per door id the blueprint still has
  // unspent, taken from the DEEPEST lockable cells the carve grew — a locked
  // room the hero walks into in the opening minute is a locked room he has no
  // key for yet, which reads as a bug rather than as a promise.
  //
  // What goes IN is a cache and whatever knot the cell was going to hold; what
  // stays out is everything the run needs — the boss, the landing, every set
  // piece (a key locked inside the room it opens is an unfinishable run), the
  // trader, the story trail. That exclusion is not a nicety, it is the whole
  // reason this can be rolled per seed instead of drawn by hand.
  //
  // A ROOM IS A DISTRICT, NOT A CELL. Two lockable cells that grew side by side
  // are one place — a store with an inner room — so they are grouped into
  // connected components and a key is spent on the COMPONENT. Locking them
  // separately would hang a second door inside the vault the first key opened,
  // which reads as the map stuttering rather than as architecture.
  const lockCells = grid.chambers.filter(
    (c) => lockableIds.has(c.id) && !offLimits.has(c.id),
  );
  const lockIds = new Set(lockCells.map((c) => c.id));
  const rooms: Chamber[][] = [];
  const grouped = new Set<number>();
  for (const cell of lockCells) {
    if (grouped.has(cell.id)) continue;
    const room: Chamber[] = [];
    const queue = [cell];
    grouped.add(cell.id);
    while (queue.length > 0) {
      const at = queue.pop() as Chamber;
      room.push(at);
      for (const next of grid.neighbors[at.id] ?? []) {
        if (!lockIds.has(next) || grouped.has(next)) continue;
        grouped.add(next);
        queue.push(grid.chambers[next] as Chamber);
      }
    }
    rooms.push(room);
  }
  // A VAULT IS A DETOUR, NEVER THE WAY ON — and this is the check that makes it
  // one. The carve's doorway tree is free to route the map's only path THROUGH a
  // lockable district, and sealing that district cuts the mission in half:
  // measured before this existed, one goodco seed in eight put the boss, every
  // elite and the exit behind a keycard. So a room is only sealed if the map
  // still hangs together without it — every other cell reachable from the
  // landing with this room and every room already sealed taken out.
  const sealed = new Set<number>();
  const survivesWithout = (room: Chamber[]): boolean => {
    const shut = new Set([...sealed, ...room.map((c) => c.id)]);
    if (shut.has(spawn.id)) return false;
    const seen = new Set<number>([spawn.id]);
    const queue = [spawn.id];
    while (queue.length > 0) {
      const at = queue.pop() as number;
      for (const next of grid.neighbors[at] ?? []) {
        if (shut.has(next) || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return grid.chambers.every((c) => shut.has(c.id) || seen.has(c.id));
  };
  // Deepest first: a locked door in the opening minute is a door the hero has no
  // key for yet, which reads as a wall rather than as a promise.
  const vaultRooms: Chamber[][] = [];
  const byDepth = rooms.sort(
    (a, b) =>
      Math.max(...b.map((c) => depth[c.id] as number)) -
      Math.max(...a.map((c) => depth[c.id] as number)),
  );
  for (const room of byDepth) {
    if (vaultRooms.length >= (bp.locks ?? []).length) break;
    if (!survivesWithout(room)) continue;
    for (const cell of room) sealed.add(cell.id);
    vaultRooms.push(room);
  }
  // The id each one answers to — a real key, carried by somebody outside it.
  const vaultKeys = new Map<number, string>();
  vaultRooms.forEach((room, i) => {
    for (const cell of room)
      vaultKeys.set(cell.id, (bp.locks as string[])[i] as string);
  });
  const vaultIds = new Set(vaultKeys.keys());

  const throughfare = grid.chambers
    .filter(
      (c) => !offLimits.has(c.id) && !chestIds.has(c.id) && !vaultIds.has(c.id),
    )
    .sort((a, b) => (depth[a.id] as number) - (depth[b.id] as number));
  // The trader keeps a mid-depth cell — the halfway shop every mission wants,
  // wherever halfway turned out to be. An authored plan may park him outright
  // (`plan.stall` — the vending machine on the paved drive).
  // A trader who WORKS A PITCH starts on his pitch, so a flagged beat outranks
  // even an authored stall: the strip is where he spends the whole run, and a
  // counter anchored somewhere else would put his safe pocket, his map pin and
  // whatever light the map hangs on him a district away from the man.
  const shopRoom =
    grid.chambers.find((c) => areaOf(bp.areas, c).beat === true) ??
    (bp.plan?.stall
      ? grid.chambers.find((c) => c.area === bp.plan?.stall)
      : undefined) ??
    throughfare[Math.floor(throughfare.length / 2)] ??
    spawn;
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
  // A MAN WHO NEVER MOVES IS STILL FOUND. The opening knot stands at the FAR
  // side of the landing cell so the hero has floor to arrive on before he meets
  // it — and a knot arms on APPROACH, so in a cell wider than the default 300 px
  // trigger, a player who plants his feet and never steers is never approached
  // by anything at all. That is not the breather a quiet landing is for, it is a
  // sanctuary: measured, one goodco seed left an idle MEDIUM run alive past a
  // full minute, with only the three scripted interns ever arriving. So the
  // OPENING knot alone is widened to reach the pad. It costs the arrival nothing
  // — the mobs still have the whole room to cross, which IS the breather — and
  // it keeps the promise the whole difficulty curve rests on: doing nothing
  // loses.
  const opener = knots.find((k) => k.id === `k${spawn.id}`);
  if (opener) {
    opener.triggerRadius = Math.max(
      opener.triggerRadius ?? 0,
      Math.round(distance(opener.at, playerSpawn)) + 40,
    );
  }
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
  // The fallback matters as much as the pool: on a small carve the thoroughfare
  // can come out empty (endpoints, caches and vaults taking every cell), and
  // falling back to EVERY cell put a keycard-carrying elite inside the room his
  // own card opens. Whatever else happens, a set piece never stands in a vault.
  const openCells = grid.chambers.filter((c) => !vaultIds.has(c.id));
  const elitePool =
    throughfare.length > 0
      ? throughfare
      : openCells.length > 0
        ? openCells
        : grid.chambers;
  const eliteRooms = spread(elitePool, bp.elites.length);
  // A SENTRY NEEDS SOMEWHERE TO PACE. The beat is derived from the room the
  // piece was placed in (`patrolBeat`), so a walker dropped in a broom cupboard
  // walks nothing: measured on a goodco office wing, the janitor's whole round
  // came to 111 px, which on screen is a man shuffling on the spot. Rooms only
  // got small enough for that to happen when interior districts started being
  // cut into them (`MapArea.roomSize`), so the fix belongs here rather than in
  // the beat: a patroller is re-homed to the roomiest cell still going.
  const paced = new Set<number>();
  const roomToPace = (room: Chamber): Chamber => {
    if (Math.min(room.w, room.h) >= PATROL_ROOM) return room;
    // …and when the carve grew nothing that roomy, the ROOMIEST still beats the
    // one the spread happened to pick: a floor of small offices should put its
    // sentry in the biggest of them, not in the first.
    const roomier = elitePool
      .filter((c) => !paced.has(c.id))
      .sort((a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h))[0];
    return roomier && Math.min(roomier.w, roomier.h) > Math.min(room.w, room.h)
      ? roomier
      : room;
  };
  bp.elites.forEach((piece, i) => {
    const room = piece.patrol
      ? roomToPace(eliteRooms[i] as Chamber)
      : (eliteRooms[i] as Chamber);
    if (piece.patrol) paced.add(room.id);
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

  // THE VAULTS' OWN HAUL. A locked room has to be worth the key, and the payoff
  // is the same cache a cul-de-sac pays — behind a door instead of behind a
  // walk. It keeps its knot (see the vault selection above): what is worth
  // locking up is worth standing over.
  for (const room of vaultRooms) {
    const cell = room[0] as Chamber;
    chests.push({
      at: pointIn(cell, rng, Math.min(WALL_INSET, cell.w / 3, cell.h / 3)),
    });
  }

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
  // A BEAT trader starts in the MIDDLE of his strip, not at a rolled point in
  // it: the spot is his pitch's anchor — his map pin, his safe pocket, and
  // whatever the map hangs on `counter` (the hub's street light) — and a roll
  // along a strip 280 long put all three within fourteen pixels of the top
  // edge of the map, which is a street lamp lighting the county line and a
  // dealer starting his shift off screen. The middle is also simply where a
  // man working a stretch of pavement stands.
  const merchantAt =
    areaOf(bp.areas, shopRoom).beat === true
      ? vec(
          Math.round(shopRoom.x + shopRoom.w / 2),
          Math.round(shopRoom.y + shopRoom.h / 2),
        )
      : pointIn(
          shopRoom,
          rng,
          Math.min(WALL_INSET, shopRoom.w / 3, shopRoom.h / 3),
        );
  // The trader's pitch is the one true SAFE pocket — the horde is pushed out of
  // it, the way every hand-authored map treats its stall (PIT STOP, AIRLOCK,
  // SALOON).
  const safeZones: Zone[] = [
    {
      shape: "circle",
      // A COPY of the stall's point rather than the point itself: two fields of
      // one def sharing a mutable vector is a trap waiting for the first thing
      // that writes to either.
      pos: { x: merchantAt.x, y: merchantAt.y },
      // Capped against the map itself: on a venue the size of the garage a
      // full 190 swallows the whole lot, and every room announces itself as
      // the TRADING POST.
      radius: Math.min(190, Math.round(Math.min(width, height) / 3)),
      label: "TRADING POST",
    },
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
    // On an AUTHORED plan the opening cell wears its district's own name —
    // the garage bay announces THE GARAGE, because home is a place, not an
    // arrival. A rolled carve keeps the generic LANDING: there the caption
    // marks the breather, and every mission's opening beat says the same
    // thing on purpose.
    label: bp.plan ? (areaOf(bp.areas, spawn).label ?? "LANDING") : "LANDING",
  });

  // THE ROAD OUT: the districts a driven car leaves by, as plain rects — the
  // cell rather than a circle inside it, because the whole point of the strip is
  // that touching its tarmac at all is the departure (see `MapArea.driveOut`).
  // THE ROOMS WITH THEIR LIGHTS ON — each such chamber's own rect, so a venue's
  // night stops exactly at the wall rather than at the edge of a pool (see
  // `MapArea.lit`). The whole cell, like the road below: a room is lit up to
  // its walls, and the walls are where the cell ends.
  const litZones: NonNullable<LevelDef["litZones"]> = grid.chambers
    .filter((c) => (areaOf(bp.areas, c).lit ?? 0) > 0)
    .map((c) => ({
      rect: { x: c.x, y: c.y, width: c.w, height: c.h },
      amount: Math.min(1, Math.max(0, areaOf(bp.areas, c).lit ?? 0)),
    }));

  const driveOut: Zone[] = grid.chambers
    .filter((c) => areaOf(bp.areas, c).driveOut === true)
    .map((c) => ({
      shape: "rect",
      rect: { x: c.x, y: c.y, width: c.w, height: c.h },
    }));

  // THE TRADER'S BEAT — the districts a merchant who works a pitch paces
  // (`MapArea.beat`), as the whole cell like the road above: the strip IS the
  // ground he is allowed on, so a circle inside it would leave him wandering
  // off the tarmac he belongs to. See `LevelDef.merchantBeat` / merchant.ts.
  const merchantBeat: Zone[] = grid.chambers
    .filter((c) => areaOf(bp.areas, c).beat === true)
    .map((c) => ({
      shape: "rect",
      rect: { x: c.x, y: c.y, width: c.w, height: c.h },
    }));

  // THE STAFF LOT — the ground the night shift parks on (`MapArea.arrivals`),
  // as the whole cell like the road and the beat above: the lot IS the tarmac
  // the arrivals happen on, so a circle inside it would leave half of it out.
  const arrivalLot: Zone[] = grid.chambers
    .filter((c) => areaOf(bp.areas, c).arrivals === true)
    .map((c) => ({
      shape: "rect",
      rect: { x: c.x, y: c.y, width: c.w, height: c.h },
    }));
  const arrivalCells = new Set(
    grid.chambers
      .filter((c) => areaOf(bp.areas, c).arrivals === true)
      .map((c) => c.id),
  );

  // --- The errand cast ------------------------------------------------------
  // The blueprint's NON-COMBATANTS: the handful of neutral mobs an errand sends
  // the hero to talk to. They are cast rather than horde, so they are named one
  // by one (`bystanders`) instead of falling out of a knot's breed mix — and
  // they are dropped into a knot-bearing cell picked off the carve's own
  // stream, so the map still has to be searched for them. Everything about one
  // beyond where it stands is its own def.
  for (const spawn of bp.bystanders ?? []) {
    if (enemyDef(spawn.enemy).disposition !== "neutral") continue;
    // A cell the horde stands in, so the bystander is somewhere the player has
    // a reason to walk — never the boss's cell, the trader's or a cache's,
    // which are quiet by design and would hide him behind the ending, and never
    // a VAULT: an errand whose giver is sealed behind a keycard is a chain that
    // stops with no way to ask why.
    const rooms = grid.chambers.filter(
      (c) => knotIn(c) !== undefined && !vaultIds.has(c.id),
    );
    const room = rooms[Math.floor(rng() * rooms.length)];
    if (!room) continue;
    const at = chamberCenter(room);
    spawns.push({ ...spawn, at: vec(Math.round(at.x), Math.round(at.y)) });
  }

  // --- Props ----------------------------------------------------------------
  // WHERE AN ANCHORED OBJECT LANDS. `stall` stands a fixed step off the
  // trader's counter — deterministic on purpose (no rng draw, so adding an
  // anchored object to a map cannot shift the rolls of anything placed after
  // it). Shared by the landmarks and the lamps, which are pinned the same way.
  const anchorPos = (at: MapAnchor | undefined): Vec2 =>
    at === "goal"
      ? vec(Math.round(goalCenter.x), Math.round(goalCenter.y))
      : at === "counter"
        ? vec(Math.round(merchantAt.x), Math.round(merchantAt.y))
        : at === "stall"
          ? vec(Math.round(merchantAt.x + 70), Math.round(merchantAt.y - 40))
          : at === "home"
            ? // A fixed step off the hero's own landing, on the far side of it
              // from `stall` so the two never collide when both stand near it —
              // clamped on-map for a landing near the western/northern edge.
              //
              // MIRRORED IN X AND BARELY LIFTED IN Y, and the Y is the load-
              // bearing half: it used to be `stall`'s own −40, which stood the
              // garage's rift seam right on top of the bay's north wall run —
              // straddling the stone rather than standing in the room. A thing
              // anchored `home` belongs INSIDE the home, level with the hero
              // who landed there; the x-mirror is what keeps it out of the
              // trader's way.
              vec(
                Math.max(24, Math.round(playerSpawn.x - 70)),
                Math.max(24, Math.round(playerSpawn.y - 14)),
              )
            : vec(Math.round(playerSpawn.x), Math.round(playerSpawn.y));
  const landmarks: LevelDef["landmarks"] = bp.objects
    .filter((o) => o.type === "landmark")
    .map((o) => {
      // The anchor, plus the authored nudge off it (a lamp's own rule) —
      // clamped on-map, since an offset is written against the SHAPE of the
      // place and a landing near the boundary must not shove furniture into
      // the letterbox. This is how a fixture stands against a wall instead of
      // in the middle of the room its anchor names.
      const at = anchorPos(o.at);
      const pos = vec(
        Math.min(width, Math.max(0, at.x + (o.offset?.x ?? 0))),
        Math.min(height, Math.max(0, at.y + (o.offset?.y ?? 0))),
      );
      const mark: LevelDef["landmarks"][number] = { kind: o.kind ?? o.id, pos };
      if (o.sprite) mark.sprite = o.sprite;
      if (o.anchor) mark.anchor = o.anchor;
      return mark;
    });

  // THE LAMPS (`LevelDef.lights`) — the pools of light the venue's night is
  // read by. A `light` object is pinned like a landmark, a nudge off its
  // anchor; the door's own lamp goes up with the door itself, further down.
  // Nothing here draws a sprite and nothing collides: a lamp is a place the
  // player can see, and the fixture throwing it hangs above the ground plane
  // the game draws.
  const lights: LevelLight[] = [];
  for (const o of bp.objects) {
    if (o.type !== "light" || !o.light) continue;
    const at = anchorPos(o.at);
    // Clamped onto the map: an offset is authored against the shape of the
    // place rather than against a carve, and a lamp shoved off the edge by a
    // landing near the boundary would light the letterbox.
    const pos = vec(
      Math.min(width, Math.max(0, at.x + (o.offset?.x ?? 0))),
      Math.min(height, Math.max(0, at.y + (o.offset?.y ?? 0))),
    );
    // …carrying the thing throwing it, when the fitting is on the ground plane
    // at all (see `LevelLight.sprite` for why it rides the light rather than
    // being a landmark).
    lights.push({
      pos,
      ...(o.fixture ? { sprite: o.fixture } : {}),
      ...o.light,
    });
  }

  // --- Assemble -------------------------------------------------------------
  // Inherit every non-geometry field, then override exactly what the carve owns.
  // `path` is deliberately DROPPED: no intended route means no guidance arrow,
  // which is what turns the run into a search. `waves` and `tempo` go too — the
  // cell knots are this map's horde, and a level uses one model or the other —
  // as do the authored `doors`, `propLines` and `packs`, whose coordinates mean
  // nothing on geometry they were not drawn for.
  // The two lists the carve RE-HOMES rather than inherits are left behind
  // here: a mission says WHAT it leaves lying around and the carve says WHERE,
  // so `placedItems` and `wells` are rebuilt with positions further down.
  const inherited: Omit<MissionDef, "placedItems" | "wells"> = { ...base };
  for (const key of DROPPED_ON_CARVE) delete inherited[key];
  // Two exclusion sets, and the difference matters. Nothing STRUCTURAL goes in
  // the hero's landing cell or the lift's cell. The annex joins that list only
  // for the mission's own PICKUPS and hazards — Ada's trail belongs along the
  // walk, not stranded past a lift — while its furniture is the whole point of
  // it: the control room has to look like a control room.
  const endpoints = new Set([spawn.id, goal.id]);
  const offMap = new Set([spawn.id, goal.id, bossHome.id, ...vaultIds]);
  const walls: NonNullable<LevelDef["walls"]> = buildWalls(
    bp,
    wallSegments(grid),
  );
  const gaps = doorGaps(grid);
  // THE LOCKED DOORS: every doorway into a sealed cell, filled back in with the
  // chain the matching keycard dissolves. A vault with three ways in gets three
  // doors on ONE id — a key opens the ROOM, not one of its doorways, and a
  // second unlocked entrance would make the first one scenery.
  const doors: NonNullable<LevelDef["doors"]> = [];
  if (vaultIds.size > 0) {
    const material = areaById(
      bp.areas,
      ((vaultRooms[0] as Chamber[])[0] as Chamber).area,
    );
    const radius =
      bp.objects.find((o) => o.id === (material.wall ?? bp.layout.wall))
        ?.radius ?? 8;
    for (const gap of gaps) {
      const key = vaultKeys.get(gap.a) ?? vaultKeys.get(gap.b);
      if (!key) continue;
      // A doorway INSIDE one vault stays open: the key opens the room, and a
      // second door between two halves of it is the same lock twice.
      if (vaultKeys.get(gap.a) === vaultKeys.get(gap.b)) continue;
      const from =
        gap.axis === "v" ? vec(gap.coord, gap.from) : vec(gap.from, gap.coord);
      const to =
        gap.axis === "v" ? vec(gap.coord, gap.to) : vec(gap.to, gap.coord);
      doors.push({ id: key, from, to, radius });
    }
  }

  // APPROACH doors (`type: door`): a real door hung in a doorway, shut until
  // somebody walks or drives up to it. Two things want one and they say so
  // differently, because they are two different facts:
  //
  //   `at: spawn`      every doorway of the HERO'S OWN chamber — the garage's
  //                    roll-up, and the threshold a driven car departs through.
  //   `MapArea.doors`  every doorway a DISTRICT owns — an interior floor's own
  //                    doors, which is most of what makes a building read as
  //                    rooms rather than as a floor plan.
  //
  // A doorway is claimed once: the vault doors above are already hung, and a
  // second door across the same hole would be a lock with a door in front of
  // it. Deterministic throughout — no rng draw, so hanging one cannot shift the
  // rolls of anything placed after it.
  const hung = new Set(doors.map((d) => `${d.from.x},${d.from.y}`));
  /** Hang one door across one gap, unless something already claimed that hole.
   * Returns the chain's ends and its radius, which is what the LAMPS need. */
  const hangDoor = (
    obj: MapObject,
    gap: (typeof gaps)[number],
    opens: "approach" | "key" = "approach",
  ): { from: Vec2; to: Vec2; radius: number } | null => {
    const from =
      gap.axis === "v" ? vec(gap.coord, gap.from) : vec(gap.from, gap.coord);
    const to =
      gap.axis === "v" ? vec(gap.coord, gap.to) : vec(gap.to, gap.coord);
    const at = `${from.x},${from.y}`;
    if (hung.has(at)) return null;
    hung.add(at);
    const radius =
      obj.radius ??
      bp.objects.find((o) => o.id === bp.layout.wall)?.radius ??
      8;
    doors.push({
      id: obj.id,
      from,
      to,
      radius,
      sprite: obj.sprite ?? obj.id,
      ...(obj.openSprite ? { openSprite: obj.openSprite } : {}),
      ...(obj.rollUp ? { rollUp: true } : {}),
      opens,
    });
    return { from, to, radius };
  };
  // THE ENTRANCE, HUNG FIRST — every opening between the staff lot and the
  // building, on ONE id, as a KEYED door (see `LevelDef.arrivals`). Nothing in
  // the game holds that key: it is opened by a member of staff badging in
  // (arrivals.ts), which is what makes finding the way in a matter of watching
  // where the night shift goes rather than walking the wall until it opens.
  //
  // Ahead of the district doors below because a doorway is claimed once, and
  // the office door the building would otherwise hang across this same hole
  // opens for anybody who walks up — which is the whole of what this is not.
  const entranceObj = bp.objects.find(
    (o) => o.type === "door" && o.at === "entrance",
  );
  // Nearest the middle of the tarmac FIRST, because `planArrivals` picks the
  // door the same way and the two must agree: the scene waiting past the
  // entrance is placed off `entranceGaps[0]`, and the walk is aimed at whichever
  // opening the plan chose. Sorted rather than merely found, so a lot with three
  // ways in still has ONE that is "the entrance" as far as the beat is concerned.
  const lotMid = zonesBounds(arrivalLot);
  const entranceGaps =
    entranceObj && arrivalCells.size > 0
      ? gaps
          .filter((g) => arrivalCells.has(g.a) !== arrivalCells.has(g.b))
          .sort((a, b) => gapNearness(a, lotMid) - gapNearness(b, lotMid))
      : [];
  for (const gap of entranceGaps)
    hangDoor(entranceObj as MapObject, gap, "key");
  for (const gap of gaps) {
    const byArea = areaById(bp.areas, gap.owner).doors;
    const obj = byArea
      ? bp.objects.find((o) => o.id === byArea && o.type === "door")
      : undefined;
    if (obj) hangDoor(obj, gap);
  }
  for (const obj of bp.objects) {
    if (obj.type !== "door" || obj.at !== "spawn") continue;
    for (const gap of gaps) {
      if (gap.a !== spawn.id && gap.b !== spawn.id) continue;
      const chain = hangDoor(obj, gap);
      if (!chain) continue;
      const { from, to, radius } = chain;
      // THE LAMPS EITHER SIDE OF THE OPENING — a real fixture bolted at each
      // END of the chain, pushed to the OUTSIDE face of the chamber the door
      // shuts, each with its own pool under it. Only the carve knows where the
      // doorway landed, which is why they are hung here with the door rather
      // than authored as two more objects: the pair flanks whatever border the
      // opening was punched through, on any size and any seed.
      const lamps = obj.lamps;
      if (lamps) {
        // ON the wall, not beside it: half the chain's radius leaves the
        // fitting overlapping the stone it is bolted to and proud of its outer
        // face, which is where a barn light actually hangs. It survives being
        // drawn there because a lamp is painted with the LIGHTS, after the
        // walls — see `LevelLight.sprite`.
        const inset = lamps.inset ?? Math.round(radius / 2);
        const mid = chamberCenter(spawn);
        // Outward is simply "away from the room the door belongs to", along
        // the axis the chain does NOT run down.
        const out =
          gap.axis === "v"
            ? { x: gap.coord >= mid.x ? inset : -inset, y: 0 }
            : { x: 0, y: gap.coord >= mid.y ? inset : -inset };
        // HOW HIGH IT IS BOLTED, AND WHICH WAY THAT IS.
        //
        // A `lift` is drawn by taking it off the world y before the projection
        // (render/night.ts). On a wall that runs ACROSS the picture that is a
        // height — both fittings ride the same distance up the same face and
        // the pair stays level. On one that runs DOWN it, "higher up the wall"
        // and "further along the wall" are the SAME screen move, and spending
        // it as a height there walks the pair along the doorway instead of up
        // it: the garage's roll-up came out with one barn light 52 px above the
        // opening on plain brickwork and the other 20 px below its centre,
        // hanging in the middle of the hole with the car driving under it.
        //
        // So on that axis the lift is spent OUTWARD, symmetrically — one step
        // further along the wall from each end — and the fitting is drawn where
        // it stands, with its pool under it. The pair flanks the opening evenly
        // whichever way the border runs, and clears the last stone either way.
        const lift = lamps.lift ?? 0;
        const alongLift = gap.axis === "v" ? lift : 0;
        // …and the two ENDS, stepped a little further apart than the chain
        // itself so a fitting stands beside the opening rather than in it.
        // `gap.from` is always the lower coordinate, so the first end steps
        // back down the chain and the second steps on up it.
        [from, to].forEach((end, i) => {
          const step = (i === 0 ? -1 : 1) * (inset + alongLift);
          const pos = vec(
            Math.round(end.x + out.x + (gap.axis === "v" ? 0 : step)),
            Math.round(end.y + out.y + (gap.axis === "v" ? step : 0)),
          );
          lights.push({
            pos,
            sprite: lamps.sprite,
            ...(lift && !alongLift ? { lift } : {}),
            ...lamps.light,
          });
        });
      }
    }
  }

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
    ...(driveOut.length > 0 ? { driveOut } : {}),
    ...(merchantBeat.length > 0 ? { merchantBeat } : {}),
    // …and only when the way in was actually hung: a lot with no entrance in it
    // is a lot the arrivals would drive onto and walk in circles on.
    ...(arrivalLot.length > 0 && entranceGaps.length > 0 ? { arrivalLot } : {}),
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
        // The way DOWN may be keyed; the way back up never is (see `MapAnnex`).
        ...(bp.annex.lock ? { opensWith: bp.annex.lock } : {}),
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
  if (doors.length > 0) def.doors = doors;
  if (lights.length > 0) def.lights = lights;
  if (litZones.length > 0) def.litZones = litZones;
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
  // …and the PREFABS' own furniture, which is not a rank at all — it is one
  // prop per authored offset, riding the same deterministic placement.
  // …and the ANCHORED FURNITURE, which is neither: a piece an object authored
  // `at` an anchor instead of a density, stamped exactly there on every seed
  // (see `MapObject.at`). Same one-prop line, same reason as the prefabs'.
  //
  // Deterministic and rng-free, like the landmarks and the lamps above it, so
  // that adding a bench to a map cannot shift a single roll after it.
  const anchored: NonNullable<LevelDef["propLines"]> = [];
  for (const o of bp.objects) {
    if (o.at === undefined) continue;
    if (o.type !== "obstacle" && o.type !== "decor") continue;
    const base = anchorPos(o.at);
    const pos = vec(
      Math.min(width, Math.max(0, base.x + (o.offset?.x ?? 0))),
      Math.min(height, Math.max(0, base.y + (o.offset?.y ?? 0))),
    );
    const line: NonNullable<LevelDef["propLines"]>[number] = {
      sprite: o.sprite ?? o.kind ?? o.id,
      from: pos,
      // A COPY, never the same vector twice — two fields of one def sharing a
      // mutable point is a trap waiting for the first thing that writes to it.
      to: vec(pos.x, pos.y),
      spacing: 1,
    };
    // Decor is walked over; anything else is furniture and stands in the way.
    if (o.type !== "decor") {
      line.collide = true;
      if (o.half) line.half = vec(o.half.x, o.half.y);
      else line.radius = o.radius ?? 8;
      if (o.jumpable) line.jumpable = true;
    }
    anchored.push(line);
  }
  const rows = [
    ...buildRows(bp, grid, endpoints, rng),
    ...buildPrefabProps(bp, grid),
    ...anchored,
  ];
  if (rows.length > 0) def.propLines = rows;
  const placedItems = buildPlacedItems(base, grid, depth, offMap, rng);
  if (placedItems) def.placedItems = placedItems;
  const wells = buildWells(base, grid, offMap, rng);
  if (wells) def.wells = wells;
  // The scripted first-blow beat re-anchors beside the hero: it exists to put a
  // harmless swing on him in the opening seconds, which only works within sight.
  if (base.openingStrike) {
    // …UNLESS THE LANDING IS A CAR PARK HE HAS TO GET OFF FIRST. On a map with
    // an ENTRANCE (`MapArea.arrivals`) the beat is not the first thing that
    // happens: the hero lands outside a building nobody has noticed him at,
    // and the first thing he does is find the way in and follow somebody
    // through it. A rusher standing on the tarmac would break that in both
    // directions — the man sneaking in opens by being assaulted in the open,
    // and he takes those blows holstered in front of the two people whose whole
    // job is watching the lot. So the scene moves to the FIRST ROOM INSIDE,
    // a step past the doorway, and plays when he walks into it. (Which is also
    // where its own words belong: the read it waits on is "every desk's manned,
    // every lab lit", and there are no desks in a car park.)
    const lobby = insideEntrance(grid, entranceGaps[0], (id) =>
      arrivalCells.has(id),
    );
    const at =
      lobby?.at ??
      (() => {
        // THE RUSHER HAS TO ARRIVE, which means he must not START arrived. A
        // quarter of the cell was fine while every cell was a district; it stops
        // being fine the moment the landing can be a smaller room, because a
        // quarter of a small room is a step. So the offset has a FLOOR — and it
        // is taken toward whichever side of the landing has the floor to give,
        // clamped off that side's wall, so the beat plays the same whichever
        // corner the hero landed in.
        const east = spawn.x + spawn.w - playerSpawn.x;
        const west = playerSpawn.x - spawn.x;
        const side = east >= west ? 1 : -1;
        const room = Math.max(east, west) - WALL_INSET / 2;
        const reach = Math.max(
          OPENING_REACH,
          Math.min(spawn.w / 4, OPENING_REACH_MAX),
        );
        return vec(
          Math.round(
            playerSpawn.x + side * Math.max(40, Math.min(reach, room)),
          ),
          Math.round(playerSpawn.y),
        );
      })();
    def.openingStrike = { ...base.openingStrike, at };
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
    // On an entrance map it goes with the rusher, for the same reason: the
    // crowd is the room he walks into, not the tarmac he walks off.
    const pin = base.openingStrike.after
      ? base.firstSightThoughts?.find(
          (t) => t.thought === base.openingStrike?.after,
        )
      : undefined;
    if (pin) {
      const reach = Math.min((pin.radius ?? DIALOGUE.sightRadius) * 0.5, 120);
      const room = lobby?.room;
      for (let i = 0; i < OPENING_CROWD; i++) {
        const angle = ((i + rng()) / OPENING_CROWD) * Math.PI * 2;
        const x = at.x + Math.cos(angle) * reach;
        const y = at.y + Math.sin(angle) * reach;
        def.spawns.push({
          enemy: pin.enemy,
          // Held inside the room the beat plays in, when there is one: a ring
          // drawn round a point a step past a doorway puts a third of it back
          // out on the tarmac and the rest of it in the wall.
          at: room
            ? vec(
                Math.round(
                  clamp(x, room.x + WALL_INSET, room.x + room.w - WALL_INSET),
                ),
                Math.round(
                  clamp(y, room.y + WALL_INSET, room.y + room.h - WALL_INSET),
                ),
              )
            : vec(Math.round(x), Math.round(y)),
        });
      }
    }
  }
  return def;
}
