// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VEHICLE ASSEMBLIES — the car and the garage ship drawn as MACHINES
// (src/game/vehicles.ts), part by part, in place of their landmarks:
//
//   CAR  = two wheels (sprite picked per wheel from its STATE — sound, flat
//          tire, bent rim — and its spin frame from the simulated roll
//          angle, so speed IS the spin) under six BODY PANELS, each picked
//          at its own damage rung (`car_<panel>_<rung>`: factory straight →
//          bumped → hammered → broken). All panels share one canvas, so the
//          stack draws at a single anchor and rides the suspension springs
//          together (a nudge visibly bobs the shell on its wheels).
//   SHIP = the starship hull, plus the ship_flame flicker under the bell
//          while `thrust` is above zero (parked in the garage it never is).
//
// The driving minigame raises `panels`/`wheelStates` per crash; this pass
// just draws whatever state says. Preview the whole damage matrix with
// `node scripts/car-viewer.mjs`.

import { CAR, type GameState, type Vehicle } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { drawWorldSprite } from "./plane.ts";
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
    if (vehicle.kind === "car") drawCar(ctx, vehicle, sprites, camera);
    else drawShip(ctx, vehicle, sprites, camera, timeMs);
  }
}

/** Which sprite a wheel wears: its state first, then the roll frame. */
function wheelSprite(wheelState: number, frame: number): string {
  if (wheelState === 1) return "car_wheel_flat"; // a flat doesn't spin
  if (wheelState === 2) return `car_wheel_bent_${frame}`;
  return `car_wheel_${frame}`;
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  car: Extract<Vehicle, { kind: "car" }>,
  sprites: Sprites,
  camera: Camera,
): void {
  // Underbody first — the arches open onto dark steel and springs, never
  // onto the floor behind the car — then wheels, then the panel stack.
  const under = spriteByName(sprites, "car_underbody");
  if (under) {
    drawWorldSprite(ctx, "car_underbody", under, car.pos, camera, "base");
  }
  // Two roll frames half a spoke apart; the angle comes from the
  // simulation, so a parked car never flickers.
  const frame = Math.floor(car.wheelAngle / (Math.PI / 5)) % 2;
  car.wheelStates.forEach((wheelState, i) => {
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
  // The shell rides the springs: every panel shares the master canvas, so
  // the whole stack draws at one anchor, sunk by the axles' mean
  // compression. (A per-axle tilt wants a rotated blit the pixel art would
  // smear under; the minigame's chassis pass owns that call.)
  const compress = (car.suspension[0] + car.suspension[1]) / 2;
  const at = { x: car.pos.x, y: car.pos.y + compress };
  for (const panel of CAR.panels) {
    const rung = Math.max(0, Math.min(3, car.panels[panel] ?? 0));
    const name = `car_${panel}_${rung}`;
    const sprite = spriteByName(sprites, name);
    if (sprite) drawWorldSprite(ctx, name, sprite, at, camera, "base");
  }
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
