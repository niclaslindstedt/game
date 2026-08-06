// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE OTHER TRAFFIC — the cars that are also just trying to get somewhere.
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
// A SHUNT IS A SHOVE, NOT A WRECK. Hitting another car slews it out of its lane,
// scrubs some speed off it, and lets it settle — nobody rolls, nothing
// explodes. That is deliberately the modest version: the hero's car takes real
// damage from the exchange (a car is a much bigger lump than a person — see
// `trafficWearScale`), but the other driver just gets a fright. The dramatic
// version is a later job, and everything here is shaped so it can be added
// without moving the collision.

import { randomRange } from "@game/lib/rng.ts";

import { difficultyDef } from "../defs/difficulties.ts";
import { courseLength, DRIVE } from "./config.ts";
import { laneCenter } from "./crowd.ts";
import type { DriveState, DriveTraffic } from "./types.ts";

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

/** How many distinct cars the traffic is drawn from — the app's sprite table is
 * this long (see pwa/src/game/drive-screen/scenery.ts), and the same table
 * dresses the GOODCO car park: a saloon, a sports car, an SUV, a hatchback, an
 * electric, a police cruiser, a panel van, a pickup, a taxi and a bus. */
export const TRAFFIC_VARIANTS = 10;

/** Whether a lane runs the hero's way. Right-hand traffic: outbound he has the
 * near lanes (the bottom of the screen), homeward he has the far ones — so the
 * two legs are the same road with the sides swapped, which is what a real
 * return trip looks like. */
export function laneRunsWithHero(lane: number, direction: 1 | -1): boolean {
  const nearHalf = lane >= DRIVE.laneCount / 2;
  return direction === 1 ? nearHalf : !nearHalf;
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
    const lane = Math.floor(rng() * DRIVE.laneCount) % DRIVE.laneCount;
    const withHero = laneRunsWithHero(lane, dir);
    const pace = randomRange(
      rng,
      DRIVE.trafficSpeedPx.min,
      DRIVE.trafficSpeedPx.max,
    );
    // Signed in world +x, like the hero's own velocity: his way or against it.
    const speed = (withHero ? dir : -dir) * pace;
    state.traffic.push({
      id: state.nextId++,
      pos: { x: state.car.home.x + dir * at, y: laneCenter(lane) },
      speed,
      slew: 0,
      variant: Math.floor(rng() * TRAFFIC_VARIANTS) % TRAFFIC_VARIANTS,
      // Every car is drawn nose-first down its own direction of travel.
      faceLeft: speed < 0,
      hitCooldownMs: 0,
    });
  }
}

/** One tick of the other traffic: roll on, work off any slew, and forget what
 * is well behind. */
export function stepTraffic(state: DriveState, dt: number): void {
  const dir = state.params.direction;
  for (const other of state.traffic) {
    if (other.hitCooldownMs > 0) other.hitCooldownMs -= dt * 1000;
    other.pos.x += other.speed * dt;
    if (other.slew !== 0) {
      other.pos.y += other.slew * dt;
      const damp = Math.max(0, 1 - DRIVE.shuntDampPerSec * dt);
      other.slew *= damp;
      if (Math.abs(other.slew) < 1) other.slew = 0;
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
 * Shove a car out of its lane — the whole of what a shunt does, and the reason
 * the hero gets THROUGH rather than stuck behind what he just hit.
 *
 * Three things, in the order they matter:
 *
 *   IT GOES SIDEWAYS, away from whatever hit it, at a slew proportional to the
 *   blow. This is the visible half and the one the player reads.
 *   IT IS SEPARATED, immediately and positionally. Two overlapping bodies do
 *   not un-overlap on their own for many ticks, and while they overlap they
 *   keep colliding — so the shunt puts real daylight between them on the spot.
 *   Without it the hero grinds to a halt against a van he has already knocked
 *   aside, which is neither dramatic nor survivable.
 *   IT SLOWS DOWN, because nobody carries on at the same speed after being hit.
 */
export function shunt(
  other: DriveTraffic,
  lateralPx: number,
  awayFrom: number,
): void {
  const push = lateralPx * DRIVE.shuntPx * 0.01;
  // Always AWAY from the car that hit it, however the impulse came out — a
  // shunted car sliding back INTO the hero is the one outcome nobody reads as
  // a shove.
  const side = other.pos.y >= awayFrom ? 1 : -1;
  other.slew = Math.max(
    -DRIVE.shuntMaxPx,
    Math.min(DRIVE.shuntMaxPx, side * Math.abs(push)),
  );
  other.pos.y += side * DRIVE.separationPx;
  other.hitCooldownMs = DRIVE.shuntImmuneMs;
  other.speed *= 0.88;
}
