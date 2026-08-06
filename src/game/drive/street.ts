// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE KERB — the lamp posts down both pavements and the cars somebody left at
// the near one, as things the wagon can actually hit.
//
// THE STREET IS DERIVED, NOT ROLLED. Every slot's contents come out of a hash
// of its own index, so the furniture costs the road's seeded stream nothing:
// the same street is laid out identically on the way home as on the way out, a
// restart after a breakdown puts every post back where it was, and adding or
// removing a piece can never move a body or a car that was rolled after it.
// That was already true when this was a renderer's backdrop — it stays true now
// that it is world.
//
// WHY IT MOVED OUT OF THE RENDERER. The drive drew a convincing street and then
// drove straight through it: parked cars were a picture, so the wagon passed
// through a van at 120 mph, and the lamp posts were paint. A player reads a car
// at the kerb as an obstacle exactly once — after that he has learnt that this
// road lies about what is on it, and he stops reading the kerb at all, which
// costs the picture everything it was drawn for.
//
// TWO PIECES, TWO PHYSICS, and the difference is the whole of what this file
// says:
//
//   A PARKED CAR does not break. It is a car with the handbrake on and a kerb
//   behind its wheels — heavier than one that is driving (`parkedCarMassKg`)
//   and, much more importantly, STILL: the collision is solved on the SWEEP, so
//   a stopped car is met at the hero's whole speed where one dawdling along in
//   the same direction is met at the difference. The damage goes as the square
//   of that, which is why clouting a parked car hurts about two and a half
//   times as much as nudging the van in front of you. Nobody wrote that rule;
//   it falls out of `solveImpact`.
//
//   A LAMP POST breaks. A street light is a slip-base column — it is BUILT to
//   shear off its foot rather than stop a car dead — so the mass the bumper
//   argues with is modest, the speed it costs is a couple of mph, and what the
//   player gets for it is the post leaving the pavement, cartwheeling down the
//   road and skidding to a stop in the gutter.

import type { Vec2 } from "@game/lib/vec.ts";

import { DRIVE } from "./config.ts";
import { roadBandEdges } from "./crowd.ts";
import type { DriveProp, DrivePropKind, DriveState } from "./types.ts";
import { TRAFFIC_VARIANTS } from "./traffic.ts";

/** A stable 0→1 off a slot index — the same trick the crowd's crossings use
 * (`markHash`), and here for the same reason: a street laid down without
 * touching the drive's rng can never shift a roll made after it. */
function slotHash(slot: number, salt: number): number {
  let h = Math.imul((slot * 2654435761 + salt) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Where a slot's furniture stands across the road: the far pavement's lamps
 * above the tarmac, the near pavement's below it. */
function kerbY(): { far: number; near: number } {
  const bands = roadBandEdges();
  return {
    far: bands.top - DRIVE.street.kerbOffsetPx,
    near: bands.bottom + DRIVE.street.kerbOffsetPx,
  };
}

/** One thing standing at a slot, before it is minted into the world. */
type StreetPiece = {
  kind: DrivePropKind;
  pos: Vec2;
  variant: number;
};

/**
 * WHAT STANDS AT ONE KERB SLOT — up to two pieces, and pure.
 *
 * The FAR pavement gets a lamp post every slot, offset half a pitch so the two
 * rows interleave rather than marching in pairs; a street lit from one side
 * only reads as a road with a film set along it. The NEAR pavement gets a lamp
 * post most of the time and somebody's parked car the rest (`parkedShare`).
 */
function piecesAt(slot: number): StreetPiece[] {
  const { pitchPx } = DRIVE.street;
  const y = kerbY();
  const x = slot * pitchPx;
  const parked = slotHash(slot, 5) < DRIVE.street.parkedShare;
  return [
    { kind: "lamp_post", pos: { x: x + pitchPx / 2, y: y.far }, variant: 0 },
    {
      kind: parked ? "parked_car" : "lamp_post",
      pos: { x, y: y.near },
      variant:
        Math.floor(slotHash(slot, 3) * TRAFFIC_VARIANTS) % TRAFFIC_VARIANTS,
    },
  ];
}

/** The slot a world x sits in, rounded the way this leg is travelling. */
function slotAt(x: number, dir: 1 | -1): number {
  const pitch = DRIVE.street.pitchPx;
  return dir === 1 ? Math.ceil(x / pitch) : Math.floor(x / pitch);
}

/** Where a leg's furniture starts being laid down — a comfortable stretch
 * BEHIND the opening frame, because the camera trails the car and an empty
 * kerb behind him on the first tick reads as the street starting late. */
export function firstPropSlot(homeX: number, dir: 1 | -1): number {
  return slotAt(homeX - dir * DRIVE.despawnBehindPx, dir);
}

/** Lay the kerb down as the road unrolls, and forget what is well behind. */
export function spawnProps(state: DriveState): void {
  const dir = state.params.direction;
  const reachX = state.car.pos.x + dir * DRIVE.spawnAheadPx;
  const pitch = DRIVE.street.pitchPx;
  while ((reachX - state.nextPropSlot * pitch) * dir >= 0) {
    const slot = state.nextPropSlot;
    state.nextPropSlot += dir;
    for (const piece of piecesAt(slot)) {
      state.props.push({
        id: state.nextId++,
        kind: piece.kind,
        pos: { x: piece.pos.x, y: piece.pos.y },
        variant: piece.variant,
        felled: false,
        vel: { x: 0, y: 0 },
        z: 0,
        vz: 0,
        angle: 0,
        spin: 0,
        hitCooldownMs: 0,
      });
    }
  }
}

/**
 * One tick of the kerb.
 *
 * A STANDING piece is furniture and costs nothing — no integration, no drift,
 * no draw call it did not already have. A FELLED post is pure ballistics: it
 * flies, it turns over, it lands, it skids, it stops. The same shape as a
 * tumbling body (`stepTumble`), because it is the same problem.
 */
export function stepProps(state: DriveState, dt: number): void {
  const dir = state.params.direction;
  const { street } = DRIVE;
  for (const prop of state.props) {
    if (prop.hitCooldownMs > 0) prop.hitCooldownMs -= dt * 1000;
    if (!prop.felled) continue;
    if (prop.z > 0 || prop.vz > 0) {
      prop.vz -= street.lampGravityPx * dt;
      prop.z += prop.vz * dt;
      if (prop.z <= 0) {
        prop.z = 0;
        // One grudging bounce — it is a steel tube, not a ball.
        prop.vz = prop.vz < -70 ? -prop.vz * street.lampBounce : 0;
      }
    }
    prop.pos.x += prop.vel.x * dt;
    prop.pos.y += prop.vel.y * dt;
    prop.angle += prop.spin * dt;
    const drag = Math.max(0, 1 - street.lampDragPerSec * dt);
    prop.vel.x *= drag;
    prop.vel.y *= drag;
    prop.spin *= drag;
    if (Math.hypot(prop.vel.x, prop.vel.y) < street.lampRestPx && prop.z <= 0) {
      prop.vel.x = 0;
      prop.vel.y = 0;
      prop.spin = 0;
      // Lying down, and it stays lying down.
      prop.angle = Math.PI / 2;
    }
  }
  state.props = state.props.filter(
    (prop) => (prop.pos.x - state.car.pos.x) * dir > -DRIVE.despawnBehindPx,
  );
}

/**
 * Take a post off its base — everything that happens to a lamp the instant it
 * stops being one.
 *
 * `launch` is the impulse the collision solved for it, which is why a post
 * clipped by a wing mirror at 30 leans over and drops where it stood while one
 * met square at 120 leaves the pavement entirely. The SPIN comes off the same
 * number: a cartwheel is what a long thin thing does when it is hit at one end,
 * and its direction is which side of the car took it, so a post on the near
 * kerb turns over away from the road.
 */
export function fellLamp(prop: DriveProp, launch: Vec2, liftZ: number): void {
  prop.felled = true;
  prop.vel.x = launch.x;
  prop.vel.y = launch.y;
  prop.vz = liftZ;
  prop.z = 0.01;
  const speed = Math.hypot(launch.x, launch.y);
  prop.spin = Math.sign(launch.y || 1) * speed * DRIVE.street.lampSpinPerSpeed;
  prop.hitCooldownMs = DRIVE.shuntImmuneMs;
}

/** The collision circle a piece answers for. */
export function propRadius(kind: DrivePropKind): number {
  return kind === "parked_car"
    ? DRIVE.street.parkedRadiusPx
    : DRIVE.street.lampRadiusPx;
}
