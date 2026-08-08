// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE NIGHT SHIFT TURNING UP FOR WORK (config `ARRIVALS`, `LevelDef.arrivals`,
// state `Arrival` / `ArrivalPlan`) — the staff lot's whole life, and the way
// into GOODCO.
//
// THE PROBLEM IT SOLVES IS A DOOR NOBODY CAN FIND. The hero lands on a car park
// beside his own wagon; the building is a wall in front of him and the fog is
// over all of it, so which stretch of that wall has a way in is a question the
// map will not answer. Filling the tarmac with staff to fight was the old
// answer and it was the building's beat played outside the building: it made
// the lot a corridor, and it made the man who came here to slip in unnoticed
// start by killing eleven people in front of the entrance.
//
// So the lot is QUIET (`MapArea.horde: 0` — nothing ambient is seeded out
// there) and it has two kinds of people on it, both NEUTRAL:
//
//   THE GUARDS    the lot's own standing population, minted once and strolling
//                 their patch. They are not looking for anybody.
//   THE ARRIVALS  a car every so often, and somebody getting out of it who has
//                 somewhere to be. THAT is the pointer: they walk to the doors,
//                 badge in, and the doors open — and the entrance is a KEYED
//                 door that nothing in the game unlocks, so following one
//                 through is not merely the fastest way in, it is the way in.
//
// THE CAR IS THE MINIGAME'S OWN CAR. `createCar` mints it and `integrateCarBody`
// rolls its wheels and settles its springs, so the wagon pulling into the bay is
// the same assembly the road draws — which is the whole reason a car arriving
// reads as a car rather than as a sprite sliding. It is deliberately kept OUT of
// `state.vehicles`: everything in that list is a machine a hero may climb into
// (`enterCar` walks it), and a visitor's car is furniture with an owner.
//
// NOTHING HERE DRAWS ON `state.rng`. The lot's little decisions — who is in the
// next car, how long until it comes — ride a private stream parked on the plan
// (`ArrivalPlan.rng`, the `Enemy.workRng` pattern), so a beat that is pure
// presentation can never shift a loot roll or a spawn on a seeded run.
//
// THE BEAT MAY NEVER STOP HAPPENING, because the door is the only way on with
// the mission. Two nets hold that: an arrival that starts walking ALWAYS badges
// (a walker whose leg times out is moved on to the next waypoint, and a route
// that runs out badges from wherever the body stands), and a run whose door is
// still shut with nobody walking toward it pulls the next car forward to
// `ARRIVALS.retryMs`.

import { createRngFromState, rngState } from "@game/lib/rng.ts";
import { clamp, distance, moveToward, vec, type Vec2 } from "@game/lib/vec.ts";

import { ARRIVALS } from "./config/index.ts";
import {
  CAR,
  createCar,
  integrateCarBody,
  vehicleFootprint,
} from "./vehicles.ts";
import { spawnEnemy } from "./create.ts";
import { runLevelDef } from "./defs/levels/index.ts";
import type { ArrivalsSpec } from "./defs/levels/types.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { blockedByObstacle, insideObstacle } from "./obstacles.ts";
import { openDoor, startPlayerThought } from "./story.ts";
import { anyZoneContains, zonesBounds } from "./zones.ts";
import type {
  Arrival,
  ArrivalPlan,
  DoorState,
  Enemy,
  GameState,
} from "./types/index.ts";

/** The default id of the door the badge opens — what the carve hangs across
 * every opening between the arrival district and the building. */
export const ENTRANCE_DOOR = "entrance";

/** How far off the map's own edge an arriving car is minted, so it is a car
 * driving IN rather than one that blinked into being at the kerb. */
const OFF_MAP = 70;

/** One draw off the lot's private stream (see the header). */
function draw(plan: ArrivalPlan): number {
  const rng = createRngFromState(plan.rng);
  const value = rng();
  plan.rng = rngState(rng);
  return value;
}

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
  for (const fromLeft of [first, !first]) {
    const entryX = kerb(fromLeft);
    const lane = layLane(
      state,
      { onLot, minY: lot.minY, maxY: lot.maxY },
      walkY + laneSign * ARRIVALS.laneOffset,
      {
        apronX: apron.x,
        entryX,
        entrySign: fromLeft ? -1 : 1,
        cars: Math.max(1, spec.maxCars ?? 3),
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
 */
function layLane(
  state: GameState,
  lot: { onLot: (x: number, y: number) => boolean; minY: number; maxY: number },
  ideal: number,
  rank: { apronX: number; entryX: number; entrySign: number; cars: number },
): { y: number; bays: number[] } | null {
  const margin = ARRIVALS.laneClearance;
  const from = vec(clamp(rank.entryX, 0, state.level.width), 0);
  const to = vec(0, 0);
  for (let step = 0; step * ARRIVALS.laneStep <= ARRIVALS.laneSearch; step++) {
    for (const dir of step === 0 ? [0] : [1, -1]) {
      const y = Math.round(ideal + dir * step * ARRIVALS.laneStep);
      if (y < lot.minY + margin || y > lot.maxY - margin) continue;
      // The rank, nearest the doors first, and only the bays that are actually
      // on the tarmac — an L-shaped car park has corners its bounding box
      // covers and its asphalt does not.
      const bays: number[] = [];
      for (let i = 0; i < rank.cars; i++) {
        const x = Math.round(
          rank.apronX +
            rank.entrySign * (ARRIVALS.bayGap + i * ARRIVALS.baySpacing),
        );
        if (!lot.onLot(x, y)) break;
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
 * OPEN THE LOT FOR BUSINESS — called once as the run is built (`createGame`).
 *
 * Works out the geometry, arms the clock for the first car, and mints the
 * guards who are already on the tarmac. Everything it does is deterministic and
 * every draw comes off the plan's own stream, so a level that gains a car park
 * full of people does not move a single loot roll.
 */
export function openArrivals(state: GameState, seed: number): void {
  const plan = planArrivals(state, seed);
  state.arrivalPlan = plan;
  if (!plan) return;
  const spec = runLevelDef(state).arrivals as ArrivalsSpec;
  state.arrivalTimerMs = spec.firstMs ?? 4000;
  placeGuards(state, plan, spec);
  clearTheLobby(state, plan);
}

/**
 * THE SCENE BEHIND THE DOOR HAS TO BE ABLE TO COME THROUGH IT.
 *
 * The carve stands the opening strike's rusher a good step inside the entrance
 * (`insideEntrance`, mapgen) because that is where the beat belongs — and it
 * chooses that spot before a single piece of furniture exists, so on a floor
 * whose first room is an ASSEMBLY BAY the rusher can end up on the far side of
 * a gantry rank. A rank is a WALL to anything that beelines, and the vanguard
 * beelines: it pinned itself against the ironwork and pushed, the hero stood on
 * the tarmac waiting to be armed, and the run never started. (Measured: seed 1,
 * the first campaign level, holstered for the whole clock.)
 *
 * So the rusher is walked BACK toward the doorway until it has a clear swept
 * line to the apron — the deepest post it can actually leave. It keeps its
 * scene (it is still inside, still the first thing past the doors) and it keeps
 * its job. Deterministic, and a no-op on the seeds where it was already fine.
 *
 * Only the RUSHER, deliberately. The crowd around it is ordinary horde: some of
 * them being penned behind a rank is a floor with furniture on it, and none of
 * them is load-bearing for a beat.
 */
function clearTheLobby(state: GameState, plan: ArrivalPlan): void {
  const rusher = state.enemies.find((e) => e.vanguard);
  if (!rusher) return;
  const radius = enemyDef(rusher.defId).radius;
  if (!blockedByObstacle(state, rusher.pos, plan.apron, radius)) return;
  const dx = plan.inside.x - plan.door.x;
  const dy = plan.inside.y - plan.door.y;
  const len = Math.hypot(dx, dy) || 1;
  const reach = distance(plan.door, rusher.pos);
  // Deepest first — the post it loses the least by taking.
  for (let d = reach; d >= ARRIVALS.insideStep; d -= 20) {
    const at = vec(plan.door.x + (dx / len) * d, plan.door.y + (dy / len) * d);
    if (insideObstacle(state, at, radius)) continue;
    if (blockedByObstacle(state, at, plan.apron, radius)) continue;
    rusher.pos = at;
    rusher.home = { ...at };
    return;
  }
  rusher.pos = { ...plan.inside };
  rusher.home = { ...plan.inside };
}

/**
 * THE PEOPLE ALREADY OUT THERE. Spread down the lane's own axis and held a
 * good step off it — a guard standing in the access lane is a guard the next
 * car parks on top of — and never inside anything. Deterministic placement,
 * jittered off the plan's private stream so the rank is not a ruler.
 */
function placeGuards(
  state: GameState,
  plan: ArrivalPlan,
  spec: ArrivalsSpec,
): void {
  const guards = spec.guards;
  if (!guards || guards.count <= 0) return;
  const def = enemyDef(guards.enemy);
  const side = plan.walkY >= plan.laneY ? 1 : -1;
  const away = Math.sign(plan.entryX - plan.apron.x) || 1;
  for (let i = 0; i < guards.count; i++) {
    // Down the lane, away from the doors, so they are between the hero's
    // landing and the entrance rather than clustered on the threshold; and off
    // the lane itself, because a guard standing in it is a guard the next car
    // parks on top of. A spot with something already on it walks a little
    // further along rather than being dropped: two guards is the whole of the
    // lot's population, and losing one to a lamp post halves it.
    const across =
      plan.laneY -
      side * (ARRIVALS.guardMargin + Math.round(draw(plan) * 40) - 20);
    let pos: Vec2 | null = null;
    for (let nudge = 0; nudge < 6 && !pos; nudge++) {
      const at = vec(
        clamp(
          plan.apron.x +
            away *
              (ARRIVALS.guardMargin +
                i * ARRIVALS.guardSpacing +
                nudge * ARRIVALS.guardSpacing * 0.25),
          def.radius + 8,
          state.level.width - def.radius - 8,
        ),
        clamp(across, def.radius + 8, state.level.height - def.radius - 8),
      );
      if (!insideObstacle(state, at, def.radius)) pos = at;
    }
    if (!pos) continue;
    const guard = spawnEnemy(
      guards.enemy,
      pos,
      createRngFromState((plan.rng ^ (i + 1)) >>> 0),
      state.nextId++,
      1,
      0,
      1,
      false,
    );
    state.enemies.push(guard);
  }
}

/**
 * ONE TICK OF THE LOT. Runs every playing tick on a level that has arrivals and
 * does nothing at all on every level that has not.
 */
export function stepArrivals(state: GameState, dtMs: number): void {
  const plan = state.arrivalPlan;
  if (!plan) return;
  const spec = runLevelDef(state).arrivals;
  if (!spec) return;
  const dt = dtMs / 1000;
  for (const arrival of state.arrivals)
    stepArrival(state, arrival, plan, spec, dt, dtMs);
  // THE NEXT CAR. Held while the rank is full — a car park that keeps filling
  // forever is a queue — and pulled forward when the beat has stalled with the
  // door still shut, because the entrance is the only way on with the mission.
  const cars = Math.max(1, spec.maxCars ?? 3);
  state.arrivalTimerMs -= dtMs;
  if (state.arrivals.length >= Math.min(cars, plan.bays.length)) return;
  if (entranceShut(state, spec) && !someoneIsWalking(state)) {
    state.arrivalTimerMs = Math.min(state.arrivalTimerMs, ARRIVALS.retryMs);
  }
  if (state.arrivalTimerMs > 0) return;
  sendCar(state, plan);
  const [lo, hi] = spec.everyMs;
  state.arrivalTimerMs = lo + draw(plan) * (hi - lo);
}

/** Is the way in still shut? (Any leaf of it — they share an id, so the first
 * badge opens the lot's whole wall.) */
function entranceShut(state: GameState, spec: ArrivalsSpec): boolean {
  const id = spec.door ?? ENTRANCE_DOOR;
  return state.doors.some((d) => d.id === id && !d.open);
}

/** Is anybody on their way to the reader right now? */
function someoneIsWalking(state: GameState): boolean {
  return state.arrivals.some(
    (a) => a.phase === "walking" || a.phase === "badging",
  );
}

/** Mint the next car at the kerb, aimed at the rank's next free bay. */
function sendCar(state: GameState, plan: ArrivalPlan): void {
  const taken = new Set(state.arrivals.map((a) => a.bay.x));
  const bayX = plan.bays.find((x) => !taken.has(x));
  if (bayX === undefined) return;
  const fromLeft = plan.entryX < bayX;
  const car = createCar(vec(plan.entryX, plan.laneY), fromLeft ? 0 : Math.PI);
  state.arrivals.push({
    id: state.nextId++,
    car,
    phase: "driving",
    bay: vec(bayX, plan.laneY),
    staff: null,
    route: [],
    beatMs: 0,
    parked: false,
  });
}

/** One arrival, one tick. */
function stepArrival(
  state: GameState,
  arrival: Arrival,
  plan: ArrivalPlan,
  spec: ArrivalsSpec,
  dt: number,
  dtMs: number,
): void {
  switch (arrival.phase) {
    case "driving":
      driveIn(state, arrival, dt, dtMs);
      break;
    case "parking":
      arrival.beatMs -= dtMs;
      if (arrival.beatMs <= 0) stepOut(state, arrival, plan, spec);
      break;
    case "walking":
      walkOn(state, arrival, plan, dt, dtMs);
      break;
    case "badging":
      arrival.beatMs -= dtMs;
      if (arrival.beatMs <= 0) badgeIn(state, arrival, plan, spec);
      break;
    case "entering":
      // …and once the body is off the field there is nothing left to walk:
      // what remains of the arrival is a parked car, which is furniture.
      if (arrival.staff !== null) walkOn(state, arrival, plan, dt, dtMs);
      break;
  }
  // The body's own clockwork runs whatever the phase: a parked car settles on
  // its springs, and one still rolling spins its wheels off its own speed.
  integrateCarBody(arrival.car, dt);
}

/**
 * THE ROLL-IN. The speed is capped by what the car can still stop from
 * (`sqrt(2·brake·remaining)`), so it always arrives on the bay however short
 * the lane — and a crawl underneath that keeps the last inch from taking
 * forever.
 */
function driveIn(
  state: GameState,
  arrival: Arrival,
  dt: number,
  dtMs: number,
): void {
  const car = arrival.car;
  const dir = Math.cos(car.heading) >= 0 ? 1 : -1;
  const remaining = (arrival.bay.x - car.pos.x) * dir;
  if (remaining <= 1) {
    car.pos.x = arrival.bay.x;
    car.speed = 0;
    park(state, arrival);
    return;
  }
  const cap = Math.min(
    ARRIVALS.driveSpeed,
    Math.sqrt(2 * ARRIVALS.driveBrake * remaining),
  );
  car.speed = Math.max(
    ARRIVALS.creepSpeed,
    Math.min(cap, car.speed + ARRIVALS.driveAccel * dt),
  );
  car.pos.x += dir * car.speed * dt;
  // The engine, on the same overlapping-grain cadence a driven car uses.
  car.engineCueMs -= dtMs;
  if (car.engineCueMs <= 0) {
    car.engineCueMs += CAR.engineCueMs;
    state.events.push({
      type: "carEngine",
      pos: { x: car.pos.x, y: car.pos.y },
      intensity: Math.min(1, car.speed / ARRIVALS.driveSpeed),
    });
  }
}

/**
 * PARKED. The engine dies, the body settles on its springs, and the car becomes
 * FURNITURE — its footprint blockers go onto the field exactly like the ones
 * under the hero's own wagon, so a car in the rank is something to walk round.
 * `obstaclesVersion` bumps with them, or the autopilot routes through a wall it
 * has not heard about.
 */
function park(state: GameState, arrival: Arrival): void {
  arrival.phase = "parking";
  arrival.beatMs = ARRIVALS.parkMs;
  arrival.car.home = { x: arrival.car.pos.x, y: arrival.car.pos.y };
  if (!arrival.parked) {
    arrival.parked = true;
    state.obstacles = state.obstacles.concat(
      vehicleFootprint(arrival.car).map((print) => ({
        id: state.nextId++,
        kind: "vehicle" as const,
        sprite: "",
        pos: print.pos,
        radius: print.radius,
        jumpable: true,
      })),
    );
    state.obstaclesVersion++;
  }
  state.events.push({
    type: "arrivalParked",
    pos: { x: arrival.car.pos.x, y: arrival.car.pos.y },
  });
}

/**
 * THE DOOR OPENS AND SOMEBODY GETS OUT — a real neutral body, so it walks with
 * the game's own gait, casts the game's own shadow and is as un-fightable as
 * every other bystander. Its feet belong to this module from here
 * (`Enemy.arrival`), so the idle stroll leaves it alone.
 *
 * THE ROUTE IS THREE STRAIGHT LEGS and every one of them stays on the tarmac:
 * out of the car onto the footpath, along the footpath to the apron, and — once
 * the badge has opened the way — through the doorway. The first read the player
 * ever gets on the beat fires here rather than at the kerb, because a car
 * arriving is scenery until a person gets out of it.
 */
function stepOut(
  state: GameState,
  arrival: Arrival,
  plan: ArrivalPlan,
  spec: ArrivalsSpec,
): void {
  const pick = spec.staff[Math.floor(draw(plan) * spec.staff.length)];
  const defId = pick ?? (spec.staff[0] as string);
  const def = enemyDef(defId);
  const out = vec(
    arrival.car.pos.x,
    plan.walkY >= plan.laneY
      ? arrival.car.pos.y + def.radius + 6
      : arrival.car.pos.y - def.radius - 6,
  );
  const body = spawnEnemy(
    defId,
    out,
    createRngFromState((plan.rng ^ arrival.id) >>> 0),
    state.nextId++,
    1,
    0,
    1,
    false,
  );
  body.arrival = true;
  state.enemies.push(body);
  arrival.staff = body.id;
  arrival.phase = "walking";
  arrival.route = [
    vec(arrival.car.pos.x, plan.walkY),
    vec(plan.apron.x, plan.walkY),
    { ...plan.apron },
  ];
  arrival.beatMs = legBudget(out, arrival.route[0] as Vec2);
  if (spec.thought && !state.thoughtsSeen.includes(spec.thought)) {
    state.thoughtsSeen.push(spec.thought);
    startPlayerThought(state, spec.thought);
  }
}

/** How long a leg may take before it is written off as wedged (ms). */
function legBudget(from: Vec2, to: Vec2): number {
  return (
    ARRIVALS.legMsFloor + (distance(from, to) / 100) * ARRIVALS.legMsPer100
  );
}

/**
 * ONE STEP OF THE WALK — and the place both safety nets live.
 *
 * A leg that runs out of budget is ABANDONED rather than retried: the body
 * moves on to the next waypoint, so somebody jammed on a lamp post still ends
 * up at the doors. A route that runs out badges from wherever the body is
 * standing, which is what makes "an arrival that starts walking always opens
 * the door" a fact rather than a hope. And a body that is GONE — killed,
 * somehow, by a party that went out of its way to do it — abandons the arrival,
 * which the stall check answers by pulling the next car forward.
 */
function walkOn(
  state: GameState,
  arrival: Arrival,
  plan: ArrivalPlan,
  dt: number,
  dtMs: number,
): void {
  const body = staffBody(state, arrival);
  if (!body) {
    arrival.phase = "entering";
    arrival.staff = null;
    arrival.route = [];
    return;
  }
  const target = arrival.route[0];
  if (!target) {
    finishLeg(state, arrival, plan);
    return;
  }
  body.pos = moveToward(body.pos, target, ARRIVALS.walkSpeed * dt);
  arrival.beatMs -= dtMs;
  if (distance(body.pos, target) > 2 && arrival.beatMs > 0) return;
  arrival.route.shift();
  const next = arrival.route[0];
  arrival.beatMs = next ? legBudget(body.pos, next) : 0;
  if (!next) finishLeg(state, arrival, plan);
}

/** The end of a walk: at the apron the card comes out; past the doorway the
 * body has gone to work and is taken off the field. */
function finishLeg(
  state: GameState,
  arrival: Arrival,
  plan: ArrivalPlan,
): void {
  if (arrival.phase === "walking") {
    arrival.phase = "badging";
    arrival.beatMs = ARRIVALS.badgeMs;
    return;
  }
  const body = staffBody(state, arrival);
  if (body) state.enemies = state.enemies.filter((e) => e !== body);
  arrival.staff = null;
  arrival.phase = "entering";
  arrival.route = [];
  void plan;
}

/**
 * THE BADGE. The beep first, then the doors — one beat apart on purpose, or the
 * entrance reads as having opened by itself. Every leaf of the entrance opens,
 * because they all carry the same id and a card opens the WAY IN rather than
 * one of its openings (the vault rule, said about a front door).
 */
function badgeIn(
  state: GameState,
  arrival: Arrival,
  plan: ArrivalPlan,
  spec: ArrivalsSpec,
): void {
  const id = spec.door ?? ENTRANCE_DOOR;
  state.events.push({ type: "badgeSwiped", pos: { ...plan.apron } });
  for (const door of state.doors) {
    if (door.id === id) openDoor(state, door);
  }
  arrival.phase = "entering";
  arrival.route = [{ ...plan.door }, { ...plan.inside }];
  const body = staffBody(state, arrival);
  arrival.beatMs = body ? legBudget(body.pos, plan.door) : 0;
}

/** The body this arrival is walking, if it is still on the field. */
function staffBody(state: GameState, arrival: Arrival): Enemy | undefined {
  if (arrival.staff === null) return undefined;
  return state.enemies.find((e) => e.id === arrival.staff && e.hp > 0);
}
