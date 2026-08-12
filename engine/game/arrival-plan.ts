// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE THE STAFF LOT'S BEAT HAPPENS — the geometry half of the night shift
// turning up for work (`engine/game/arrivals.ts` is the other half, and its
// header is the feature). Worked out ONCE, as the run is built, and then only
// read: `ArrivalPlan` is a fact for the rest of the run rather than something
// re-rolled under a car already driving down it.
//
// It is a file of its own because it is a different KIND of work from the beat
// it feeds. Everything here is a question about a floor plan that did not exist
// until this run was carved — which wall the entrance landed in, which way round
// the lot is, which strip of tarmac is clear enough to drive a car down, and
// where on it the player can actually SEE the whole thing happen. Everything
// there is a clock: cars, walks, badges, doors.

import { clamp, distance, vec, type Vec2 } from "@game/lib/vec.ts";

import { ARRIVALS } from "./config/index.ts";
import { runLevelDef } from "./defs/levels/index.ts";
import { blockedByObstacle, insideObstacle } from "./obstacles.ts";
import { anyZoneContains, zonesBounds } from "./zones.ts";
import type { ArrivalPlan, DoorState, GameState } from "./types/index.ts";

/** The default id of the door the badge opens — what the carve hangs across
 * every opening between the arrival district and the building. */
export const ENTRANCE_DOOR = "entrance";

/** How far off the map's own edge an arriving car is minted, so it is a car
 * driving IN rather than one that blinked into being at the kerb. */
const OFF_MAP = 70;

/**
 * WORK OUT WHERE THE ARRIVALS HAPPEN, once, from the carve.
 *
 * Everything this needs is a fact about a floor plan that did not exist until
 * this run was carved: which wall the entrance landed in, which way round the
 * lot is, and which strip of it is clear enough to drive a car down. Returns
 * null — and the whole feature simply does not run — when the carve gave the
 * level no arrival district or no entrance, which is the honest answer for a
 * seed whose lot ended up with no wall to put a door in.
 */
export function planArrivals(
  state: GameState,
  seed: number,
): ArrivalPlan | null {
  const def = runLevelDef(state);
  const spec = def.arrivals;
  const zones = def.arrivalLot;
  if (!spec || !zones) return null;
  const lot = zonesBounds(zones);
  if (!lot) return null;
  const onLot = (x: number, y: number): boolean =>
    anyZoneContains(zones, { x, y });
  const doorId = spec.door ?? ENTRANCE_DOOR;
  const lotMid = vec((lot.minX + lot.maxX) / 2, (lot.minY + lot.maxY) / 2);
  // The lot's own doorway, when the carve punched more than one: the nearest to
  // the middle of the tarmac is the one somebody parking there would use, and
  // every one of them opens on the same badge anyway (they share an id). The
  // carve picks the FIRST ROOM INSIDE off the same rule (`insideEntrance`), so
  // the walk and the scene waiting past it never end up at different doors.
  let door: DoorState | null = null;
  let best = Infinity;
  for (const candidate of state.doors) {
    if (candidate.id !== doorId) continue;
    const d = distance(candidate.center, lotMid);
    if (d < best) {
      best = d;
      door = candidate;
    }
  }
  if (!door || !door.from || !door.to) return null;

  // ACROSS THE OPENING, not toward the middle of the room. The door's chain
  // runs `from`→`to` along the wall, so the way THROUGH it is that line's
  // normal — and which of the two normals is the lot's is settled by ASKING THE
  // TARMAC: a step down one of them lands on the lot and a step down the other
  // does not. Taken as a bearing on the lot's centre instead, a doorway near the
  // corner of an L-shaped car park points diagonally across its own threshold.
  const ax = door.to.x - door.from.x;
  const ay = door.to.y - door.from.y;
  const len = Math.hypot(ax, ay) || 1;
  let nx = -ay / len;
  let ny = ax / len;
  const probe = ARRIVALS.apronGap;
  const facesLot = onLot(
    door.center.x + nx * probe,
    door.center.y + ny * probe,
  );
  const facesAway = onLot(
    door.center.x - nx * probe,
    door.center.y - ny * probe,
  );
  const flip =
    facesLot === facesAway
      ? (lotMid.x - door.center.x) * nx + (lotMid.y - door.center.y) * ny < 0
      : facesAway;
  if (flip) {
    nx = -nx;
    ny = -ny;
  }
  const apron = vec(
    door.center.x + nx * ARRIVALS.apronGap,
    door.center.y + ny * ARRIVALS.apronGap,
  );
  const inside = vec(
    door.center.x - nx * ARRIVALS.insideStep,
    door.center.y - ny * ARRIVALS.insideStep,
  );

  // WHICH WAY THE CARS COME IN, and it is TWO different answers stacked.
  //
  // A MAP EDGE is the honest kerb: the car rolls in off the public road and the
  // run-in starts off the world entirely. But the carve's regions are corners of
  // the MAP, not corners of the world — a lot can sit against the southern edge
  // with a district either side of it — so a lot that reaches no x edge starts
  // its cars at its own far BOUNDARY instead, just inside the tarmac. It has to
  // be inside: the far side of that boundary is the building, and a run-in laid
  // through a wall is a car driving through a wall.
  //
  // Either way the start is hundreds of px from the apron, which on a phone is
  // well off the screen and under the fog, so what the player sees is the same
  // both times — a car arriving out of the dark.
  const margin = ARRIVALS.laneClearance;
  //
  // The inset is the same `OFF_MAP` the edge case reaches OUT by, and it is not
  // a coincidence: a lot that reaches no edge has somebody's wall along that
  // boundary, and a run-in laid hard against it is swept straight into the
  // stone. A car's length inside leaves the whole approach on open tarmac.
  const kerb = (fromLeft: boolean): number =>
    fromLeft
      ? lot.minX <= 1
        ? -OFF_MAP
        : lot.minX + OFF_MAP
      : lot.maxX >= state.level.width - 1
        ? state.level.width + OFF_MAP
        : lot.maxX - OFF_MAP;

  // THE FOOTPATH is the apron's own line; the LANE is held off it, because a
  // rank of parked cars stands on the lane and people walking the same y would
  // walk through every bumper ahead of them.
  const walkY = clamp(apron.y, lot.minY + margin, lot.maxY - margin);
  const laneSign =
    Math.abs(ny) > 0.5
      ? Math.sign(ny) || 1 // a wall to the north or south: away from it
      : lotMid.y >= walkY
        ? 1
        : -1; // a wall east or west: whichever side has the tarmac

  // A REAL KERB FIRST, then the longer run-in — and then the other one anyway,
  // because the preferred side may be exactly where the ordered bank of bays and
  // its parked cars sits (the `parking_bays` prefab), and a lot with one usable
  // approach is still a lot with an approach.
  const leftIsEdge = lot.minX <= 1;
  const rightIsEdge = lot.maxX >= state.level.width - 1;
  const first =
    leftIsEdge !== rightIsEdge
      ? leftIsEdge
      : apron.x - lot.minX >= lot.maxX - apron.x;
  const stagings = stageIt(def.playerSpawn, {
    onLot,
    apron,
    laneY: walkY + laneSign * ARRIVALS.laneOffset,
    first,
    kerb,
  });
  for (const staging of stagings) {
    const entryX = kerb(staging.fromLeft);
    const lane = layLane(
      state,
      { onLot, minY: lot.minY, maxY: lot.maxY, walkY, band: staging.band },
      staging.laneY,
      {
        firstBay: staging.firstBay,
        entryX,
        entrySign: staging.fromLeft ? -1 : 1,
        cars: Math.max(1, spec.maxCars ?? 3),
        walkable: staging.walkable,
      },
    );
    if (!lane) continue;
    return {
      door: vec(door.center.x, door.center.y),
      apron,
      inside,
      walkY: Math.round(walkY),
      laneY: lane.y,
      entryX: Math.round(entryX),
      bays: lane.bays,
      rng: (seed ^ 0x5bf03635) >>> 0,
    };
  }
  return null;
}

/**
 * One way of laying the lot out: where the cars drive, where the bay nearest
 * the doors is, and which side they roll in from — plus the BAND the lane may
 * be searched in, which is the hero's screen for a pulled staging and the whole
 * tarmac for a door-staged one. Without it the search that walks off a blocked
 * line (`layLane`, up to `ARRIVALS.laneSearch`) can put the lane back off the
 * screen the pull just brought it onto.
 */
type Staging = {
  laneY: number;
  firstBay: number;
  fromLeft: boolean;
  band: { min: number; max: number };
  /** Whether a bay owes a corridor somebody can leave it by (`canWalkOff`).
   * True everywhere except the LAST RESORT — see the bottom of `stageIt`. */
  walkable: boolean;
};

/**
 * WHERE TO STAGE THE BEAT — and the rule is AS NEAR THE DOORS AS THE HERO'S
 * SCREEN ALLOWS.
 *
 * A car park's rank belongs beside the entrance, and for as long as the lot was
 * laid out on that alone it was right about the car park and wrong about the
 * GAME. The entrance is wherever the carve punched a hole in the building and
 * the landing is wherever the lot's own middle fell, and on the shipped map
 * those two are 150–690 px apart on ten seeds in twelve: the hero touched down,
 * thought "that's the night shift clocking on" about a car he could not see,
 * and went looking for the beat that exists to stop him looking. The one thing
 * this lot is FOR is a sequence WATCHED from where the player lands.
 *
 * So the landing gets a veto over the two numbers that decide whether the
 * sequence is on his screen — the lane's ROW and the first BAY on it — and it
 * is spent as a CLAMP rather than as a move. Dragged all the way to him both
 * numbers answer the complaint and cost something worse: the walk to the reader
 * is what is left over, and a rank parked at his wing on a lot 700 px wide is a
 * staffer strolling the whole car park before the door opens (measured: the
 * wait for the first badge went from 13.5 s to 19.6 s, and to 32 s on the worst
 * seed). Pulled only as far as his screen edge, the beat is watched AND the
 * walk stays the shortest one that can be watched.
 *
 * THE RUN-IN MUST STILL START IN THE DARK (`ARRIVALS.arriveGap`), which is
 * where most of the refusals here come from. A lot that reaches no map edge
 * starts its cars just inside its own boundary (see `kerb`) — hundreds of px
 * away on the doorway's row, and on the HERO'S row sometimes a stride from his
 * wing. A car that pops into being in front of him is worse than one he never
 * saw, because it reads as a bug rather than as an arrival.
 *
 * TWO THINGS IT IS ALLOWED TO DO that the doorway's own rank never did, both
 * because a car park does them. The bay may sit on the far side of the
 * entrance from the kerb, so a car can cross the forecourt to reach it; and the
 * rank behind it then runs back toward the doors. Neither is worth refusing a
 * watchable beat over — a lot whose far boundary is a stride past where the
 * hero parked has no other way to be watched at all.
 *
 * The door-staged pair stays at the back of the list, both kerbs, exactly as it
 * was: this adds preferences and removes no option.
 */
function stageIt(
  landing: Vec2 | undefined,
  lot: {
    onLot: (x: number, y: number) => boolean;
    apron: Vec2;
    laneY: number;
    first: boolean;
    kerb: (fromLeft: boolean) => number;
  },
): Staging[] {
  /** The bay a rank measured off the DOORWAY puts the first car in. */
  const doorBay = (fromLeft: boolean): number =>
    lot.apron.x + (fromLeft ? -1 : 1) * ARRIVALS.bayGap;
  const anywhere = { min: -Infinity, max: Infinity };
  const atTheDoors = (walkable: boolean): Staging[] =>
    [lot.first, !lot.first].map((fromLeft) => ({
      laneY: lot.laneY,
      firstBay: doorBay(fromLeft),
      fromLeft,
      band: anywhere,
      walkable,
    }));
  // THE LAST TWO ARE THE LOT AS IT WAS BEFORE ANY OF THIS, corridor test and
  // all dropped. A plan is not a nicety: with none, no car is ever sent, the
  // keyed entrance never opens and the level has no way in at all — so the
  // final fallback has to be able to answer whatever the carve did, and every
  // rule added here has to be one the search is allowed to give up on. (Adding
  // the corridor test to the fallbacks alone tripled the seeds with no plan
  // at all, from 1 in 60 to 3.)
  const doors: Staging[] = [...atTheDoors(true), ...atTheDoors(false)];
  if (!landing || !lot.onLot(landing.x, landing.y)) return doors;
  /** How far the staged beat sits from where he is standing. */
  const reach = (x: number, y: number): number =>
    Math.hypot(x - landing.x, y - landing.y);
  // ALREADY WATCHABLE? Then the doors keep their rank untouched: a bay beside
  // the entrance is where somebody arriving for a shift would actually park,
  // and moving a beat the player can already see buys nothing.
  if (reach(doorBay(lot.first), lot.laneY) <= ARRIVALS.watchReach) return doors;
  // THE PULL, and it is RADIAL because the fog is. The staged point travels
  // along the line from the doorway's own bay to where he is standing, and
  // stops as soon as it is inside what he can see — so it stays the nearest
  // point to the entrance he can watch it from, which is the whole trade (see
  // `ARRIVALS.watchReach`). Clamped per axis instead, a beat at the limit of
  // both sits at the CORNER, half again as far away as either number says, and
  // the walker who gets out there is drawn as fog.
  //
  // `deep` is how much of the radius it spends, and there is a second, deeper
  // try for each kerb because the lane still has to find a CLEAR line. What is
  // left of the radius once the bay has spent its share is all the room
  // `layLane` has to walk off a blocked one, and a pull that lands almost
  // straight along x leaves nearly none — a beat that is one lamp post from
  // being staged should step nearer the hero, not give up and go back to the
  // doorway he cannot see.
  const pulled = (fromLeft: boolean, deep: number): Staging => {
    const bay = doorBay(fromLeft);
    const away = reach(bay, lot.laneY) || 1;
    const t = (ARRIVALS.watchReach * deep) / away;
    const firstBay = Math.round(landing.x + (bay - landing.x) * t);
    const laneY = Math.round(landing.y + (lot.laneY - landing.y) * t);
    const spare = Math.sqrt(
      Math.max(0, ARRIVALS.watchReach ** 2 - (firstBay - landing.x) ** 2),
    );
    return {
      laneY,
      firstBay,
      fromLeft,
      band: { min: landing.y - spare, max: landing.y + spare },
      walkable: true,
    };
  };
  // HIS OWN SIDE FIRST — the cars then come in from behind him and the walk to
  // the reader goes past him, which is the read the level is teaching. The
  // other kerb is the answer when that one has no dark approach left.
  const behind = landing.x < lot.apron.x;
  const tries: Staging[] = [];
  for (const deep of [1, 0.85, 0.7, 0.55]) {
    for (const fromLeft of [behind, !behind]) {
      if (
        Math.abs(lot.kerb(fromLeft) - landing.x) >= ARRIVALS.arriveGap &&
        lot.onLot(landing.x, landing.y)
      ) {
        tries.push(pulled(fromLeft, deep));
      }
    }
  }
  return [...tries, ...doors];
}

/**
 * LAY THE ACCESS LANE AND THE RANK ON IT.
 *
 * The two are one decision, because each disqualifies the other: a lane with no
 * bay left on the tarmac is not a lane, and a bay on a line the cars cannot
 * drive down is not a bay. So candidate lines are tried outward from the ideal
 * one, nearest first, and the first that yields a driveable run-in AND at least
 * one bay wins — deterministic, and as close to the footpath as the furniture
 * allows.
 *
 * "Driveable" is a CLEARANCE test rather than collision: an arriving car does
 * not push anything out of the way (a visitor threading the lamp posts is not a
 * simulation anybody asked for), so the lane is put where nothing stands.
 *
 * AND A BAY HAS TO BE ONE SOMEBODY CAN GET OUT OF. The driving clearance is
 * measured for a CAR on the lane's own line, which says nothing about the strip
 * between that line and the footpath — and the tarmac already has parked cars
 * on it (the `parking_bays` prefab). A bay laid a rank's width off one of them
 * puts the staffer's first stride into a 48 px slot with a bumper either side:
 * he is pushed straight back out of it every tick, stands there until his leg
 * times out, and the level's only door is eight seconds later for it. (Measured
 * on seed 2 of the shipped map, where it cost a clean 18 s walk.) So each bay
 * owes a clear corridor from the lane to the footpath, at a WALKER's width.
 */
function layLane(
  state: GameState,
  lot: {
    onLot: (x: number, y: number) => boolean;
    minY: number;
    maxY: number;
    walkY: number;
    band: { min: number; max: number };
  },
  ideal: number,
  rank: {
    firstBay: number;
    entryX: number;
    entrySign: number;
    cars: number;
    walkable: boolean;
  },
): { y: number; bays: number[] } | null {
  const margin = ARRIVALS.laneClearance;
  const from = vec(clamp(rank.entryX, 0, state.level.width), 0);
  const to = vec(0, 0);
  const out = vec(0, 0);
  for (let step = 0; step * ARRIVALS.laneStep <= ARRIVALS.laneSearch; step++) {
    for (const dir of step === 0 ? [0] : [1, -1]) {
      const y = Math.round(ideal + dir * step * ARRIVALS.laneStep);
      if (y < lot.minY + margin || y > lot.maxY - margin) continue;
      if (y < lot.band.min || y > lot.band.max) continue;
      // The rank, the bay `stageIt` chose first and the rest behind it toward
      // the kerb; only the bays that are actually on the tarmac (an L-shaped car
      // park has corners its bounding box covers and its asphalt does not), and
      // only the ones somebody can step out of and walk away from.
      out.y = y;
      const bays: number[] = [];
      for (let i = 0; i < rank.cars; i++) {
        const x = Math.round(
          rank.firstBay + rank.entrySign * i * ARRIVALS.baySpacing,
        );
        if (!lot.onLot(x, y)) break;
        out.x = x;
        if (rank.walkable && !canWalkOff(state, out, lot.walkY)) break;
        bays.push(x);
      }
      if (bays.length === 0) continue;
      from.y = y;
      to.x = bays[0] as number;
      to.y = y;
      if (blockedByObstacle(state, from, to, margin)) continue;
      return { y, bays };
    }
  }
  return null;
}

/**
 * CAN SOMEBODY GET OUT OF A CAR ON THIS BAY AND WALK TO THE FOOTPATH?
 *
 * `insideObstacle` rather than `blockedByObstacle`, and that is the whole point
 * of the function. The swept query answers what a SHOT or a wall stops, and it
 * looks straight over anything JUMPABLE — which every parked car's footprint
 * is, because a hero can hop a bonnet. A staffer cannot: he is a body on the
 * ground, and the separation pass shoves him out of exactly the props the
 * swept query says are not there. So the corridor is sampled with the
 * placement query, the one that counts a parked car as something standing
 * where it stands.
 *
 * Sampled rather than swept because that query takes a point. A stride apart is
 * finer than anything it has to catch — the slot that trapped him was 48 px —
 * and this runs once, while the run is being built.
 *
 * ONLY THE FIRST STRETCH OF IT, THOUGH (`ARRIVALS.walkProbe`), and that bound
 * is what makes this a filter rather than a veto. Being WEDGED is a thing that
 * happens beside the car — two ranks, a slot between them, and no way out of it
 * — while everything further along the walk is a prop he is shoved past and
 * keeps going. Asked over the whole route the test rejects nearly every bay on
 * a dressed car park (measured: eight seeds in sixty went back to a doorway the
 * hero could not see, because a 300 px corridor across a lot clips something
 * every time), which trades the rare stall for the common one.
 */
function canWalkOff(state: GameState, bay: Vec2, walkY: number): boolean {
  const span =
    Math.sign(walkY - bay.y) *
    Math.min(Math.abs(walkY - bay.y), ARRIVALS.walkProbe);
  const steps = Math.max(1, Math.ceil(Math.abs(span) / ARRIVALS.walkStep));
  const at = vec(bay.x, bay.y);
  for (let i = 0; i <= steps; i++) {
    at.y = bay.y + (span * i) / steps;
    if (insideObstacle(state, at, ARRIVALS.walkClearance)) return false;
  }
  return true;
}
