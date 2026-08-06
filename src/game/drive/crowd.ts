// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PEOPLE ON THE ROAD — where they come from, what they want, and what is
// left of them.
//
// WHO THEY ARE MATTERS TO HOW THEY MOVE. These are the ones the welfare did not
// reach: no money, no movie night, nothing indoors worth staying in for. They
// are out on the road because a road is where the cars are, and a car is where
// the money is. So they do not AVOID the hero — they see him coming and work
// their way into his path, because being in front of a car is the whole point
// of standing on a road you own nothing on.
//
// That is why the crowd LEADS ITS TARGET (`DRIVE.leadSeconds`): somebody
// stepping out where the car is going to be reads as a person flagging you
// down, where somebody stepping toward where it currently IS reads as a bug.
// It is also what makes the wheel worth anything — a crowd that walked at your
// present position would be dodged by driving in a straight line.
//
// AND THE JOKE ONLY WORKS IF THEY ARE UNAVOIDABLE. A road threaded clean makes
// the hero a monster for choosing to hit people; a road that cannot be threaded
// makes him a man who is not thinking about it at all, which is the funny one
// and the one the arrival lines are written against. `pedestriansPerKPx` is
// tuned to that, not to fairness.

import { randomRange, type Rng } from "@game/lib/rng.ts";

import { DRIVE } from "./config.ts";
import type { DrivePedestrian, DriveState } from "./types.ts";

/** How many distinct bodies the crowd is drawn from. The app's sprite table is
 * this long (`CROWD_SPRITES`, pwa/src/game/drive-screen/scenery.ts) — keep the
 * two in step, or the road quietly stops using its last body. */
export const CROWD_VARIANTS = 20;

/** How fast a tumbling body sheds its speed on the tarmac (1/s), and the speed
 * under which it has stopped for good. */
const TUMBLE_DRAG = 2.4;
const TUMBLE_REST = 8;
/** Gravity for a body in the air (px/s²) and what a bounce keeps. */
const TUMBLE_GRAVITY = 620;
const TUMBLE_BOUNCE = 0.28;

/** The road's outer edges in world y — the tarmac plus its gutters. Everything
 * on the road is born, walks and dies between these. */
export function roadEdges(): { top: number; bottom: number } {
  const half = (DRIVE.laneCount * DRIVE.laneWidth) / 2;
  return { top: -half - DRIVE.vergePx, bottom: half + DRIVE.vergePx };
}

/** The centre of a lane in world y — lane 0 is the far side of the road (the
 * top of the screen), the last lane the near side. */
export function laneCenter(lane: number): number {
  const half = (DRIVE.laneCount * DRIVE.laneWidth) / 2;
  return -half + (lane + 0.5) * DRIVE.laneWidth;
}

/** Lay down the next stretch of crowd as the road unrolls under the car.
 * Bodies are minted ONCE, at a running mark, rather than re-rolled per tick —
 * so the same seed lays the same people down however the car is driven. */
export function spawnCrowd(state: DriveState): void {
  const { rng } = state;
  const dir = state.params.direction;
  const reach = state.distance + DRIVE.spawnAheadPx;
  const edges = roadEdges();
  while (state.nextPedestrianAt < reach) {
    const at = state.nextPedestrianAt;
    state.nextPedestrianAt += 1000 / DRIVE.pedestriansPerKPx;
    // The opening stretch is empty on purpose: the player gets the wheel, and
    // the hero gets his think about the people ahead, before anybody is in the
    // way. See `DRIVE.crowdStartPx`.
    if (at < DRIVE.crowdStartPx) continue;
    if (at > DRIVE.coursePx) break;
    state.pedestrians.push({
      id: state.nextId++,
      pos: {
        x: state.car.home.x + dir * at,
        y: randomRange(rng, edges.top, edges.bottom),
      },
      vel: { x: 0, y: 0 },
      mode: "afoot",
      variant: Math.floor(rng() * CROWD_VARIANTS) % CROWD_VARIANTS,
      phase: rng() * Math.PI * 2,
      z: 0,
      vz: 0,
      counted: false,
    });
  }
}

/**
 * One tick of everybody on the road.
 *
 * An UPRIGHT body either mills about (a slow drift derived from its own fixed
 * phase, so the crowd is never still and never costs a draw) or — once the car
 * is inside `noticePx` — walks at where the car is GOING to be. A TUMBLING one
 * is pure ballistics: it flies, it lands, it skids, it stops.
 */
export function stepCrowd(state: DriveState, dt: number): void {
  const { car } = state;
  const dir = state.params.direction;
  const edges = roadEdges();
  const seconds = state.ms / 1000;
  for (const ped of state.pedestrians) {
    if (ped.mode === "tumbling") {
      stepTumble(ped, dt);
      continue;
    }
    const ahead = (ped.pos.x - car.pos.x) * dir;
    const gap = Math.hypot(ped.pos.x - car.pos.x, ped.pos.y - car.pos.y);
    if (gap < DRIVE.noticePx && ahead > 0) {
      // THE LUNGE — at where the car will be, not where it is.
      const leadX = car.pos.x + dir * Math.abs(car.speed) * DRIVE.leadSeconds;
      const dx = leadX - ped.pos.x;
      const dy = car.pos.y - ped.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      ped.vel.x = (dx / len) * DRIVE.lungePx;
      ped.vel.y = (dy / len) * DRIVE.lungePx;
    } else {
      // Milling about: a slow figure-of-eight off the body's own phase.
      ped.vel.x = Math.cos(seconds * 0.7 + ped.phase) * DRIVE.walkPx;
      ped.vel.y = Math.sin(seconds * 0.5 + ped.phase * 1.7) * DRIVE.walkPx;
    }
    ped.pos.x += ped.vel.x * dt;
    ped.pos.y += ped.vel.y * dt;
    // Nobody wanders off the road — there is nothing out there for them.
    if (ped.pos.y < edges.top) {
      ped.pos.y = edges.top;
      ped.vel.y = Math.abs(ped.vel.y);
    } else if (ped.pos.y > edges.bottom) {
      ped.pos.y = edges.bottom;
      ped.vel.y = -Math.abs(ped.vel.y);
    }
  }
  // Forget what is well behind the car — including the bodies, which is its own
  // small mercy: the hero never has to drive past his own morning.
  state.pedestrians = state.pedestrians.filter(
    (ped) => (ped.pos.x - car.pos.x) * dir > -DRIVE.despawnBehindPx,
  );
}

/** A struck body that did NOT come apart (the gore-off path): it flies, lands,
 * skids into the gutter and stays there. */
function stepTumble(ped: DrivePedestrian, dt: number): void {
  if (ped.z > 0 || ped.vz > 0) {
    ped.vz -= TUMBLE_GRAVITY * dt;
    ped.z += ped.vz * dt;
    if (ped.z <= 0) {
      ped.z = 0;
      // One half-hearted bounce, then it stays down.
      ped.vz = ped.vz < -60 ? -ped.vz * TUMBLE_BOUNCE : 0;
    }
  }
  ped.pos.x += ped.vel.x * dt;
  ped.pos.y += ped.vel.y * dt;
  const drag = Math.max(0, 1 - TUMBLE_DRAG * dt);
  ped.vel.x *= drag;
  ped.vel.y *= drag;
  if (Math.hypot(ped.vel.x, ped.vel.y) < TUMBLE_REST && ped.z <= 0) {
    ped.vel.x = 0;
    ped.vel.y = 0;
  }
}

/** Mint the crowd's spawn marks for a fresh drive. */
export function resetCrowdMarks(rng: Rng): number {
  // A touch of jitter on the very first mark so two drives on neighbouring
  // seeds do not open with a body in identically the same spot.
  return DRIVE.crowdStartPx + rng() * (1000 / DRIVE.pedestriansPerKPx);
}
