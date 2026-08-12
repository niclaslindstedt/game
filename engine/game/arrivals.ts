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
//
// AND IT MAY NEVER HAPPEN WHERE NOBODY IS LOOKING, which is the other half of
// the same rule and the one that had to be learned. A beat whose whole job is
// to POINT AT THE DOOR is worth nothing off the side of the screen: the hero
// landed, said "that's the night shift clocking on" about a car park with
// nothing on it, and then went looking for the thing that exists to stop him
// looking. Two answers, and the lot needs both — `stageIt` lays the lane and
// the rank as near the doorway as the player can still SEE them from where he
// touched down (`arrival-plan.ts`), and `readTheLot` holds the line until there
// is somebody on that screen to say it about.
//
// WHERE all of that happens is `arrival-plan.ts`; this file is WHEN.

import { createRngFromState, rngState } from "@game/lib/rng.ts";
import { clamp, distance, moveToward, vec, type Vec2 } from "@game/lib/vec.ts";

import { ARRIVALS } from "./config/index.ts";
import {
  CAR,
  createCar,
  integrateCarBody,
  vehicleFootprint,
} from "./vehicles.ts";
import { ENTRANCE_DOOR, planArrivals } from "./arrival-plan.ts";
import { spawnEnemy } from "./create.ts";
import { runLevelDef } from "./defs/levels/index.ts";
import type { ArrivalsSpec } from "./defs/levels/types.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { blockedByObstacle, insideObstacle } from "./obstacles.ts";
import { anyZoneContains, type Zone } from "./zones.ts";
import { heroInPlay } from "./party.ts";
import { visibleTo } from "./sight.ts";
import { openDoor, startPlayerThought } from "./story.ts";
import type { Arrival, ArrivalPlan, Enemy, GameState } from "./types/index.ts";

// WHERE the beat happens is its own module (`arrival-plan.ts`) — a floor plan's
// worth of geometry, read once as the run is built. Re-exported because the
// door id is the lot's public fact: the autopilot's own rung asks whether the
// entrance is still shut (`bot/entrance.ts`).
export { ENTRANCE_DOOR };

/** One draw off the lot's private stream (see the header). */
function draw(plan: ArrivalPlan): number {
  const rng = createRngFromState(plan.rng);
  const value = rng();
  plan.rng = rngState(rng);
  return value;
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
  placeGatehouse(state, plan, spec);
  placeGuards(state, plan, spec);
  clearTheLobby(state, plan);
}

/** How wide the kiosk is taken to be when the level names no radius (px). */
const BOOTH_RADIUS = 11;

/**
 * STAND THE GATEHOUSE BESIDE THE DOORWAY (`ArrivalsSpec.gatehouse`).
 *
 * TWO OFFSETS, AND EACH IS ANSWERING A DIFFERENT WAY OF GETTING THIS WRONG.
 *
 * OUT ONTO THE TARMAC, by the apron's own standoff: the doorway is a hole in a
 * WALL, and the wall runs on down the building's face either side of it — so a
 * kiosk placed flush beside the opening is a kiosk placed INSIDE somebody's
 * masonry, which is exactly where it lands and exactly why nothing appeared. A
 * step out is the difference between a box beside the gate and a box in a wall.
 *
 * AND ALONG THE WALL, AWAY FROM THE CARS. The footpath runs down the apron's own
 * line from the rank to the reader, so a kiosk on the bay side of the doorway is
 * a kiosk every arriving staffer walks through — and an arrival does not collide
 * with anything (see the header), so it would not even be stopped by it. The
 * side away from the lane's entry is the empty half of the same line.
 *
 * The near side is tried first and the far side after it, because the carve
 * decides which end of that wall is a corner; a seed with room on neither simply
 * has no kiosk.
 *
 * AND IT MOVES THE READER TO THE WINDOW. The kiosk is where the card is
 * actually presented (`ArrivalPlan.reader`), so where the box lands decides
 * where the walk ends — which is why this is the one piece of the lot's
 * furniture the beat cannot simply skip and still read. A seed that finds room
 * for no kiosk leaves the reader on the threshold, which is the plain badge
 * beat every other venue would get.
 */
function placeGatehouse(
  state: GameState,
  plan: ArrivalPlan,
  spec: ArrivalsSpec,
): void {
  const booth = spec.gatehouse;
  if (!booth) return;
  const radius = booth.radius ?? BOOTH_RADIUS;
  // The way THROUGH the doorway (the apron's bearing off it), and the face of
  // the wall it is cut into — which is that bearing's perpendicular.
  const nx = plan.apron.x - plan.door.x;
  const ny = plan.apron.y - plan.door.y;
  const len = Math.hypot(nx, ny) || 1;
  const wx = -ny / len;
  const wy = nx / len;
  // Which way down that face the cars are: the same reading `placeGuards` takes,
  // projected onto the wall rather than onto x, so a doorway in an east or west
  // wall answers it as well as one in a north or south wall.
  const toCars =
    (plan.entryX - plan.apron.x) * wx + (plan.laneY - plan.apron.y) * wy;
  const away = toCars > 0 ? -1 : 1;
  // PAST THE OPENING, not part-way across it. A carved doorway is as wide as the
  // district that owns it — the lot's runs to the full hangar width — so an
  // offset measured off the door's CENTRE puts the kiosk standing in front of
  // the gate it is supposed to be beside. Measured off the leaf instead, it
  // clears the hole whatever the carve made of it.
  const leaf = state.doors.find(
    (d) =>
      d.from !== undefined &&
      d.to !== undefined &&
      distance(d.center, plan.door) < 1,
  );
  const half =
    leaf && leaf.from && leaf.to ? distance(leaf.from, leaf.to) / 2 : 0;
  const along = half + ARRIVALS.apronGap + radius;
  for (const side of [away, -away]) {
    const at = vec(
      plan.door.x + wx * side * along + (nx / len) * ARRIVALS.apronGap,
      plan.door.y + wy * side * along + (ny / len) * ARRIVALS.apronGap,
    );
    if (insideObstacle(state, at, radius)) continue;
    state.obstacles.push({
      id: state.nextId++,
      kind: booth.sprite,
      sprite: booth.sprite,
      pos: at,
      radius,
      jumpable: false,
    });
    state.obstaclesVersion++;
    // THE WINDOW: the kiosk's near face, a body's width off the glass and on
    // the apron's own line out from the wall. Not the box's centre, which is
    // inside it — the separation pass would shove the staffer straight back out
    // and he would badge from wherever he was pushed to.
    plan.reader = vec(
      plan.door.x +
        wx * side * (along - radius - READER_GAP) +
        (nx / len) * ARRIVALS.apronGap,
      plan.door.y +
        wy * side * (along - radius - READER_GAP) +
        (ny / len) * ARRIVALS.apronGap,
    );
    return;
  }
}

/**
 * How far the staffer stands off the kiosk's near face to present the card (px).
 *
 * A body's width, and it is a CLEARANCE rather than a look: an arrival is a real
 * neutral and the separation pass pushes it out of furniture like anything else
 * (`resolveObstacles`, step/enemies.ts — only the idle stroll leaves an arrival
 * alone). Stood any closer than his own radius off the glass he is shoved back
 * out of it every tick and badges from wherever he was pushed to, which is the
 * kiosk making the beat worse than no kiosk at all.
 */
const READER_GAP = 18;

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
  // gate still shut, because the gate is the only way on with the mission.
  const cars = Math.max(1, spec.maxCars ?? 3);
  state.arrivalTimerMs -= dtMs;
  const stalled = entranceShut(state, spec) && !someoneIsWalking(state);
  if (state.arrivals.length >= Math.min(cars, plan.bays.length)) {
    // …AND THE RANK BEING FULL IS NOT THE END OF THE BEAT.
    //
    // A gate that shuts again (`ARRIVALS.gateHoldMs`) means a player can watch
    // every car on the rank arrive, badge in and go inside, and still be
    // standing on the tarmac — three chances at a second and a half each, taken
    // or missed. With the bays full there is nowhere to send a fourth car, so
    // without this the way into the level would simply cease to exist, which is
    // the one thing this module may not do.
    //
    // So the LAST RESORT is another body out of a car that is already parked:
    // the arrival nearest the doors is put back to its parking beat and lets
    // somebody else out. A car with two people in it at half past midnight is
    // not a thing anybody will look at twice, and it makes "the gate opens
    // again eventually" a fact rather than a hope.
    if (stalled) restartArrival(state, plan, dtMs);
    return;
  }
  if (stalled) {
    state.arrivalTimerMs = Math.min(state.arrivalTimerMs, ARRIVALS.retryMs);
  }
  if (state.arrivalTimerMs > 0) return;
  sendCar(state, plan);
  const [lo, hi] = spec.everyMs;
  state.arrivalTimerMs = lo + draw(plan) * (hi - lo);
}

/**
 * SOMEBODY ELSE GETS OUT of a car already on the rank — the net that keeps the
 * beat alive on a full lot (see the caller). Runs the same retry clock the
 * pull-forward uses, so a stalled lot waits exactly as long either way.
 */
function restartArrival(
  state: GameState,
  plan: ArrivalPlan,
  dtMs: number,
): void {
  state.arrivalTimerMs = Math.min(state.arrivalTimerMs, ARRIVALS.retryMs);
  if (state.arrivalTimerMs > 0) return;
  // Nearest the doors: it is the shortest walk and the one the player is
  // already looking at.
  let best: Arrival | null = null;
  let bestGap = Infinity;
  for (const arrival of state.arrivals) {
    if (arrival.phase !== "entering" || arrival.staff !== null) continue;
    const gap = distance(arrival.car.pos, plan.apron);
    if (gap < bestGap) {
      bestGap = gap;
      best = arrival;
    }
  }
  if (!best) return;
  best.phase = "parking";
  best.beatMs = ARRIVALS.parkMs;
  state.arrivalTimerMs = ARRIVALS.retryMs;
  void dtMs;
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
    watched: false,
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
      walkOn(state, arrival, plan, spec, dt, dtMs);
      break;
    case "badging":
      arrival.beatMs -= dtMs;
      if (arrival.beatMs <= 0) badgeIn(state, arrival, plan, spec);
      break;
    case "entering":
      // …and once the body is off the field there is nothing left to walk:
      // what remains of the arrival is a parked car, which is furniture.
      if (arrival.staff !== null) walkOn(state, arrival, plan, spec, dt, dtMs);
      break;
  }
  // The body's own clockwork runs whatever the phase: a parked car settles on
  // its springs, and one still rolling spins its wheels off its own speed.
  integrateCarBody(arrival.car, dt);
  // …and the moment somebody is out of it and can be SEEN, the hero has a read
  // on what he is looking at — and the lot remembers he watched it, which is
  // what the MISS is read off once this walker is through the gate.
  readTheLot(state, arrival, spec);
  watchTheWalk(state, arrival);
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
 * out of the car onto the footpath, along the footpath to the GATEHOUSE WINDOW,
 * and — once the badge has opened the way — a dogleg back to the gate and
 * through it. The window rather than the gate is the whole of what makes the
 * kiosk part of the beat instead of scenery beside it (`ArrivalPlan.reader`).
 * The first read the player ever gets on the beat fires here rather than at the
 * kerb, because a car arriving is scenery until a person gets out of it.
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
    vec(plan.reader.x, plan.walkY),
    { ...plan.reader },
  ];
  arrival.beatMs = legBudget(out, arrival.route[0] as Vec2);
}

/**
 * THE READ ON THE BEAT — and it waits until there is something to read.
 *
 * The line is about a person: "that's the night shift clocking on". Fired the
 * instant a door opened somewhere on the lot it was a hero narrating a car he
 * had no picture of — the geometry above is what puts the beat on his screen,
 * and this is what refuses to say it out loud until it is. Asked of the WALKER
 * rather than of the car, because the walker is the half of it the line is
 * about and the half that goes on being worth pointing at all the way to the
 * reader.
 *
 * `visibleTo` rather than plain distance, so it means the same thing the rest of
 * the game means by seeing something: on the player's screen AND out of the
 * fog. A headless run has no screen and abstains on that half, which is what
 * keeps the simulator and the engine suites reading the line at all.
 *
 * It stays a ONE-TIME read (`thoughtsSeen`), so a lot that keeps producing cars
 * does not keep producing the thought — but it is marked read only once it has
 * actually PLAYED. A thought raised while another scene is on stage is dropped
 * on the floor (`startPlayerThought`), and a line the hero owes the player is
 * not spent by a beat that never reached them: unspent, it lands on the next
 * staffer he watches get out of a car.
 */
function readTheLot(
  state: GameState,
  arrival: Arrival,
  spec: ArrivalsSpec,
): void {
  const thought = spec.thought;
  if (!thought || state.thoughtsSeen.includes(thought)) return;
  const body = staffBody(state, arrival);
  if (!body) return;
  const watched = state.players.some(
    (hero) => heroInPlay(hero) && visibleTo(state, hero, body.pos),
  );
  if (!watched) return;
  readOnce(state, thought);
}

/**
 * AND THE READ ON MISSING IT — fired when he WATCHES somebody go through the
 * gate while he is still standing on the tarmac (`ArrivalsSpec.missedThought`).
 *
 * The gate holds for a second and a half and then shuts, which is the whole
 * design: the way in is a MOMENT rather than a door. What that design could not
 * say for itself is what a miss MEANS. A player who watched the gate open, shut
 * and go back to being a wall had nothing telling them the difference between
 * "wait for the next car" and "that was not the way in after all" — and the lot
 * is deliberately quiet, so there is nothing else out there to read either. The
 * line is the level's second and last instruction, and it costs nothing on a
 * player who took the moment: they are through the gate, not on the lot, and it
 * never fires.
 *
 * ASKED OF THE SAME HERO for both halves. "Somebody saw it" and "somebody is
 * still outside" answered by two different players in a party is a line about
 * nobody: the hero who watched it is the one who is owed the advice.
 *
 * AND ASKED ABOUT THE GATE, NOT ABOUT THE BODY — which is the half that had to
 * be learned. A staffer is taken off the field one step PAST the doorway
 * (`ARRIVALS.insideStep`), which is inside the building, and the fog stops at
 * the walls: the last position the walker ever holds is one no hero standing on
 * the tarmac can see, so asked about the body the line could not fire at all.
 * The thing the player watched is the GATE, and the gate is on their side of the
 * wall.
 *
 * Ordered behind `thought`, so "that's the night shift clocking on" lands before
 * "and there they go" — the first read explains who these people are, and the
 * second is only sensible once it has.
 */
function readTheMiss(
  state: GameState,
  arrival: Arrival,
  spec: ArrivalsSpec,
): void {
  const thought = spec.missedThought;
  if (!thought || !arrival.watched) return;
  if (state.thoughtsSeen.includes(thought)) return;
  if (spec.thought && !state.thoughtsSeen.includes(spec.thought)) return;
  const lot = runLevelDef(state).arrivalLot;
  if (!lot) return;
  if (
    !state.players.some((hero) => heroInPlay(hero) && onTheLot(lot, hero.pos))
  )
    return;
  readOnce(state, thought);
}

/** Is this point out on the tarmac? — the "still outside" half of the miss. */
function onTheLot(lot: Zone[], at: Vec2): boolean {
  return anyZoneContains(lot, at);
}

/**
 * REMEMBER THAT SOMEBODY WATCHED THIS ONE (`Arrival.watched`) — asked every
 * tick a walker is on its feet, because the moment it is TRUE is the only
 * moment it can be asked (see the field's own note).
 */
function watchTheWalk(state: GameState, arrival: Arrival): void {
  if (arrival.watched) return;
  const body = staffBody(state, arrival);
  if (!body) return;
  const lot = runLevelDef(state).arrivalLot;
  if (!lot) return;
  if (
    state.players.some(
      (hero) =>
        heroInPlay(hero) &&
        onTheLot(lot, hero.pos) &&
        visibleTo(state, hero, body.pos),
    )
  ) {
    arrival.watched = true;
  }
}

/**
 * RAISE A READ AND SPEND IT ONLY IF IT LANDED.
 *
 * A thought raised while another scene is on stage is dropped on the floor
 * (`startPlayerThought`), and a line the hero owes the player is not spent by a
 * beat that never reached them — unspent, it lands on the next staffer worth
 * saying it about.
 *
 * A MUTED run is the exception and is spent immediately (`muteDialogue` — a
 * replay, a soak, a suite about some other beat). Held, it would queue behind a
 * mute that may never be lifted and then jump the stage the moment it is.
 */
function readOnce(state: GameState, thought: string): void {
  startPlayerThought(state, thought);
  const playing = state.dialogue?.source;
  const shown = playing?.kind === "playerThought" && playing.defId === thought;
  if (shown || state.dialogueMuted) state.thoughtsSeen.push(thought);
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
  spec: ArrivalsSpec,
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
    finishLeg(state, arrival, plan, spec);
    return;
  }
  body.pos = moveToward(body.pos, target, ARRIVALS.walkSpeed * dt);
  arrival.beatMs -= dtMs;
  if (distance(body.pos, target) > 2 && arrival.beatMs > 0) return;
  arrival.route.shift();
  const next = arrival.route[0];
  arrival.beatMs = next ? legBudget(body.pos, next) : 0;
  if (!next) finishLeg(state, arrival, plan, spec);
}

/** The end of a walk: at the WINDOW the card comes out; past the doorway the
 * body has gone to work and is taken off the field — which is the one moment
 * "somebody just went in without me" is a true thing to say (`readTheMiss`),
 * so the read is taken while the body is still there to have been watched. */
function finishLeg(
  state: GameState,
  arrival: Arrival,
  plan: ArrivalPlan,
  spec: ArrivalsSpec,
): void {
  if (arrival.phase === "walking") {
    arrival.phase = "badging";
    arrival.beatMs = ARRIVALS.badgeMs;
    return;
  }
  const body = staffBody(state, arrival);
  if (body) {
    readTheMiss(state, arrival, spec);
    state.enemies = state.enemies.filter((e) => e !== body);
  }
  arrival.staff = null;
  arrival.phase = "entering";
  arrival.route = [];
}

/**
 * THE BADGE, AT THE WINDOW. The beep first, then the gate — one beat apart on
 * purpose, or the entrance reads as having opened by itself, and the beep is
 * anchored where the card actually is (`plan.reader`) rather than at the gate,
 * so what the player hears comes from the man at the glass. Every leaf of the
 * entrance opens, because they all carry the same id and a card opens the WAY IN
 * rather than one of its openings (the vault rule, said about a front door).
 *
 * The walk from here is a DOGLEG — back off the kiosk to the gate, then through
 * it — which is the shape of somebody who has just been let in.
 */
function badgeIn(
  state: GameState,
  arrival: Arrival,
  plan: ArrivalPlan,
  spec: ArrivalsSpec,
): void {
  const id = spec.door ?? ENTRANCE_DOOR;
  state.events.push({ type: "badgeSwiped", pos: { ...plan.reader } });
  for (const door of state.doors) {
    // …AND IT SHUTS AGAIN. A badge buys a moment, not a door (see
    // `ARRIVALS.gateHoldMs`): the gate takes the staffer who opened it, and
    // anybody behind them has that long to be through it. Opening it for good
    // is what turned this from a beat into a wall that eventually moves.
    if (door.id === id) openDoor(state, door, ARRIVALS.gateHoldMs);
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
