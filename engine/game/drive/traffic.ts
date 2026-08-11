// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE OTHER TRAFFIC — everything else out here that is also just trying to get
// somewhere.
//
// WHAT TRAFFIC IS FOR, mechanically: it is the thing that takes a LANE away.
// A road with nothing but pedestrians on it is dodged by picking the emptiest
// lane and holding it, and the wheel stops mattering about fifteen seconds in.
// Traffic makes the empty lane temporary — the gap you were going to use has a
// van in it — so the player is forced back across the crowd, which is where the
// minigame actually lives.
//
// TWO STREAMS, BOTH REAL. The hero's own side dawdles and gets overtaken; the
// far side comes at him, and closes at the sum of both speeds, which is why an
// oncoming lane is a genuinely different proposition from a slow one. Right-hand
// traffic in both legs, so the way home is the same road with the sides swapped
// rather than a mirror nobody can read.
//
// …AND A THIRD THAT IS NOT ON THE ROAD AT ALL. The delivery trade rides the
// PAVEMENT (`DriveVehicleDef.pavement`), which is the one change here that
// alters the shape of the minigame rather than its furniture: the gutter used to
// be the safe line, and now it has mopeds on it, weaving, cutting in, and
// threading the same crowd the hero is trying to.
//
// WHAT A HIT DOES DEPENDS ON WHAT IT HIT, and that is the other half of this
// file. A CAR is shunted: slewed out of its lane, scrubbed, and left to settle —
// but it now REMEMBERS (`DriveTraffic.wear`), so the tenth shunt is visibly the
// tenth rather than the first, and past its own threshold it is finished and
// standing dead in a live lane. A TWO-WHEELER is not shunted at all: a car
// meeting a bicycle puts the bicycle on its side, so it goes DOWN — slides,
// turns over, sheds itself — and the person on it leaves by a different door
// entirely (`eject.ts`).

import { randomRange } from "@game/lib/rng.ts";
import { clamp } from "@game/lib/vec.ts";

import { difficultyDef } from "../defs/difficulties.ts";
import {
  cityEndPx,
  cityStartPx,
  courseLength,
  DRIVE,
  DRIVE_UNITS,
} from "./config.ts";
import type { Impact } from "./impact.ts";
import {
  crowdEdges,
  laneAt,
  laneCenter,
  roadBandEdges,
  roadEdges,
} from "./crowd.ts";
import { rollOccupants, rollVehicle, variantOf, vehicleDef } from "./fleet.ts";
import { heading, indexTraffic, siblingLane, steerTraffic } from "./ai.ts";
import type { DriveState, DriveTraffic } from "./types.ts";

export { TRAFFIC_VARIANTS } from "./fleet.ts";

/**
 * How thick the traffic is on this drive's rung — the baseline gap through the
 * difficulty's own multiplier (`DifficultyDef.drive`), which DIVIDES it. The
 * gentle rungs leave the road nearly the hero's own; the hard ones put a
 * vehicle in every lane on every screen.
 *
 * AND THE TWO SIDES ARE NOT PRICED THE SAME. An ONCOMING lane gets
 * `oncomingGapMult` times the road between its vehicles, because it is in shot
 * for a fraction of the time and takes the lane away with no notice — see the
 * field's own note in `config.ts`.
 */
function laneGapPx(state: DriveState, oncoming: boolean): number {
  const { gapPx, oncomingGapMult } = DRIVE.laneTraffic;
  return (
    (gapPx * (oncoming ? oncomingGapMult : 1)) /
    difficultyDef(state.params.difficulty).drive.trafficDensity
  );
}

/** …and the same rung applied to the footway's own rate (riders per 1000 px). */
function pavementPerKPx(state: DriveState): number {
  return (
    DRIVE.pavementPerKPx *
    difficultyDef(state.params.difficulty).drive.trafficDensity
  );
}

/**
 * TURN A GAP ON THE SCREEN INTO A PITCH ON THE COURSE — the one piece of
 * arithmetic that makes "one in every lane on every screen" a thing the
 * spawner can actually lay down.
 *
 * The road is minted at fixed marks along the COURSE, and a mark is reached
 * when the hero's own reach crosses it — so vehicles are born at a fixed
 * distance ahead of him, one every `pitch / v` seconds. Once born they drift in
 * his frame at `v - u`, where `u` is their own speed along his direction of
 * travel. So the spacing he actually SEES is `pitch × (v - u) / v`, and the
 * pitch that leaves him a gap of `g` is `g × v / |v - u|`.
 *
 * Which is the whole reason a single rate could never populate this road: `u`
 * is +225-ish in the lanes running his way and −225-ish in the ones coming at
 * him, so the same picture wants pitches nearly eight times apart. Slow traffic
 * on his own side lingers in the mirror for the best part of half a minute and
 * needs laying down sparsely; an oncoming lane is gone in a second and a half
 * and needs laying down thick.
 *
 * `along` is the vehicle's speed measured along the HERO's direction of travel:
 * positive for a lane running his way, negative for one coming at him.
 */
function lanePitch(state: DriveState, along: number): number {
  const { refSpeedPx: ref, maxPitchMult } = DRIVE.laneTraffic;
  const closing = Math.max(Math.abs(ref - along), ref / maxPitchMult);
  // The SIGN of `along` is already the answer to which side of the road this
  // is: a lane running the hero's way is positive, one coming at him negative.
  return laneGapPx(state, along < 0) * (ref / closing);
}

/** Whether a lane runs the hero's way. Right-hand traffic: outbound he has the
 * near lanes (the bottom of the screen), homeward he has the far ones — so the
 * two legs are the same road with the sides swapped, which is what a real
 * return trip looks like. */
export function laneRunsWithHero(lane: number, direction: 1 | -1): boolean {
  const nearHalf = lane >= DRIVE.laneCount / 2;
  return direction === 1 ? nearHalf : !nearHalf;
}

/**
 * WHAT THIS VEHICLE WEIGHS RIGHT NOW (kg, before the rung's own multiplier).
 *
 * The def's mass is the MACHINE. A two-wheeler with somebody still on it is the
 * machine plus the person, which is most of a moped's mass and nearly all of a
 * bicycle's — so the same bike is a materially different collision before and
 * after it loses its rider, and nothing had to be written down for that to be
 * true.
 */
export function trafficMass(other: DriveTraffic, riderMassKg: number): number {
  const def = vehicleDef(other.variant);
  return def.massKg + (other.rider ? riderMassKg : 0);
}

/** Where on the footway a pavement rider sits, and which side of the road it
 * is: the delivery trade travels with the flow like everything else, so it
 * shares the near/far split the lanes use. */
function pavementY(nearSide: boolean): number {
  const road = roadEdges();
  const walk = crowdEdges();
  return nearSide ? (road.bottom + walk.bottom) / 2 : (road.top + walk.top) / 2;
}

/**
 * MINT ONE VEHICLE — the single place a `DriveTraffic` is built.
 *
 * It is exported because it is the only honest way to add a car to a road from
 * outside the spawner (the effects gallery stages one; the tests stage a dozen),
 * and a shape this long is one somebody will otherwise assemble by hand and get
 * a field short. A vehicle that spawns with `rider: false` because its literal
 * forgot the field is a moped that quietly weighs a person less than it should.
 */
export function createTraffic(
  id: number,
  variant: number,
  pos: { x: number; y: number },
  speed: number,
  phase = 0,
): DriveTraffic {
  const def = vehicleDef(variant);
  return {
    id,
    pos: { x: pos.x, y: pos.y },
    speed,
    cruise: speed,
    slew: 0,
    // WHERE IT THINKS IT IS, read off where it actually is. Derived rather than
    // passed, so every caller that ever minted a vehicle — the spawner, the
    // exhibits, a dozen suites — gets a driver whose intent matches its position
    // without any of them being revisited. A pavement rider gets an answer it
    // never reads.
    lane: laneAt(pos.y),
    laneHoldMs: DRIVE.drivers.settledMs,
    // Somebody going home from work. The chase winds this up and nothing else
    // ever touches it.
    urgency: 1,
    siren: false,
    variant,
    // Every vehicle is drawn nose-first down its own direction of travel.
    faceLeft: speed < 0,
    noseOut: false,
    tailOut: false,
    hitCooldownMs: 0,
    crashCooldownMs: 0,
    wear: 0,
    rung: 0,
    crushNose: 0,
    crushTail: 0,
    glassOut: false,
    gore: 0,
    rolls: 0,
    wrecked: false,
    rider: def.rider !== null,
    // HOW MANY PEOPLE ARE IN THIS ONE — its own answer to its model's range,
    // derived off its id so it costs the seeded stream nothing (`rollOccupants`).
    // It is the whole of how much gore this car is worth when it is met.
    occupants: rollOccupants(def, id),
    driverless: false,
    downed: false,
    z: 0,
    vz: 0,
    angle: 0,
    spin: 0,
    phase,
    smashNose: false,
    smashTail: false,
    wheelsOff: 0,
    fire: 0,
    fireMs: 0,
    blown: false,
    pushMs: 0,
    crab: 0,
    brakeMs: 0,
    lured: false,
  };
}

/**
 * Lay down traffic ahead as the road unrolls. Like the crowd, minted once at a
 * running mark so a seed always yields the same road.
 *
 * ONE MARK PER LANE, PLUS ONE FOR THE FOOTWAY, and that is the change that
 * makes the road a road. A single mark with a lane rolled onto it cannot
 * populate four lanes: the lane is a fresh draw every time, so a stretch of
 * course lands three vehicles in lane 1 and none anywhere else about as often
 * as it deals one each, and the player is shown an empty carriageway with an
 * occasional huddle in it. A mark per lane is the same total traffic laid down
 * where it can be seen — every lane is served, every screen.
 *
 * The lanes are walked in a fixed order and the footway last, so the seeded
 * stream is spent in a fixed order and a seed still yields the same road.
 */
export function spawnTraffic(state: DriveState): void {
  for (let lane = 0; lane < DRIVE.laneCount; lane++) spawnLane(state, lane);
  spawnPavement(state);
}

/** Where a lane's marks stop being laid — past the finish there is no more road
 * to put anything on, and the mark is retired rather than re-tested every tick.
 */
function retire(): number {
  return Number.POSITIVE_INFINITY;
}

/**
 * WHO IS DRIVING THIS ONE — one draw of the road's stream against the temper
 * mix, answered as a multiplier on the vehicle's own pace.
 *
 * MOST PEOPLE DO ROUGHLY THE LIMIT and the interesting part is who does not: a
 * road where everybody moves at one speed has no overtaking on it, no closing
 * speeds worth reading, and nothing for a lane change to be FOR. One draw, like
 * the fleet roll it sits beside, so adding a temper to the table cannot move a
 * body laid down after it.
 */
function rollTemper(rng: () => number): number {
  const { tempers } = DRIVE.drivers;
  let total = 0;
  for (const temper of tempers) total += temper.weight;
  let roll = rng() * total;
  for (const temper of tempers) {
    roll -= temper.weight;
    if (roll <= 0) return randomRange(rng, temper.pace.min, temper.pace.max);
  }
  const last = tempers[tempers.length - 1]!;
  return randomRange(rng, last.pace.min, last.pace.max);
}

/**
 * IS THERE ALREADY SOMEBODY ABREAST OF THIS MARK in the lane next door — the
 * spawner's half of the rung's promise that there is a way through.
 *
 * See `DifficultyDef.drive.laneGuardPx`. Measured along the COURSE rather than
 * in world x so both legs answer it identically, and asked of the sibling lane
 * only: the two carriageways are separate problems and a car coming the other
 * way is not something the player can be pinned against.
 */
function pairedLaneBusy(
  state: DriveState,
  lane: number,
  at: number,
  guardPx: number,
): boolean {
  const dir = state.params.direction;
  const home = state.car.home.x;
  const sibling = siblingLane(lane);
  for (const other of state.traffic) {
    if (laneAt(other.pos.y) !== sibling) continue;
    if (Math.abs((other.pos.x - home) * dir - at) <= guardPx) return true;
  }
  return false;
}

/** Lay down one lane's share of the traffic. */
function spawnLane(state: DriveState, lane: number): void {
  const { rng } = state;
  const dir = state.params.direction;
  const withHero = laneRunsWithHero(lane, dir);
  const guardPx = difficultyDef(state.params.difficulty).drive.laneGuardPx;
  // HOW FAR OUT A LANE IS POPULATED, and the two sides want different answers.
  // Oncoming cars close at the SUM of both speeds, so the far lanes have to be
  // laid from further out or a head-on would appear out of nothing. The hero's
  // own side is the opposite problem: he catches it at the DIFFERENCE, which is
  // a crawl, so a car minted a screen and a half ahead takes the better part of
  // fifteen seconds to enter the picture — and the lane he is actually driving
  // in would read as empty for the whole opening of the leg.
  const reach = state.distance + DRIVE.spawnAheadPx * (withHero ? 1 : 1.6);
  // THE LANE STREAM RETIRES AT THE TOWN'S FAR GATE rather than at the finish
  // line. Past it the road is outskirt again — two lanes, no houses — and a bus
  // laid down out there would be the town's traffic on a country road, which is
  // exactly the thing the gate at the other end exists to prevent.
  const finish = cityEndPx(state.params);
  while (state.nextTrafficAt[lane]! < reach) {
    const at = state.nextTrafficAt[lane]!;
    if (at > finish) {
      state.nextTrafficAt[lane] = retire();
      break;
    }
    const variant = rollVehicle(rng, "road");
    const def = vehicleDef(variant);
    // WHO IS DRIVING IT, on top of what it is. The def's own band is what the
    // MACHINE can do (a bus dawdles, a sports car does not); the temper is the
    // person at the wheel, and it is the half that makes a lane worth
    // overtaking in. Rolled before the pitch, because the gap a vehicle leaves
    // behind it depends on how fast it is actually going.
    const pace =
      randomRange(rng, DRIVE.trafficSpeedPx.min, DRIVE.trafficSpeedPx.max) *
      randomRange(rng, def.pace.min, def.pace.max) *
      rollTemper(rng);
    // …AND WHETHER THIS MARK IS A CHASE. Rolled here, unconditionally, for the
    // same reason every other draw on this road is: a stream spent differently
    // depending on where the mark landed would re-lay the whole leg the moment
    // the opening was retuned.
    const chase = rng() < DRIVE.drivers.chase.chance;
    const chaseCars = Math.round(
      randomRange(
        rng,
        DRIVE.drivers.chase.cars.min,
        DRIVE.drivers.chase.cars.max,
      ),
    );
    const chaseGap = randomRange(
      rng,
      DRIVE.drivers.chase.gapPx.min,
      DRIVE.drivers.chase.gapPx.max,
    );
    // The pitch is the ROLLED vehicle's, because the gap it leaves behind it
    // depends on how fast it is going — so the roll happens even for a mark in
    // the opening stretch that puts nothing on the road.
    state.nextTrafficAt[lane] = at + lanePitch(state, withHero ? pace : -pace);
    // THE LANES ARE THE TOWN'S. Out on the outskirts there is nothing on the
    // carriageway at all — a four-lane road with a bus on it and no houses
    // either side is not out of town, it is the town with the buildings
    // forgotten — and the one stream that DOES run out there is the footway's
    // below.
    if (at < cityStartPx(state.params)) continue;
    // …AND THE RUNG MAY BE KEEPING THIS STRETCH OPEN. A vehicle declined here
    // is not deferred — the mark has already moved on and the road simply
    // carries one fewer car — which is exactly the shape the promise wants: the
    // gentle rungs lose the vehicle that would have shut the second lane and
    // keep every other one (`DifficultyDef.drive.laneGuardPx`).
    if (guardPx > 0 && pairedLaneBusy(state, lane, at, guardPx)) continue;
    // Signed in world +x, like the hero's own velocity: his way or against it.
    const speed = (withHero ? dir : -dir) * pace;
    if (chase) {
      spawnChase(state, lane, at, withHero, chaseCars, chaseGap);
      continue;
    }
    state.traffic.push(
      createTraffic(
        state.nextId++,
        variant,
        { x: state.car.home.x + dir * at, y: laneCenter(lane) },
        speed,
        // The weave's phase, derived from the spawn mark rather than drawn, so
        // adding a rider to the road can never move one rolled after it.
        (at * 0.017) % (Math.PI * 2),
      ),
    );
  }
}

/**
 * SOMEBODY IS BEING CHASED — a runner and the cars after it, laid down at one
 * mark instead of one vehicle.
 *
 * IT IS NOT A NEW KIND OF TRAFFIC, and that is the whole of why it was cheap. A
 * chase is three ordinary vehicles whose drivers have their `urgency` wound
 * right up: they change lanes on a gap nobody sane would take, steer three times
 * as hard to do it, and follow the car in front far closer than the traffic they
 * are threading. Every sight it produces — the weaving, the overtaking, the
 * pile-up it leaves in the lane behind it — is the ordinary driver in `ai.ts`
 * being asked to try much harder, and not one line of it is written twice.
 *
 * The BLUE LIGHTS are the only thing the chase adds that nothing else has, and
 * they are presentation: `siren` is read by the renderer and by nothing in the
 * sim, because a light bar does not change a collision.
 *
 * NOT ONE DRAW OF ITS OWN. Everything rolled for it was rolled at the mark
 * (`spawnLane`), whether or not the mark turned out to be a chase — the same
 * discipline the pitch and the temper follow, and the reason retuning how often
 * a chase happens cannot re-lay the rest of the road.
 */
function spawnChase(
  state: DriveState,
  lane: number,
  at: number,
  withHero: boolean,
  cars: number,
  gapPx: number,
): void {
  const dir = state.params.direction;
  const { chase } = DRIVE.drivers;
  const along = withHero ? dir : -dir;
  // FLAT OUT, and the same pace for the whole procession: a chase that had its
  // cars at their own tempers would spread out into three unrelated fast cars
  // over about four seconds, which is a different and much duller picture.
  const pace = DRIVE.trafficSpeedPx.max * chase.paceMult;
  const y = laneCenter(lane);
  const born = (index: number, variant: number): DriveTraffic => {
    const one = createTraffic(
      state.nextId++,
      variant,
      // Behind the runner, measured along its own direction of travel so the
      // procession is in the right order on both legs.
      { x: state.car.home.x + dir * at - along * gapPx * index, y },
      along * pace,
      (at * 0.017 + index) % (Math.PI * 2),
    );
    one.urgency = chase.urgency;
    state.traffic.push(one);
    return one;
  };
  // WHO RUNS. A coupe: quick enough to be worth chasing and ordinary enough
  // that the player reads the blue lights rather than the car.
  born(0, variantOf("traffic_coupe"));
  const police = variantOf("traffic_police");
  for (let i = 1; i <= Math.max(1, cars); i++) born(i, police).siren = true;
}

/**
 * …and the delivery trade, which is not in a lane at all: its own stream, its
 * own pool and its own rate, so the footway neither takes a lane's vehicle away
 * nor gets busier every time the lanes do.
 *
 * IT IS ALSO THE ONLY THING RUNNING ON THE OUTSKIRTS, which is the one place
 * this spawner does two different jobs. Before the gate there is one pavement
 * and no town behind it, so the stream runs at the near kerb only and draws from
 * the opening's own short roster — a cyclist, an e-bike, somebody's dinner on
 * the back of a moped (`OUTSKIRT_IDS`). That is what makes the empty road read
 * as a road rather than as a level that has not loaded: there is somebody on it,
 * and they are the two kinds of person who are out on a dual carriageway's
 * footway at that hour.
 */
function spawnPavement(state: DriveState): void {
  const { rng } = state;
  const dir = state.params.direction;
  const reach = state.distance + DRIVE.spawnAheadPx * 1.6;
  const finish = courseLength(state.params);
  const gate = cityStartPx(state.params);
  const far = cityEndPx(state.params);
  while (state.nextPavementAt < reach) {
    const at = state.nextPavementAt;
    if (at > finish) {
      state.nextPavementAt = retire();
      break;
    }
    // OUT OF TOWN AT EITHER END. The outskirts bracket the town (`cityEndPx`),
    // so the footway's thin delivery stream is what runs on the approach AND on
    // the run-out — which is what lets the trip home open on the same picture
    // the trip out closes on.
    const outskirts = at < gate || at > far;
    state.nextPavementAt =
      at +
      1000 / (outskirts ? DRIVE.opening.ridersPerKPx : pavementPerKPx(state));
    // WHICH FOOTWAY, and the side settles the direction: the delivery trade
    // travels with the flow like everything else, so a rider on the near
    // pavement runs the hero's way on the leg out and against it on the leg
    // home — exactly the near/far split the lanes use. Out of town there is only
    // the one pavement, and it is the near one.
    // The draw happens either way, even where the answer is already settled —
    // the same rule the lane's pitch follows above: a stream spent differently
    // on the outskirts would move every rider in the town the moment the opening
    // was retuned.
    const side = rng() < 0.5;
    const nearSide = outskirts || side;
    const withHero = nearSide === (dir === 1);
    const variant = rollVehicle(rng, outskirts ? "outskirts" : "pavement");
    const def = vehicleDef(variant);
    const pace =
      randomRange(rng, DRIVE.trafficSpeedPx.min, DRIVE.trafficSpeedPx.max) *
      randomRange(rng, def.pace.min, def.pace.max);
    state.traffic.push(
      createTraffic(
        state.nextId++,
        variant,
        { x: state.car.home.x + dir * at, y: pavementY(nearSide) },
        (withHero ? dir : -dir) * pace,
        (at * 0.017) % (Math.PI * 2),
      ),
    );
  }
}

/**
 * STOP THE SPAWNER laying any more traffic — the exhibits stage their own, and
 * several suites need a road holding nothing but what they planted.
 *
 * It lives here beside the marks it sets because there are `laneCount + 1` of
 * them now: a caller silencing the road by hand gets one lane quiet and three
 * still serving cars, and would have to be re-visited every time the road grows
 * another lane.
 */
export function haltTraffic(state: DriveState, at = retire()): void {
  state.nextTrafficAt.fill(at);
  state.nextPavementAt = at;
}

/**
 * Where a fresh leg's marks start.
 *
 * THE LANES OPEN AT THE TOWN'S GATE, half a gap short of it so the first
 * vehicles are already in the picture as the houses arrive rather than fading up
 * behind them — and STAGGERED across that gap, so they do not arrive four
 * abreast like the start of a race.
 *
 * THE FOOTWAY OPENS AT THE START OF THE LEG, because the outskirts have riders
 * on them and nothing else at all (`spawnPavement`). The very first mark is held
 * back past the car's own arrival: a moped in the frame before the wagon is in
 * it makes the opening shot read as somebody else's.
 */
export function resetTrafficMarks(params: {
  coursePx?: number;
  cityPx?: number;
}): { lanes: number[]; pavement: number } {
  const open = Math.max(0, cityStartPx(params) - DRIVE.laneTraffic.gapPx / 2);
  return {
    lanes: Array.from(
      { length: DRIVE.laneCount },
      (_, lane) => open + (lane * DRIVE.laneTraffic.gapPx) / DRIVE.laneCount,
    ),
    pavement: DRIVE.opening.ridersFromPx,
  };
}

/** One tick of the other traffic: roll on, DRIVE if somebody is at the wheel,
 * work off any slew, weave if this is somebody on the footway, lie down if it
 * has been knocked over, and forget what is well behind. */
export function stepTraffic(state: DriveState, dt: number): void {
  const dir = state.params.direction;
  const edges = roadEdges();
  const band = roadBandEdges();
  const walk = crowdEdges();
  const { pavementRiders, traffic: cfg } = DRIVE;
  // WHO IS IN WHICH LANE, built once for the whole walk (`ai.ts`). Every driver
  // below asks it what is in front of it and what is beside it, and the
  // alternative is each of forty vehicles walking the whole road.
  const index = indexTraffic(state);
  for (const other of state.traffic) {
    if (other.hitCooldownMs > 0) other.hitCooldownMs -= dt * 1000;
    if (other.crashCooldownMs > 0) other.crashCooldownMs -= dt * 1000;
    // …and the foot on the brake comes up on its own clock. Counted here beside
    // the other two rather than where it is READ, because the shove re-stamps it
    // every tick it lasts (`push.ts`) and a clock only the driver's own branch
    // wound down would never move on a car being carried.
    if (other.brakeMs > 0) other.brakeMs -= dt * 1000;
    const def = vehicleDef(other.variant);

    if (other.downed) {
      // ON ITS SIDE. It is not steering any more, it is sliding — so it runs on
      // the same ballistics-then-friction pair everything else lying in this
      // road does, and comes to rest wherever it ends up.
      if (other.z > 0 || other.vz > 0) {
        other.vz -= cfg.downGravityPx * dt;
        other.z += other.vz * dt;
        if (other.z <= 0) {
          other.z = 0;
          other.vz = other.vz < -60 ? -other.vz * cfg.downBounce : 0;
          other.speed *= 0.7;
          other.slew *= 0.7;
        }
      }
      other.pos.x += other.speed * dt;
      other.pos.y += other.slew * dt;
      other.angle += other.spin * dt;
      if (other.z <= 0) {
        // ON THE TARMAC AND BEING SCRUBBED BY IT — the viscous bite and then
        // the friction that actually finishes it.
        //
        // THE FRICTION IS APPLIED TO THE TRAVEL RATHER THAN TO EACH AXIS, which
        // matters because a thing that has gone over is almost never running
        // straight: it left the lane sideways as well as forwards, and taking a
        // fixed number off each of `speed` and `slew` separately would scrub a
        // diagonal slide by half as much again as a straight one and bend its
        // path toward whichever axis ran out first. One deceleration, along the
        // direction it is going, is the honest sum and it is also the simple
        // one. See `downFrictionPx` for why a drag alone could never stop it.
        const drag = Math.max(0, 1 - cfg.downDragPerSec * dt);
        other.speed *= drag;
        other.slew *= drag;
        other.spin *= drag;
        const travel = Math.hypot(other.speed, other.slew);
        const scrub = cfg.downFrictionPx * dt;
        if (travel <= scrub + cfg.downRestPx) {
          other.speed = 0;
          other.slew = 0;
          other.spin = 0;
        } else {
          const keep = (travel - scrub) / travel;
          other.speed *= keep;
          other.slew *= keep;
        }
      }
      // A DROPPED MACHINE ENDS UP WHEREVER IT SLIDES, pavement included — that
      // is what a bicycle does. A ROLLED CAR is held to the carriageway and its
      // gutter, and the difference is worth the branch: two tonnes of estate
      // thrown clean across the footway comes to rest in somebody's front
      // garden, drawn up among the houses, which reads as the collision having
      // deleted it rather than rolled it. It stops against the kerb instead,
      // which is where a rolled car stops.
      const rest = def.class === "open" ? walk : edges;
      other.pos.y = clamp(other.pos.y, rest.top, rest.bottom);
      if (other.pos.y === rest.top || other.pos.y === rest.bottom) {
        // …AND WHAT IT MEETS THERE IS A KERB. It used to keep half its lateral
        // speed on every tick it spent against the edge, which is a thing
        // leaning on a wall rather than a thing that has hit one — and while it
        // leant, the along-road half of the slide carried on unchecked, so a
        // rolled car ground its way down the gutter for a screen and a half. A
        // slide that reaches the edge of the road has arrived.
        other.slew = 0;
      }
      continue;
    }

    // SPUN OUT, BUT STILL ON ITS WHEELS. A car that has been clipped off-centre
    // is turning, and the turn bleeds off against its own tyres — which is a
    // different motion from a rolled one's cartwheel and has to keep running
    // while the car does everything else it was doing. Ahead of the wreck check
    // on purpose: an engine that has died does not stop the body rotating.
    const rest = restAngle(other);
    if (other.spin !== 0 || other.angle !== rest) {
      const { crush } = DRIVE;
      other.angle += other.spin * dt;
      const damp = Math.max(0, 1 - crush.yawDampPerSec * dt);
      other.spin *= damp;
      if (Math.abs(other.spin) < 0.2) other.spin = 0;
      // …AND FOUR TYRES ON TARMAC PULL IT STRAIGHT AGAIN, every tick, all the
      // way back to where it settles.
      //
      // BOTH HALVES OF THAT WERE WRONG. The straightening lived INSIDE the
      // spin's own branch and ran on the single frame the spin died on — one
      // multiply by 0.9 — and the frame after that `spin` was zero, so the whole
      // block stopped being entered at all and the body kept whatever angle it
      // had for the rest of the leg. A car shoved down the road therefore
      // travelled at a fixed thirty degrees to the direction it was moving in,
      // sliding sideways like a thing on ice, which is the one thing on this
      // road nothing has ever done. It was also allowed to reach `yawRestRad *
      // 4` — nearly sixty degrees — which is not a car being nudged askew, it is
      // a car that should have gone over (`tipsOver`).
      //
      // …AND A WRECK STRAIGHTENS TOO, which the old note argued against on the
      // grounds that nobody is correcting it. What pulls a car back in line is
      // not the driver, it is the TYRES: a body yawed to its own direction of
      // travel is scrubbing sideways on four contact patches, and that scrub is
      // exactly the force that lines it back up. A dead engine does not change
      // it. What DOES is losing the wheel that was doing the work — see
      // `restAngle`.
      if (other.spin === 0) {
        const back = Math.min(1, crush.yawStraightenPerSec * dt);
        other.angle += (rest - other.angle) * back;
        if (Math.abs(other.angle - rest) < 0.01) other.angle = rest;
      }
      // A FEW DEGREES, not a quarter turn: this is a car on its wheels being
      // shoved about, and anything past it is the rollover the collision has
      // its own test for.
      const cap = crush.maxYawRad + Math.abs(rest);
      other.angle = clamp(other.angle, -cap, cap);
    }

    if (other.wrecked) {
      // FINISHED, AND STILL ROLLING. It coasts to a halt in whatever lane it
      // died in, which is the whole payoff of wrecking one: a stationary
      // obstacle nobody put there on purpose.
      other.pos.x += other.speed * dt;
      const drag = Math.max(0, 1 - cfg.wreckDragPerSec * dt);
      other.speed *= drag;
      // …and the tyres under it, which are what actually ends the roll rather
      // than merely thinning it out for ever (`wreckFrictionPx`).
      const scrub = cfg.wreckFrictionPx * dt;
      const rolling = Math.abs(other.speed);
      if (rolling <= scrub + cfg.wreckRestPx) other.speed = 0;
      else other.speed -= Math.sign(other.speed) * scrub;
      continue;
    }

    other.pos.x += other.speed * dt;
    // …AND SOMEBODY IS DRIVING IT. The lane it wants, the wobble, going round
    // whatever is stopped in front of it, lifting off for the car ahead — the
    // whole driver, which is its own file (`ai.ts`).
    //
    // WHO DOES NOT GET ONE, and each for a different reason: the delivery trade
    // is not in a lane at all and weaves to its own rule below, and a car
    // somebody PARKED and walked away from has nobody in it, which is exactly
    // what `driverless` means. Both fall through to the plain recovery, which is
    // also the right answer for them — a shoved moped gets back on its line and
    // a shoved parked car rolls to a stop (its `cruise` is zero).
    if (!def.pavement && !other.driverless) {
      steerTraffic(state, index, other, dt);
    } else if (other.speed !== other.cruise) {
      // …AND THE ONE GETS BACK ON THE PACE. A shove up the road is a real change
      // of speed and it has to be, or a collision is weightless; a shove that
      // never wore off would leave every car the hero has ever touched running
      // down the carriageway at his speed. Nobody is driving a WRECK, which is
      // why that case has already `continue`d.
      const ease = Math.min(1, cfg.recoverPerSec * dt);
      other.speed += (other.cruise - other.speed) * ease;
      if (Math.abs(other.cruise - other.speed) < 1) other.speed = other.cruise;
    }

    if (def.pavement) {
      // THE FOOTWAY WEAVE. Derived from the rider's own phase and its position
      // rather than drawn for, so it costs the road's stream nothing — and it
      // reaches PAST the kerb (`cutInPx`), because a delivery rider who
      // respected the kerb would be scenery rather than a hazard.
      // THE FOOTWAY WEAVE IS TWO MOTIONS, and only one of them is the weave.
      //
      // The small fast one is the drift — a rider never holds a line, and a
      // moped that did would read as a parked one sliding past. The slow one is
      // the CUT-IN, cubed so it is flat for most of its cycle and then reaches
      // right across the kerb into the carriageway: the whole reason these are
      // out here is that they do not stay on the pavement, and a hazard that
      // only ever occupied the pavement would be one the player learns to
      // ignore in about four seconds.
      const nearSide = other.pos.y > 0;
      const home = pavementY(nearSide);
      const t = other.phase + other.pos.x * 0.01 * pavementRiders.weaveHz;
      const limit = nearSide
        ? band.bottom - pavementRiders.cutInPx
        : band.top + pavementRiders.cutInPx;
      const cut = Math.max(0, Math.sin(t * 0.37 + other.phase)) ** 3;
      const inward =
        Math.max(0, Math.sin(t)) * pavementRiders.weavePx +
        cut * Math.abs(home - limit);
      const target = home + (nearSide ? -1 : 1) * inward;
      other.pos.y = nearSide
        ? Math.max(limit, Math.min(walk.bottom, target))
        : Math.min(limit, Math.max(walk.top, target));
    }

    if (other.slew !== 0) {
      other.pos.y += other.slew * dt;
      const damp = Math.max(0, 1 - DRIVE.shuntDampPerSec * dt);
      other.slew *= damp;
      if (Math.abs(other.slew) < 1) other.slew = 0;
      // A SHUNTED CAR IS STILL ON THE ROAD. The shove is a slew of up to
      // `shuntMaxPx` bleeding off over a couple of seconds, and nothing else
      // ever moved a car across the lanes, so nothing else had to say this —
      // but unclamped it carries a hard-hit van a hundred and fifty px clear of
      // the tarmac and parks it on the verge in front of the houses, which
      // reads as the collision having deleted it rather than shoved it. The
      // hero is held to the same edges (`stepDrive`); so is everybody else.
      // A pavement rider is held to the WIDER band, because the pavement is
      // where they live.
      const top = def.pavement ? walk.top : edges.top;
      const bottom = def.pavement ? walk.bottom : edges.bottom;
      other.pos.y = clamp(other.pos.y, top, bottom);
      if (other.pos.y === top || other.pos.y === bottom) other.slew = 0;
    }
  }
  state.traffic = state.traffic.filter((other) => {
    const behind = (other.pos.x - state.car.pos.x) * dir;
    // Oncoming traffic passes and is gone; the hero's own side can trail a long
    // way back before it is worth forgetting.
    return behind > -DRIVE.despawnBehindPx && behind < DRIVE.spawnAheadPx * 2.2;
  });
}

/**
 * THE ANGLE THIS VEHICLE SETTLES AT (rad) — nought for a car with a wheel at
 * each end, and a couple of degrees NOSE DOWN or TAIL DOWN for one missing one.
 *
 * THE END WITH NOTHING UNDER IT DROPS, which is the whole rule and the only one
 * that reads: a car dragging a bare hub sits down on that corner, and it stays
 * sat down, because what pulls a body level again is the wheel that is no longer
 * there. Everything else straightens (see the caller) — this is the one thing on
 * a car being shoved about that is allowed to keep an angle at all.
 *
 * BOTH ENDS GONE IS LEVEL AGAIN, and lower — which the picture has no way to
 * say, and a car tilted twice as far would say something quite different.
 *
 * THE SIGN IS THE BODY'S, NOT THE SCREEN'S. The renderer turns the sprite about
 * its seat BEFORE mirroring it (`wreck-draw.ts`), so a positive angle always
 * drops whatever is on the RIGHT — which is the nose of a car pointing that way
 * and the tail of one pointing back. Reading `faceLeft` here is what keeps "the
 * end with no wheel drops" true on both legs of the trip instead of on one.
 */
function restAngle(other: DriveTraffic): number {
  const nose = (other.wheelsOff & 1) !== 0 ? 1 : 0;
  const tail = (other.wheelsOff & 2) !== 0 ? 1 : 0;
  const toNose = other.faceLeft ? -1 : 1;
  return toNose * (nose - tail) * DRIVE.crush.yawSetPerWheel;
}

/**
 * PUT OUT THE LAMPS AT THE END THAT WAS HIT.
 *
 * `fromX` is where the blow came from, and the whole of the reasoning is that a
 * car's nose is not always on its right: the road runs both ways and an
 * oncoming body is drawn flipped. So the end struck is worked out from the side
 * the hit landed on AND the way the car is facing, never from the side alone —
 * which lit the wrong lamp for exactly half the traffic on the road.
 */
export function breakTrafficLamps(other: DriveTraffic, fromX: number): void {
  const hitLeft = fromX < other.pos.x;
  if (hitLeft === other.faceLeft) other.noseOut = true;
  else other.tailOut = true;
}

/**
 * SHOVE A CAR — the whole of what one vehicle meeting another does to the one
 * that was met, and the reason the hero gets THROUGH rather than stuck behind
 * it.
 *
 * IT USED TO BE ONE THING: a sideways slide out of the lane, at a slew read off
 * the impulse's lateral component and a flat 12% off the speed. That is a car
 * politely stepping aside, and it is why hitting one felt like nothing — the
 * ONE axis a car actually travels on was the one axis the collision was not
 * allowed to touch.
 *
 * It is four things now, and every one of them is the momentum sum's own answer
 * divided by the struck vehicle's own mass (`Impact.dv`) rather than a number
 * picked per outcome:
 *
 *   IT IS PUNTED UP THE ROAD, which is the half that was missing. A hatchback
 *   met square is shoved bodily forward and spends the next second being
 *   pushed; a bus takes the identical blow and gains about a mile an hour. That
 *   difference is `impulse / massKg` and nothing else, and it is the single
 *   biggest reason the crashes read as having weight now.
 *   IT GOES SIDEWAYS, as it always did, away from whatever hit it.
 *   IT SPINS, because the blow did not land on its centre of mass. The lever
 *   arm is the contact point the collision already solved (`Impact.along`), so
 *   a corner clip spins a car out and a hit dead in the door does not — and
 *   nobody had to write either sentence down.
 *   IT IS SEPARATED, immediately and positionally. Two overlapping bodies do
 *   not un-overlap on their own for many ticks, and while they overlap they
 *   keep colliding — so the shove puts real daylight between them on the spot.
 */
export function shunt(
  other: DriveTraffic,
  hit: Impact,
  awayFrom: number,
): void {
  const { crush } = DRIVE;
  // Always AWAY from the car that hit it, however the impulse came out — a
  // shunted car sliding back INTO the hero is the one outcome nobody reads as
  // a shove.
  const side = other.pos.y >= awayFrom ? 1 : -1;
  // …AND IT LEAVES WITH AT LEAST ENOUGH TO GET CLEAR. The floor is what used to
  // be an instantaneous twenty-two-px hop sideways (`separationPx`); it is a
  // SPEED now, so a car shoved dead square drives itself out of the wagon's way
  // over the following tenth of a second instead of arriving there on the frame
  // of the blow. Two bodies overlapping in the meantime is somebody else's
  // problem and always was — `shuntImmuneMs`, stamped on every contact.
  const push = Math.max(
    DRIVE.separationPx,
    Math.abs(hit.dv.y) * DRIVE.shuntPx * 0.01,
  );
  other.slew = Math.max(
    -DRIVE.shuntMaxPx,
    Math.min(DRIVE.shuntMaxPx, side * push),
  );
  // THE PUNT. Signed with the blow rather than with the road, so rear-ending
  // somebody sends them up the road and meeting one head-on drives it back down
  // its own lane — which is what a head-on does, and what a struck car sliding
  // meekly to the verge never said.
  //
  // …AND IF IT WAS A REAR-ENDING, THE PERSON IN IT STANDS ON THE BRAKE. Read off
  // the punt rather than off the geometry a second time: a shove that runs the
  // way the car was already travelling is a blow that landed on its back, and
  // one square enough to be a rear-ending rather than a corner caught on the way
  // past (`Impact.squareness`, which is the same line the ejections are decided
  // on). A head-on fails the first test — the punt drives it backwards — and a
  // sideswipe fails the second, which is right: neither of those is somebody
  // being hit from behind, and a road where every clipped wing came to a
  // standstill would be a car park by the second junction.
  if (
    hit.dv.x * heading(other) > 0 &&
    hit.squareness >= DRIVE.drivers.rearEndSquare
  ) {
    other.brakeMs = DRIVE.drivers.brakeMs;
  }
  other.speed += hit.dv.x * crush.punt;
  // THE SPIN, off the lever arm the contact already gives us. `hit.along` is
  // measured from the HERO's centre toward his nose, so what it says about the
  // OTHER vehicle is how far up the flank the two of them met — which is the
  // arm, in the only frame both cars share.
  const def = vehicleDef(other.variant);
  const arm = Math.min(1, Math.abs(hit.along) / Math.max(1, def.halfLengthPx));
  const yaw = Math.abs(hit.dv.y) * DRIVE_UNITS.mPerPx * crush.yawPerMs * arm;
  other.spin += side * Math.min(crush.maxYawSpin, yaw);
  other.hitCooldownMs = DRIVE.shuntImmuneMs;
}

/**
 * IT IS NOT PARKED ANY MORE — turn a struck kerbside car into one of the
 * traffic, and hand back the vehicle the collision should actually be solved
 * against.
 *
 * THE WHOLE OF WHY HITTING A PARKED CAR DID NOTHING. A parked car is a
 * `DriveProp`, which is the right shape for a thing that stands still: a
 * position, a sprite and a collision circle. It has no speed, no crush depth,
 * no yaw, no roll and no wreck state — so the collision could not fold it,
 * punt it, spin it or put it on its roof, and the only answer left was to move
 * it sideways by a fixed number of pixels and carry on. Which is exactly what
 * the player saw: it shifted, and nothing happened.
 *
 * The kerb's own comment already said the true thing — a parked car is one of
 * the FLEET with the handbrake on — so the fix is to believe it. The moment one
 * is hit it stops being furniture and becomes a `DriveTraffic` like any other,
 * and every rule written for the road applies to it with nothing added.
 *
 * IT KEEPS THREE FACTS ABOUT HAVING BEEN PARKED, and they are all `driverless`:
 * its lights stay off, it never gets on a cruising speed, and there is nobody
 * in it to come through the screen. The HANDBRAKE is not one of them — that is
 * priced into the mass of the FIRST blow (`impactMasses.parkedExtra`) and has no
 * business surviving into the second, because by then the thing is rolling.
 */
export function unparkCar(
  drive: DriveState,
  prop: { id: number; variant: number; pos: { x: number; y: number } },
): DriveTraffic {
  const one = createTraffic(drive.nextId++, prop.variant, prop.pos, 0);
  one.driverless = true;
  // Nobody parks a car and sits in it, and nobody parks one and stays on it.
  one.occupants = 0;
  one.rider = false;
  // A car at the kerb is pointed the way the traffic on its side runs, which is
  // how it was drawn as furniture — so it does not flip round on being touched.
  one.faceLeft = drive.params.direction === -1;
  drive.traffic.push(one);
  return one;
}

/**
 * KNOCK A TWO-WHEELER OVER — what happens instead of a shunt when the thing hit
 * has two wheels and weighs less than the person who was on it.
 *
 * It is a different verb on purpose. A shunted car is still a car doing its
 * best; a bike that has been touched by a car is scrap sliding down the tarmac,
 * and drawing that as "a shove that settles" was the one part of the old
 * collision that read as the road pretending nothing had happened.
 */
export function knockDown(
  other: DriveTraffic,
  lateralPx: number,
  liftZ: number,
  awayFrom: number,
): void {
  const side = other.pos.y >= awayFrom ? 1 : -1;
  other.downed = true;
  other.slew = side * Math.abs(lateralPx) * 0.6;
  other.vz = liftZ * 0.5;
  other.z = Math.max(other.z, 1);
  // The spin is read off the speed it HAD, and then that speed is paid for
  // going down — the same trade a rolling car makes (`tipVehicle`), and read in
  // this order so a machine dropped hard still cartwheels hard.
  const wasPx = Math.abs(other.speed);
  other.speed *= DRIVE.traffic.downSpeedKeep;
  // How hard it cartwheels is how fast it was going — derived, never drawn for:
  // the road's stream lays the crowd down, and a cosmetic draw spent here would
  // move every body after it (the same rule the gore obeys).
  other.spin = side * wasPx * DRIVE.traffic.downSpinPerSpeed;
  other.hitCooldownMs = DRIVE.shuntImmuneMs;
  // …and it slides clear under its own steam rather than being placed clear —
  // see `separationPx`. A machine going down in front of the bumper is the one
  // case where the eye is definitely watching.
  other.slew += side * DRIVE.separationPx * 0.5;
}
