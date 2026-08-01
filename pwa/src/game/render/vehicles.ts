// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VEHICLE ASSEMBLIES — the car and the garage ship drawn as MACHINES
// (src/game/vehicles.ts), part by part, in place of their landmarks:
//
//   CAR  = two wheels (sprite picked per wheel from its STATE — sound, flat
//          tire, bent rim, gone — and its spin frame from the simulated
//          roll angle, so speed IS the spin) under six BODY PANELS, each
//          picked at its own damage rung (`car_<panel>_<rung>`: factory
//          straight → bumped → hammered → broken) AND its own FIX
//          (attached → loose rattle → dangling hinge poses → gone, with
//          the shed piece lying on the floor as decor). All panels share
//          one canvas, so the stack draws at a single anchor and rides the
//          suspension springs together. A RUNNING engine (driver seated)
//          shivers the shell on the render clock and burns the
//          `car_lights` layer over the stack.
//   SHIP = the starship hull, plus the ship_flame flicker under the bell
//          while `thrust` is above zero (parked in the garage it never is).
//
// The driving minigame raises `panels`/`wheelStates`/`fixes` per crash;
// this pass just draws whatever state says. Preview the whole damage
// matrix with `node scripts/car-viewer.mjs`.

import {
  CAR,
  CAR_FIX,
  type CarDetachable,
  type GameState,
  type Vehicle,
} from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { drawWorldSprite } from "./plane.ts";
import { billboard } from "./tilt.ts";
import { type Camera } from "./view.ts";
import type { InView } from "./world.ts";

/** The landmark kinds the assemblies replace — drawLandmarks skips these. */
export const VEHICLE_LANDMARK_KINDS = new Set(["car", "rocket"]);

export function drawVehicles(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  for (const vehicle of state.vehicles) {
    if (!inView(vehicle.pos.x, vehicle.pos.y, 64)) continue;
    if (vehicle.kind === "car") {
      drawCar(ctx, vehicle, sprites, camera, timeMs);
    } else {
      drawShip(ctx, vehicle, sprites, camera, timeMs);
    }
  }
  // Wheels that came off, mid-bounce or at rest: drawn lifted by their own
  // height, spinning from their own run-out speed (see WheelDebris).
  for (const wheel of state.wheelDebris) {
    if (!inView(wheel.pos.x, wheel.pos.y, 32)) continue;
    const frame = Math.floor(wheel.angle / (Math.PI / 5)) % 2;
    const name = wheelSprite(wheel.wheelState, frame);
    const sprite = spriteByName(sprites, name);
    if (!sprite) continue;
    drawWorldSprite(
      ctx,
      name,
      sprite,
      { x: wheel.pos.x, y: wheel.pos.y - wheel.z },
      camera,
      "base",
    );
  }
}

/** Which sprite a wheel wears: its state first, then the roll frame. */
function wheelSprite(wheelState: number, frame: number): string {
  if (wheelState === 1) return "car_wheel_flat"; // a flat doesn't spin
  if (wheelState === 2) return `car_wheel_bent_${frame}`;
  return `car_wheel_${frame}`;
}

const DETACHABLES = new Set<string>(CAR.detachables);

/** Which sprite a detachable part wears at its fix rung — and where. The
 * ATTACHED and LOOSE rungs draw the panel's own damage rung (loose merely
 * rattles the anchor by the dangle oscillator's pixel); DANGLING swaps to
 * the hinge poses; GONE draws the open bay. */
function partSprite(
  car: Extract<Vehicle, { kind: "car" }>,
  part: CarDetachable,
  rung: number,
): { name: string; dy: number } {
  const fix = car.fixes[part] ?? CAR_FIX.attached;
  if (fix === CAR_FIX.gone) return { name: `car_${part}_gone`, dy: 0 };
  if (fix === CAR_FIX.dangling) {
    // The roof is bolted, not hinged — it has no dangle poses, so a rung
    // past LOOSE reads as torn off.
    if (part === "roof") return { name: "car_roof_gone", dy: 0 };
    const frame = (car.dangle[part] ?? 0) >= 0 ? 0 : 1;
    return { name: `car_${part}_dangle_${frame}`, dy: 0 };
  }
  const dy = fix === CAR_FIX.loose ? Math.round(car.dangle[part] ?? 0) : 0;
  return { name: `car_${part}_${rung}`, dy };
}

/**
 * How far a corner of the shell has sunk: the spring's live compression,
 * plus what the wheel itself no longer holds up — a GONE wheel drops the
 * corner nearly a full wheel radius onto the bump stop, a flat a couple of
 * pixels, a bent rim one. This is what makes a car missing its front wheel
 * sit visibly NOSE-DOWN.
 */
function axleDrop(
  car: Extract<Vehicle, { kind: "car" }>,
  axle: number,
): number {
  const wheelState = car.wheelStates[axle] ?? 0;
  const missing =
    wheelState === 3
      ? CAR.wheelRadius - 1
      : wheelState === 1
        ? 2
        : wheelState === 2
          ? 1
          : 0;
  return (car.suspension[axle] ?? 0) + missing;
}

/** Vertical column bands the tilted shell is blitted in (px of source). */
const TILT_BAND = 8;

/**
 * Blit one shell layer with the body's PITCH: each 8px column band lands at
 * its own integer offset, interpolated (and extrapolated past the axles for
 * the overhangs) between the rear and front drops. A real rotation would
 * resample the pixel art into mush; a staircase shear keeps every texel —
 * and with equal drops it degenerates to the plain one-anchor blit.
 */
function drawShellLayer(
  ctx: CanvasRenderingContext2D,
  sprite: ImageBitmap,
  pos: { x: number; y: number },
  camera: Camera,
  rearDrop: number,
  frontDrop: number,
): void {
  billboard(ctx, pos.x, pos.y, camera.x, camera.y, () => {
    const w = sprite.width;
    const h = sprite.height;
    const left = Math.round(pos.x - w / 2 - camera.x);
    const top = Math.round(pos.y - (h - 2) - camera.y);
    if (Math.round(rearDrop) === Math.round(frontDrop)) {
      ctx.drawImage(sprite, left, top + Math.round(rearDrop));
      return;
    }
    const rearX = w / 2 + (CAR.wheelOffsets[0] ?? 0);
    const frontX = w / 2 + (CAR.wheelOffsets[1] ?? 0);
    for (let sx = 0; sx < w; sx += TILT_BAND) {
      const band = Math.min(TILT_BAND, w - sx);
      const t = (sx + band / 2 - rearX) / (frontX - rearX);
      const dy = Math.round(rearDrop + (frontDrop - rearDrop) * t);
      ctx.drawImage(sprite, sx, 0, band, h, left + sx, top + dy, band, h);
    }
  });
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  car: Extract<Vehicle, { kind: "car" }>,
  sprites: Sprites,
  camera: Camera,
  timeMs: number,
): void {
  // The shell's attitude: each corner sinks by its own spring AND whatever
  // its wheel no longer holds up, and the whole body pitches between the
  // two (a missing front wheel reads nose-down). A RUNNING engine shivers
  // the shell a pixel on the render clock — presentation only.
  const running = car.driver !== null;
  const shiver = running ? (Math.floor(timeMs / 45) % 2 === 0 ? 0 : -1) : 0;
  const rearDrop = axleDrop(car, 0) + shiver;
  const frontDrop = axleDrop(car, 1) + shiver;
  // Underbody first — the arches open onto dark steel and springs, never
  // onto the floor behind the car — then wheels, then the panel stack. The
  // underbody is shell too, so it pitches with the body.
  const under = spriteByName(sprites, "car_underbody");
  if (under) {
    drawShellLayer(ctx, under, car.pos, camera, rearDrop, frontDrop);
  }
  // Two roll frames half a spoke apart; the angle comes from the
  // simulation, so a parked car never flickers.
  const frame = Math.floor(car.wheelAngle / (Math.PI / 5)) % 2;
  car.wheelStates.forEach((wheelState, i) => {
    // A wheel at state 3 is GONE — bouncing away as debris; the axle sits
    // on the bump stop over the underbody's dark arch.
    if (wheelState === 3) return;
    const name = wheelSprite(wheelState, frame);
    const sprite = spriteByName(sprites, name);
    if (!sprite) return;
    drawWorldSprite(
      ctx,
      name,
      sprite,
      { x: car.pos.x + (CAR.wheelOffsets[i] ?? 0), y: car.pos.y },
      camera,
      "base",
    );
  });
  for (const panel of CAR.panels) {
    const rung = Math.max(0, Math.min(3, car.panels[panel] ?? 0));
    // A detachable part answers its FIX first — a loose part rattles, a
    // dangling one swings on its hinge poses, a gone one shows the bay —
    // and only an attached one draws its plain damage rung.
    const pick = DETACHABLES.has(panel)
      ? partSprite(car, panel as CarDetachable, rung)
      : { name: `car_${panel}_${rung}`, dy: 0 };
    const sprite = spriteByName(sprites, pick.name);
    if (sprite) {
      drawShellLayer(
        ctx,
        sprite,
        car.pos,
        camera,
        rearDrop + pick.dy,
        frontDrop + pick.dy,
      );
    }
  }
  // Engine on: the light CONES first (they start at the lamps and spill
  // outward, so the lamp pixels cap their roots), then the lit lamps
  // themselves over the whole stack — pitched with the shell, so the beam
  // of a nose-down wreck rakes the ground in front of it.
  if (running) {
    drawLightCones(ctx, car.pos, camera, timeMs, rearDrop, frontDrop);
    const lights = spriteByName(sprites, "car_lights");
    if (lights) {
      drawShellLayer(ctx, lights, car.pos, camera, rearDrop, frontDrop);
    }
  }
}

/**
 * The running car's thrown light: a long warm white-gold cone fanning out
 * ahead of the nose and a short red wash behind the taillights, both faded
 * out along their length with a slow flicker so they read as burning lamps
 * rather than painted decals. Pure canvas gradients — light has no pixels.
 */
function drawLightCones(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  camera: Camera,
  timeMs: number,
  rearDrop = 0,
  frontDrop = 0,
): void {
  const flicker = 0.88 + 0.12 * (Math.floor(timeMs / 90) % 2);
  billboard(ctx, at.x, at.y, camera.x, camera.y, () => {
    const sx = at.x - camera.x;
    // The lamps sit around row 12.5 of the 26-high canvas; the base anchor
    // pins row h-2 to `at.y`, so the lamp line is ~11 px above it — each
    // end riding its own axle's drop, so a nose-down wreck's beam dips.
    const lampY = at.y - camera.y - 11;
    // The HEADLIGHT cone: out of the nose, widening as it goes.
    const noseX = sx + 23;
    const noseDip = Math.round(frontDrop);
    const tailDip = Math.round(rearDrop);
    const beam = ctx.createLinearGradient(noseX, 0, noseX + 42, 0);
    beam.addColorStop(0, `rgba(255, 242, 180, ${0.38 * flicker})`);
    beam.addColorStop(0.6, `rgba(255, 232, 150, ${0.16 * flicker})`);
    beam.addColorStop(1, "rgba(255, 232, 150, 0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(noseX, lampY + noseDip - 2);
    // A pitched nose rakes the beam into the ground ahead of the car.
    ctx.lineTo(noseX + 42, lampY - 10 + noseDip * 3);
    ctx.lineTo(noseX + 42, lampY + 14 + noseDip * 3);
    ctx.lineTo(noseX, lampY + noseDip + 4);
    ctx.closePath();
    ctx.fill();
    // The TAIL glow: a short red fan behind the car, dimmer and stubbier —
    // brake lamps, not a second pair of headlights.
    const tailX = sx - 22;
    const glow = ctx.createLinearGradient(tailX, 0, tailX - 15, 0);
    glow.addColorStop(0, `rgba(255, 74, 58, ${0.32 * flicker})`);
    glow.addColorStop(1, "rgba(255, 74, 58, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(tailX, lampY + tailDip - 2);
    ctx.lineTo(tailX - 15, lampY + tailDip - 6);
    ctx.lineTo(tailX - 15, lampY + tailDip + 9);
    ctx.lineTo(tailX, lampY + tailDip + 4);
    ctx.closePath();
    ctx.fill();
  });
}

function drawShip(
  ctx: CanvasRenderingContext2D,
  ship: Extract<Vehicle, { kind: "ship" }>,
  sprites: Sprites,
  camera: Camera,
  timeMs: number,
): void {
  // The flame sits UNDER the hull so the bell overlaps its root.
  if (ship.thrust > 0) {
    const flameName = `ship_flame_${Math.floor(timeMs / 90) % 2}`;
    const flame = spriteByName(sprites, flameName);
    if (flame) {
      drawWorldSprite(
        ctx,
        flameName,
        flame,
        { x: ship.pos.x, y: ship.pos.y + 7 },
        camera,
        "base",
      );
    }
  }
  const hull = spriteByName(sprites, "starship");
  if (hull) {
    drawWorldSprite(ctx, "starship", hull, ship.pos, camera, "base");
  }
}
