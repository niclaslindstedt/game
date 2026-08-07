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
import { courseLength, DRIVE, DRIVE_UNITS } from "./config.ts";
import type { Impact } from "./impact.ts";
import { crowdEdges, laneCenter, roadBandEdges, roadEdges } from "./crowd.ts";
import { PAVEMENT_SHARE, rollVehicle, vehicleDef } from "./fleet.ts";
import type { DriveState, DriveTraffic } from "./types.ts";

export { TRAFFIC_VARIANTS } from "./fleet.ts";

/** How thick the traffic is on this drive's rung — the baseline density
 * through the difficulty's own multiplier (`DifficultyDef.drive`). The gentle
 * rungs leave the road nearly the hero's own; the hard ones shut a lane on him
 * regularly. */
function trafficPerKPx(state: DriveState): number {
  return (
    DRIVE.trafficPerKPx *
    difficultyDef(state.params.difficulty).drive.trafficDensity
  );
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
    variant,
    // Every vehicle is drawn nose-first down its own direction of travel.
    faceLeft: speed < 0,
    noseOut: false,
    tailOut: false,
    hitCooldownMs: 0,
    wear: 0,
    rung: 0,
    crushNose: 0,
    crushTail: 0,
    glassOut: false,
    gore: 0,
    rolls: 0,
    wrecked: false,
    rider: def.rider !== null,
    occupants: def.occupants,
    downed: false,
    z: 0,
    vz: 0,
    angle: 0,
    spin: 0,
    phase,
  };
}

/** Lay down traffic ahead as the road unrolls. Like the crowd, minted once at a
 * running mark so a seed always yields the same road. */
export function spawnTraffic(state: DriveState): void {
  const { rng } = state;
  const dir = state.params.direction;
  // Oncoming cars close at the sum of both speeds, so the far lanes have to be
  // populated from further out or a head-on would appear out of nothing.
  const reach = state.distance + DRIVE.spawnAheadPx * 1.6;
  while (state.nextTrafficAt < reach) {
    const at = state.nextTrafficAt;
    state.nextTrafficAt += 1000 / trafficPerKPx(state);
    if (at < DRIVE.crowdStartPx * 0.5) continue;
    if (at > courseLength(state.params)) break;
    // THE FOOTWAY OR THE ROAD, decided first — because it settles which pool
    // the vehicle comes out of, and a pool is one draw whatever is in it.
    const onPavement = rng() < PAVEMENT_SHARE;
    const lane = Math.floor(rng() * DRIVE.laneCount) % DRIVE.laneCount;
    const withHero = laneRunsWithHero(lane, dir);
    const variant = rollVehicle(rng, onPavement);
    const def = vehicleDef(variant);
    const pace =
      randomRange(rng, DRIVE.trafficSpeedPx.min, DRIVE.trafficSpeedPx.max) *
      randomRange(rng, def.pace.min, def.pace.max);
    // Signed in world +x, like the hero's own velocity: his way or against it.
    const speed = (withHero ? dir : -dir) * pace;
    const y = onPavement
      ? pavementY(laneRunsWithHero(lane, dir) === (dir === 1))
      : laneCenter(lane);
    state.traffic.push(
      createTraffic(
        state.nextId++,
        variant,
        { x: state.car.home.x + dir * at, y },
        speed,
        // The weave's phase, derived from the spawn mark rather than drawn, so
        // adding a rider to the road can never move one rolled after it.
        (at * 0.017) % (Math.PI * 2),
      ),
    );
  }
}

/** One tick of the other traffic: roll on, work off any slew, weave if this is
 * somebody on the footway, lie down if it has been knocked over, and forget
 * what is well behind. */
export function stepTraffic(state: DriveState, dt: number): void {
  const dir = state.params.direction;
  const edges = roadEdges();
  const band = roadBandEdges();
  const walk = crowdEdges();
  const { pavementRiders, traffic: cfg } = DRIVE;
  for (const other of state.traffic) {
    if (other.hitCooldownMs > 0) other.hitCooldownMs -= dt * 1000;
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
        const drag = Math.max(0, 1 - cfg.downDragPerSec * dt);
        other.speed *= drag;
        other.slew *= drag;
        other.spin *= drag;
        if (Math.abs(other.speed) + Math.abs(other.slew) < cfg.downRestPx) {
          other.speed = 0;
          other.slew = 0;
          other.spin = 0;
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
        other.slew *= 0.5;
      }
      continue;
    }

    // SPUN OUT, BUT STILL ON ITS WHEELS. A car that has been clipped off-centre
    // is turning, and the turn bleeds off against its own tyres — which is a
    // different motion from a rolled one's cartwheel and has to keep running
    // while the car does everything else it was doing. Ahead of the wreck check
    // on purpose: an engine that has died does not stop the body rotating.
    if (other.spin !== 0) {
      other.angle += other.spin * dt;
      const damp = Math.max(0, 1 - DRIVE.crush.yawDampPerSec * dt);
      other.spin *= damp;
      if (Math.abs(other.spin) < 0.2) {
        other.spin = 0;
        // …and it straightens back up, because a car whose driver still has the
        // wheel does not spend the rest of the road at an angle. A WRECK does:
        // nobody is correcting it.
        if (!other.wrecked) other.angle *= 0.9;
        if (Math.abs(other.angle) < 0.02) other.angle = 0;
      }
      // Held well short of a quarter turn while it is still a car being driven
      // — past that it is not spinning, it is over, and that is `tipsOver`'s
      // question rather than this one's.
      const cap = DRIVE.crush.yawRestRad * 4;
      other.angle = clamp(other.angle, -cap, cap);
    }

    if (other.wrecked) {
      // FINISHED, AND STILL ROLLING. It coasts to a halt in whatever lane it
      // died in, which is the whole payoff of wrecking one: a stationary
      // obstacle nobody put there on purpose.
      other.pos.x += other.speed * dt;
      const drag = Math.max(0, 1 - cfg.wreckDragPerSec * dt);
      other.speed *= drag;
      if (Math.abs(other.speed) < cfg.wreckRestPx) other.speed = 0;
      continue;
    }

    other.pos.x += other.speed * dt;
    // …AND THE DRIVER GETS BACK ON THE PACE. A shove up the road is a real
    // change of speed and it has to be, or a collision is weightless; a shove
    // that never wore off would leave every car the hero has ever touched
    // running down the carriageway at his speed. Somebody is still driving it,
    // so it eases back to what it was doing (`DriveTraffic.cruise`). Nobody is
    // driving a WRECK, which is why that case has already `continue`d.
    if (other.speed !== other.cruise) {
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
  const push = Math.abs(hit.dv.y) * DRIVE.shuntPx * 0.01;
  other.slew = Math.max(
    -DRIVE.shuntMaxPx,
    Math.min(DRIVE.shuntMaxPx, side * push),
  );
  // THE PUNT. Signed with the blow rather than with the road, so rear-ending
  // somebody sends them up the road and meeting one head-on drives it back down
  // its own lane — which is what a head-on does, and what a struck car sliding
  // meekly to the verge never said.
  other.speed += hit.dv.x * crush.punt;
  // THE SPIN, off the lever arm the contact already gives us. `hit.along` is
  // measured from the HERO's centre toward his nose, so what it says about the
  // OTHER vehicle is how far up the flank the two of them met — which is the
  // arm, in the only frame both cars share.
  const def = vehicleDef(other.variant);
  const arm = Math.min(1, Math.abs(hit.along) / Math.max(1, def.halfLengthPx));
  const yaw = Math.abs(hit.dv.y) * DRIVE_UNITS.mPerPx * crush.yawPerMs * arm;
  other.spin += side * Math.min(crush.maxYawSpin, yaw);
  other.pos.y += side * DRIVE.separationPx;
  other.hitCooldownMs = DRIVE.shuntImmuneMs;
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
  // How hard it cartwheels is how fast it was going — derived, never drawn for:
  // the road's stream lays the crowd down, and a cosmetic draw spent here would
  // move every body after it (the same rule the gore obeys).
  other.spin = side * Math.abs(other.speed) * DRIVE.traffic.downSpinPerSpeed;
  other.hitCooldownMs = DRIVE.shuntImmuneMs;
  other.pos.y += side * DRIVE.separationPx * 0.5;
}
