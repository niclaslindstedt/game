// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MOMENT IT STOPS BEING AVOIDABLE — one pure question the app asks of the
// road so it knows when to slow the world down.
//
// WHY THE ENGINE ANSWERS IT. What the app does about it (drop to a quarter
// speed, lean the camera in, let the burst play out big) is entirely
// presentation and lives app-side. But "can this still be avoided" is not: it
// is a question about the car's LATERAL AUTHORITY, the crowd's own velocity and
// the geometry of the body the collision is solved against — the same three
// numbers `stepDrive` and `solveImpact` are built on, and answering it anywhere
// else means keeping a second copy of them in step with the first. So the
// engine says WHETHER, and the app decides what that is worth.
//
// IT IS A QUERY, NOT A STEP. It writes nothing, spends no draw, and a drive
// that nobody asks plays exactly as it did — which is the test to apply to
// anything added here.
//
// WHAT "UNAVOIDABLE" MEANS, precisely: inside the next `LOOKAHEAD_SEC` of the
// car's own travel there is an upright body that the wheel cannot get clear of.
// The car may spend that whole time steering AWAY at full authority — clamped
// by the road's edges, because it cannot leave the tarmac — and the widest gap
// it can open is still less than the two bodies' radii. Braking is deliberately
// not modelled: from anywhere near the top end, a body a fifth of a second away
// is not one the brakes have an opinion about.

import { clamp } from "@game/lib/vec.ts";

import { CAR } from "../vehicles.ts";
import { DRIVE } from "./config.ts";
import { roadEdges } from "./crowd.ts";
import type { DriveState } from "./types.ts";

/**
 * How far ahead the question is asked, in seconds of the car's own travel.
 *
 * SHORT ON PURPOSE. The answer is only interesting at the instant it becomes
 * true — a body two seconds out is "unavoidable" only in the sense that the
 * player has not steered YET, and calling that inevitable would slow the world
 * down for a hit he was about to duck. A fifth of a second is past the point
 * where the wheel is worth anything at speed.
 */
const LOOKAHEAD_SEC = 0.22;

/**
 * …and how fast the car has to be going for a hit to be worth watching, as a
 * fraction of the top end. Below it there is no drama in the collision: a body
 * met at a crawl is a nudge, and dropping the world into slow motion for one
 * would be the game making a fuss on the player's behalf.
 */
const DRAMA_SPEED_FRAC = 0.45;

/** A hit the wheel can no longer prevent. */
export type InevitableHit = {
  /** The body it will be. */
  id: number;
  /** How long until the two of them touch (ms of drive clock). */
  ms: number;
  /** How square it is going to be, 0→1 — how much of the closing speed is
   * running straight down the car's own axis at the body. */
  square: number;
};

/**
 * The soonest hit on this road that can no longer be steered out of, or null.
 *
 * Walks the live crowd, which is bounded by the spawn window (a couple of dozen
 * bodies at the shipped density), so it is a cheap per-tick scan rather than
 * anything that needs an index.
 */
export function inevitableHit(drive: DriveState): InevitableHit | null {
  const { car } = drive;
  const dir = drive.params.direction;
  const speed = Math.abs(car.speed);
  if (speed < DRIVE.topSpeedPx * DRAMA_SPEED_FRAC) return null;
  if (drive.outcome !== "driving") return null;

  // The lane authority the wheel actually has right now — the same product
  // `stepDrive` steers with, so this cannot flatter or libel the player's
  // chances.
  const authority = Math.min(1, speed / DRIVE.laneRefSpeedPx);
  const reachPerSec = DRIVE.lateralPx * authority;
  const edges = roadEdges();
  // Half the car's own body plus the bumper's reach: the gap the nose closes
  // before anything is touching.
  const clearance = CAR.footprint.radius + DRIVE.pedestrianRadiusPx;

  let soonest: InevitableHit | null = null;
  for (const ped of drive.pedestrians) {
    if (ped.mode === "tumbling") continue;
    // How fast the car's surface is running at this body along the road — the
    // same sweep the collision itself is solved on.
    const sweep = (dir * car.speed - ped.vel.x) * dir;
    if (sweep <= 0) continue;
    const gap = (ped.pos.x - car.pos.x) * dir - CAR.footprint.radius * 2;
    if (gap <= 0) continue;
    const t = gap / sweep;
    if (t > LOOKAHEAD_SEC) continue;

    // Where the body will be across the road when the two of them meet, and
    // the widest the car could possibly be from it by then.
    const pedY = ped.pos.y + ped.vel.y * t;
    const reach = reachPerSec * t;
    const lo = Math.max(edges.top, car.pos.y - reach);
    const hi = Math.min(edges.bottom, car.pos.y + reach);
    const best = Math.max(Math.abs(pedY - lo), Math.abs(pedY - hi));
    if (best >= clearance) continue;

    // How square it will be: the contact normal read onto the nose, exactly as
    // `solveImpact` reads it. A body dead ahead is 1; one about to be clipped by
    // a wing mirror is near 0.
    const offset = clamp(pedY - car.pos.y, -clearance, clearance);
    const square = Math.sqrt(
      Math.max(0, 1 - (offset / clearance) * (offset / clearance)),
    );
    if (!soonest || t * 1000 < soonest.ms) {
      soonest = { id: ped.id, ms: t * 1000, square };
    }
  }
  return soonest;
}
