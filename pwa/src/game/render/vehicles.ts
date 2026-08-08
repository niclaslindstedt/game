// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VEHICLE ASSEMBLIES — the car and the garage ship drawn as MACHINES
// (src/game/vehicles.ts), part by part, in place of their landmarks:
//
//   CAR  = two wheels (sprite picked per wheel from its STATE — sound, flat
//          tire, bent rim, gone — and its spin frame from the simulated
//          roll angle, so speed IS the spin; the FRONT one warped by the
//          rack's own angle — see THE STEERED FRONT WHEEL) under six BODY
//          PANELS, each picked at its own damage rung (`car_<panel>_<rung>`:
//          factory straight → bumped → hammered → broken) AND its own FIX
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
  type CarPanelId,
  type GameState,
  type Vehicle,
} from "@game/core";

import { localHero } from "../local-seat.ts";
import { spriteByName, type Sprites } from "../assets.ts";
import { glowSprite } from "./caches.ts";
import { soaked } from "./hero-coat.ts";
import type { CoatLayer } from "./soak-ladder.ts";
import { drawWorldSprite } from "./plane.ts";
import { seatX, seatY } from "./shared.ts";
import { billboard } from "./tilt.ts";
import { type Camera } from "./view.ts";
import type { InView } from "./world.ts";

/**
 * HOW FAST THE TWO ROLL FRAMES MAY ALTERNATE (Hz) — the ceiling that stops a
 * wheel at 120 mph strobing into a vibration. Fourteen is fast enough to read
 * as a blur and slow enough to be a rate rather than an aliasing artefact.
 */
const WHEEL_SPIN_HZ = 14;

/** The landmark kinds the assemblies replace — drawLandmarks skips these. */
export const VEHICLE_LANDMARK_KINDS = new Set(["car", "rocket"]);

// ── THE BOARDABLE GLOW ──────────────────────────────────────────────────────
// "YOU CAN GET IN THIS" — the amber the parked car wears while the local hero
// is close enough to climb into it (`CAR.boardRadius`, the reach the engine
// revalidates the tap against, so the light is on exactly when the press
// works).
//
// It exists because the car is the ONLY tappable thing in the game that isn't
// obviously one. A merchant is a person standing at a counter, a rift seam
// hums, the rocket is a rocket; a hatchback parked in a garage full of
// furniture is furniture until somebody tells you it isn't — and a new player's
// whole first errand is on the far side of noticing.
//
// It follows the XP veil's rules exactly (render/xp-veil.ts, which is where the
// reasoning lives): CLOSED-FORM off the render clock, one BAKED `glowSprite`
// scaled at draw time rather than a gradient per frame, and faint enough to sit
// at the edge of attention — this one has an easier job than the veil, because
// it is up for the few seconds a player stands beside a car in a room with
// nothing hunting him, rather than over a fight.
const BOARD_RGB = "255, 186, 40";
/** How far the halo reaches off the body (world px) — the car is 48 long, so
 * this wraps the whole machine rather than pooling under its middle. */
const BOARD_RADIUS = 34;
/**
 * Peak alpha of the halo.
 *
 * TUNED ON THE BAY'S OWN FLOOR, which is the only place this ever appears and
 * is the worst case for it: poured cement is a LIGHT mid-grey, and an additive
 * warm glow over light grey has almost nothing left to add. The XP veil's 0.3
 * was invisible here — not subtle, invisible — because that figure was tuned
 * against GOODCO's dark blue-grey deck. Judge any change to it from a
 * screenshot of the garage, never from the number.
 */
const BOARD_ALPHA = 0.5;
/** The breath — the same slow swell the veil uses, for the same reason. */
const BOARD_BREATH_MS = 1500;
const BOARD_BREATH_DEPTH = 0.35;
/** How far past `boardRadius` the glow starts coming up, so it fades IN as the
 * hero walks over rather than switching on under his feet. */
const BOARD_FADE_PX = 40;

/**
 * How lit the boardable glow is for `car` this frame, 0 (dark) to 1.
 *
 * Zero for a car somebody is already driving: the lights are on, the body is
 * shivering and the thing is manifestly interactive — a second "you may touch
 * this" cue over the top would be noise. (Tapping a car you are IN still gets
 * you out; that gesture is discovered by having just used it.)
 */
function boardableGlow(
  state: GameState,
  car: Extract<Vehicle, { kind: "car" }>,
  timeMs: number,
): number {
  if (car.driver !== null) return 0;
  const hero = localHero(state);
  const d = Math.hypot(hero.pos.x - car.pos.x, hero.pos.y - car.pos.y);
  const near = 1 - (d - CAR.boardRadius) / BOARD_FADE_PX;
  if (near <= 0) return 0;
  const breath =
    1 -
    BOARD_BREATH_DEPTH *
      (0.5 - 0.5 * Math.cos((timeMs / BOARD_BREATH_MS) * Math.PI * 2));
  return Math.min(1, near) * breath;
}

/** The halo itself, billboarded and additive — laid down UNDER the assembly so
 * the car stands in its own light instead of behind a wash. */
function drawBoardableGlow(
  ctx: CanvasRenderingContext2D,
  car: Extract<Vehicle, { kind: "car" }>,
  camera: Camera,
  strength: number,
): void {
  const halo = glowSprite(BOARD_RGB, BOARD_RADIUS);
  if (!halo) return;
  billboard(ctx, car.pos.x, car.pos.y, camera.x, camera.y, () => {
    const x = Math.round(car.pos.x - camera.x);
    const y = Math.round(car.pos.y - camera.y);
    // Wider than tall: a car is a long low thing, and a circular glow around
    // one reads as a spotlight it happens to be parked in.
    const w = BOARD_RADIUS * 2.6;
    const h = BOARD_RADIUS * 1.6;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = BOARD_ALPHA * strength;
    ctx.drawImage(halo, x - w / 2, y - h / 2 - 8, w, h);
    ctx.restore();
    ctx.globalAlpha = 1;
  });
}

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
      const glow = boardableGlow(state, vehicle, timeMs);
      if (glow > 0) drawBoardableGlow(ctx, vehicle, camera, glow);
      drawCarAssembly(ctx, vehicle, sprites, camera, timeMs);
    } else {
      drawShip(ctx, vehicle, sprites, camera, timeMs);
    }
  }
  // THE NIGHT SHIFT'S OWN CARS (`GameState.arrivals`, src/game/arrivals.ts) —
  // the same assembly, drawn by the same function, because they ARE the same
  // machine: one `CarVehicle` each, rolling in on its springs and then standing
  // in the rank for the rest of the run.
  //
  // Two things they never get, and both are the same fact said twice — a
  // visitor's car is somebody else's. NO BOARDABLE HALO: the amber "you can get
  // in this" glow belongs to the wagon the hero drove here, and lighting up
  // three more would be the lot advertising three cars he cannot take. And the
  // ENGINE is read off the arrival's own phase rather than off a seat in the
  // party, so the lamps and the idle shiver die when it parks.
  for (const arrival of state.arrivals) {
    const car = arrival.car;
    if (!inView(car.pos.x, car.pos.y, 64)) continue;
    const engineOn = arrival.phase === "driving" || arrival.phase === "parking";
    drawCarAssembly(
      ctx,
      car,
      sprites,
      camera,
      timeMs,
      undefined,
      undefined,
      engineOn,
    );
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

// ── THE ASSEMBLY IS ONE BILLBOARD ───────────────────────────────────────────
// A WHEEL IS NOT A BODY STANDING IN THE WORLD — it is a PART OF THE CAR, and
// `CAR.wheelOffsets` are the columns of the shared 48-wide part canvas its arch
// is cut at. Those are SCREEN px along the drawn body, not world px across the
// floor, and the difference is invisible square-on: with yaw 0 the projection
// leaves x alone, so a wheel anchored at `car.pos.x + offset` landed in its arch
// by coincidence.
//
// Turn the camera and the coincidence goes. A world step east comes out as a
// step east AND south under a yaw (render/tilt.ts), while the body panels are
// one billboard drawn dead straight-on — so the front wheel slid down out of its
// arch and the rear one climbed up behind the door. At the full isometric 45° the
// pair sit the better part of a wheel off their arches, at the yaw's own angle:
// the car reads as a wreck with a spare dropped beside it.
//
// So every piece of the car is placed the way the panels always were: ONE anchor
// through the tilt, and whole-pixel SCREEN offsets inside it. Only things that
// genuinely stand on their own ground get their own world anchor — a wheel that
// came OFF (`state.wheelDebris`) is exactly that, and keeps one.

/** Where a wheel's centre column and top row sit inside the car's billboard —
 * the axle's canvas column off the body's seat, and the wheel standing on the
 * same base row the 26-high part canvas does. */
function wheelSeat(
  car: Extract<Vehicle, { kind: "car" }>,
  camera: Camera,
  axle: number,
  sprite: ImageBitmap,
): { cx: number; top: number } {
  return {
    cx: seatX(car.pos.x, camera.x) + (CAR.wheelOffsets[axle] ?? 0),
    top: seatY(car.pos.y, camera.y) - (sprite.height - 2),
  };
}

// ── THE STEERED FRONT WHEEL ─────────────────────────────────────────────────
// The rack's angle (`CarVehicle.steer`), drawn — a wheel cranked on its
// kingpin is no longer edge-on to the camera, and there is no second sprite
// for it. It is the SAME eleven pixels, re-blitted A COLUMN AT A TIME, which
// is the trick the pitched shell already uses below (`drawShellLayer`) for the
// same reason: a real rotation resamples pixel art into mush, while a
// per-column warp keeps every texel and degenerates to the plain blit at dead
// centre.
//
// Three things happen to the wheel as it comes round, and all three are the
// same fact — that it now stands ACROSS the camera's line of sight rather than
// along it:
//
//   NARROWER — the tyre is foreshortened to `cos(steer)` of its width, because
//              side-on that is all of it there is left to see;
//   SHEARED  — the half swung TOWARD the camera drops down the screen and the
//              half swung away rides up it, so the wheel leans out of the
//              picture plane instead of merely getting thin. This is the Z:
//              each column's screen offset IS its out-of-plane displacement;
//   TALLER   — and the near half is drawn a pixel taller off its own contact
//              patch, which is the only other depth cue eleven pixels have
//              room for.
//
// Only the FRONT axle gets any of it. The rear wheels of a car do not steer,
// and warping them too would read as a bent axle rather than as a turn.

/** Below this crank (rad) the wheel draws straight — a warp worth less than a
 * pixel is a column pass bought for nothing. */
const STEER_MIN = 0.05;
/**
 * How far down the screen a column slides per world px it stands toward the
 * camera.
 *
 * NOT the projection's pitch, and that is the whole tuning note: the assembly
 * is a BILLBOARD — every body on the field is anchored through the tilt and
 * then drawn dead straight-on — so a wheel sheared by the ground plane's full
 * 0.75 leans about two pixels each way across nine, and eleven pixels of tyre
 * cannot carry that. It stops reading as a wheel turned and starts reading as
 * a wheel BENT, which is a state this car really has (`car_wheel_bent_*`) and
 * must not be confused with. Held to about a pixel at full lock, it reads as
 * the turn it is. Judge any change to it from `node scripts/car-viewer.mjs
 * --steer`, never from the number.
 */
const STEER_LEAN = 0.35;
/** How much taller a column is drawn per world px it stands toward the
 * camera. Clamped to a pixel either way, for the same reason. */
const STEER_GROW = 0.3;

/** Drawn INSIDE the car's own billboard (see THE ASSEMBLY IS ONE BILLBOARD):
 * `cx` is the axle's centre column and `top` the wheel's top row, both in the
 * assembly's screen space. */
function drawSteeredWheel(
  ctx: CanvasRenderingContext2D,
  sprite: ImageBitmap | HTMLCanvasElement,
  cx: number,
  top: number,
  steer: number,
  faceLeft: boolean,
): void {
  const w = sprite.width;
  const h = sprite.height;
  // The drawn nose points the way the body faces; a left-facing car's leading
  // edge is the other end of the same eleven pixels.
  const swing = Math.sin(steer) * (faceLeft ? -1 : 1);
  const width = Math.max(1, Math.round(w * Math.abs(Math.cos(steer))));
  const left = cx - Math.round(width / 2);
  // Walked over DESTINATION columns, picking a source column for each, so a
  // squashed wheel comes out solid — mapping the source forward instead
  // drops columns and leaves gaps through the tyre.
  for (let i = 0; i < width; i++) {
    const across = (i + 0.5) / width;
    const sx = Math.min(w - 1, Math.floor(across * w));
    // How far this column now stands toward the camera (world px, +y near),
    // and therefore where it sits and how big it is.
    const depth = (across - 0.5) * w * swing;
    const dy = Math.round(depth * STEER_LEAN);
    const grow = Math.max(-1, Math.min(1, Math.round(depth * STEER_GROW)));
    // Anchored at the contact patch: the column grows upward off the ground
    // it is standing on, never through it.
    ctx.drawImage(sprite, sx, 0, 1, h, left + i, top + dy - grow, 1, h + grow);
  }
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
  sprite: ImageBitmap | HTMLCanvasElement,
  pos: { x: number; y: number },
  camera: Camera,
  rearDrop: number,
  frontDrop: number,
): void {
  billboard(ctx, pos.x, pos.y, camera.x, camera.y, () => {
    const w = sprite.width;
    const h = sprite.height;
    const left = seatX(pos.x, camera.x) - Math.round(w / 2);
    const top = seatY(pos.y, camera.y) - (h - 2);
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

/**
 * THE CAR ITSELF — the whole assembly, given nothing but a car.
 *
 * Exported (and named for what it is) because the DRIVING MINIGAME draws the
 * same wagon on a road that has no `GameState` under it at all
 * (pwa/src/game/drive-screen/render.ts). Everything above this — the boardable
 * glow, the wheel debris, the ship — needs a run around it; this does not, and
 * keeping the split here is what stops the minigame growing a second copy of
 * the panel stack, the wheel ladder and the dangle poses.
 */
export function drawCarAssembly(
  ctx: CanvasRenderingContext2D,
  car: Extract<Vehicle, { kind: "car" }>,
  sprites: Sprites,
  camera: Camera,
  timeMs: number,
  /**
   * HOW BLOODY EACH PANEL IS, as the film to lay over it
   * (`drive-screen/car-soak.ts`). Omitted — every caller but the road — draws
   * the wagon exactly as it always was: a garage bay has nothing to be bloody
   * about, and a clean panel costs no composite even when a record is passed.
   */
  coat?: Partial<Record<CarPanelId, readonly CoatLayer[]>>,
  /** …and what the TYRES are wearing, which is its own record because a wheel
   * is not a panel: it picks blood up by rolling through it rather than by
   * being hit, and it loses it again as the tread wears clean. */
  wheels?: readonly CoatLayer[],
  /**
   * IS THE ENGINE ON? Defaults to "somebody is at the wheel", which is the
   * answer for every car a hero can climb into — and the wrong one for a
   * VISITOR'S car (`GameState.arrivals`), which has a driver in it that is not
   * a seat in the party. Passed rather than derived from `speed`, because a car
   * that has pulled up and not yet opened its door is still running.
   */
  engineOn?: boolean,
): void {
  // The shell's attitude: each corner sinks by its own spring AND whatever
  // its wheel no longer holds up, and the whole body pitches between the
  // two (a missing front wheel reads nose-down). A RUNNING engine shivers
  // the shell a pixel on the render clock — presentation only.
  //
  // SLOWLY. The shiver opened at 45 ms a toggle, which is eleven times a
  // second, and at that rate a one-pixel bob has no lope to it at all — it is
  // just noise, and on the road (where the car is the thing the eye is locked
  // to for a whole minute) it read as the picture being broken rather than as
  // an engine turning over. A quarter of the rate is a lump, which is what an
  // old estate idling actually looks like from ten feet away.
  const running = engineOn ?? car.driver !== null;
  const shiver = running ? (Math.floor(timeMs / 180) % 2 === 0 ? 0 : -1) : 0;
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
  //
  // AND THE ALTERNATION IS RATE-CAPPED, which matters at exactly one place in
  // the game and matters a lot there. A spoke every π/5 is a readable roll at
  // the walking pace a car does inside a run; on the ROAD the wheel turns at
  // 125 rad/s, which is two hundred bucket changes a second — several per
  // FRAME. Sampled at 60 Hz that is not a fast wheel, it is a coin toss: the
  // two frames strobe at random and the wheels read as VIBRATING rather than
  // turning, which is the one thing on a car doing 120 that must not look
  // broken. So the arc a bucket covers grows with the speed until the
  // alternation settles at `WHEEL_SPIN_HZ` — a fast, legible blur — while a
  // parked or pottering car keeps the honest spoke-by-spoke roll it always had,
  // and both are still driven by the SIMULATED angle rather than a clock.
  const spinRate = Math.abs(car.speed) / CAR.wheelRadius;
  const spinArc = Math.max(Math.PI / 5, spinRate / WHEEL_SPIN_HZ);
  const frame = Math.floor(car.wheelAngle / spinArc) % 2;
  // Both axles inside the BODY's billboard — an axle is a column of the part
  // canvas, not a spot on the floor (see THE ASSEMBLY IS ONE BILLBOARD).
  billboard(ctx, car.pos.x, car.pos.y, camera.x, camera.y, () => {
    car.wheelStates.forEach((wheelState, i) => {
      // A wheel at state 3 is GONE — bouncing away as debris; the axle sits
      // on the bump stop over the underbody's dark arch.
      if (wheelState === 3) return;
      const sprite = spriteByName(sprites, wheelSprite(wheelState, frame));
      if (!sprite) return;
      const { cx, top } = wheelSeat(car, camera, i, sprite);
      // A TYRE THAT HAS BEEN THROUGH SOMEBODY. The wheels are the one part of
      // the car that is in it by definition, so they take the film too — and
      // they are the part the player watches, because they are the part that is
      // moving. Masked to the wheel's own art like every other panel, so a flat
      // tyre and a bent rim wear it correctly for free.
      const wet =
        wheels && wheels.length > 0
          ? (soaked(`car:wheel${i}`, sprites, wheels, sprite, (g) =>
              g.drawImage(sprite, 0, 0),
            ) ?? sprite)
          : sprite;
      // The FRONT axle (index 1) is the one on the rack, and it is warped only
      // once the crank is worth a pixel; everything else is a plain blit.
      if (i === 1 && Math.abs(car.steer) > STEER_MIN) {
        drawSteeredWheel(ctx, wet, cx, top, car.steer, car.faceLeft);
      } else {
        ctx.drawImage(wet, cx - Math.round(wet.width / 2), top);
      }
    });
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
      // THE BLOOD THE PANEL HAS PICKED UP, masked to the panel's own art and
      // multiplied into it — the hero's coat, on a car (`soaked`, and
      // `drive-screen/car-soak.ts` for what fills the record). One film covers
      // all seven panels at every damage rung because each one trims it to its
      // own silhouette, so a bent bumper's blood follows the bend for free. A
      // clean panel skips the composite entirely and is the plain blit it
      // always was.
      const film = coat?.[panel];
      const layer =
        film && film.length > 0
          ? (soaked(`car:${panel}`, sprites, film, sprite, (g) =>
              g.drawImage(sprite, 0, 0),
            ) ?? sprite)
          : sprite;
      drawShellLayer(
        ctx,
        layer,
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
 *
 * THE LAMPS ARE BOLTED TO THE BODY, so the cones are laid out in the car's own
 * screen space off `sx` — whole pixels along the drawn body, like the wheel
 * arches — and `CarVehicle.heading` is deliberately nowhere in here. The picture
 * never turns, so a cone that followed the steered heading would swing across a
 * car that had not moved, which is a swivelling cornering lamp rather than a
 * headlight. The night pass's beam obeys the same rule and for the same reason
 * — render/night.ts, HEADLIGHT.
 *
 * `faceLeft` is the ONE thing that mirrors, and it is not the heading: it is
 * which way the ART is drawn. Oncoming traffic on the drive's road wears the
 * same 48x26 side profile flipped (`DriveTraffic.faceLeft`), so its lamps are at
 * the other end of the same body — and a beam that did not flip with them lit
 * the road out of the boot.
 *
 * EXPORTED because the drive's traffic is lit by this and nothing else. Every
 * car in this game throws the same light, which is the rule the garage and the
 * minigame already share (docs/rendering.md); a second cone written for the
 * traffic would be a second thing to keep in step with it.
 */
export function drawLightCones(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  camera: Camera,
  timeMs: number,
  rearDrop = 0,
  frontDrop = 0,
  faceLeft = false,
  /** Lamps the road has already taken out — the END of the body, not the side
   * of the screen (`DriveTraffic.noseOut`). A car with a dead nose still shows
   * its tail lights, which is exactly what makes a rear-ended one read. */
  noseOut = false,
  tailOut = false,
  /**
   * HOW FAR THE BODY HAS TURNED (radians) — so the beams turn with it.
   *
   * They used to be drawn square to the road whatever the car was doing, which
   * was invisible while nothing on this road could turn. A clip now spins a car
   * out and a hard one puts it on its roof (`drive/crush.ts`), and a spun car
   * whose lights carried on pointing down the carriageway read as the beams
   * having come off it. Same angle and the same pivot the body uses
   * (`drive-screen/wreck-draw.ts`), so the two cannot disagree.
   */
  yaw = 0,
): void {
  const flicker = 0.88 + 0.12 * (Math.floor(timeMs / 90) % 2);
  const face = faceLeft ? -1 : 1;
  billboard(ctx, at.x, at.y, camera.x, camera.y, () => {
    const sx = at.x - camera.x;
    // The lamps sit around row 12.5 of the 26-high canvas; the base anchor
    // pins row h-2 to `at.y`, so the lamp line is ~11 px above it — each
    // end riding its own axle's drop, so a nose-down wreck's beam dips.
    const lampY = at.y - camera.y - 11;
    // TURNED ABOUT THE BODY'S OWN SEAT, which is the pivot `drawTrafficBody`
    // turns the sprite about — the bottom-centre of the car rather than the
    // lamp line, or the beams would swing around a point a foot above the
    // bonnet and part company with the car at any real angle.
    if (yaw !== 0) {
      ctx.save();
      ctx.translate(sx, at.y - camera.y);
      ctx.rotate(yaw);
      ctx.translate(-sx, -(at.y - camera.y));
    }
    // The HEADLIGHT cone: out of the nose, widening as it goes.
    const noseX = sx + 23 * face;
    const noseDip = Math.round(frontDrop);
    const tailDip = Math.round(rearDrop);
    if (!noseOut) {
      const beam = ctx.createLinearGradient(noseX, 0, noseX + 42 * face, 0);
      beam.addColorStop(0, `rgba(255, 242, 180, ${0.38 * flicker})`);
      beam.addColorStop(0.6, `rgba(255, 232, 150, ${0.16 * flicker})`);
      beam.addColorStop(1, "rgba(255, 232, 150, 0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(noseX, lampY + noseDip - 2);
      // A pitched nose rakes the beam into the ground ahead of the car.
      ctx.lineTo(noseX + 42 * face, lampY - 10 + noseDip * 3);
      ctx.lineTo(noseX + 42 * face, lampY + 14 + noseDip * 3);
      ctx.lineTo(noseX, lampY + noseDip + 4);
      ctx.closePath();
      ctx.fill();
    }
    if (tailOut) return;
    // The TAIL glow: a short red fan behind the car, dimmer and stubbier —
    // brake lamps, not a second pair of headlights.
    const tailX = sx - 22 * face;
    const glow = ctx.createLinearGradient(tailX, 0, tailX - 15 * face, 0);
    glow.addColorStop(0, `rgba(255, 74, 58, ${0.32 * flicker})`);
    glow.addColorStop(1, "rgba(255, 74, 58, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(tailX, lampY + tailDip - 2);
    ctx.lineTo(tailX - 15 * face, lampY + tailDip - 6);
    ctx.lineTo(tailX - 15 * face, lampY + tailDip + 9);
    ctx.lineTo(tailX, lampY + tailDip + 4);
    ctx.closePath();
    ctx.fill();
    if (yaw !== 0) ctx.restore();
  });
}

function drawShip(
  ctx: CanvasRenderingContext2D,
  ship: Extract<Vehicle, { kind: "ship" }>,
  sprites: Sprites,
  camera: Camera,
  timeMs: number,
): void {
  // The flame sits UNDER the hull so the bell overlaps its root — and it is
  // part of the SHIP, so those 7 px are screen px down from the hull's own
  // seat, inside the hull's billboard. Anchored at `pos.y + 7` in the world
  // instead they came out down AND east once the camera took a yaw, and the
  // exhaust drifted out from under the bell (see THE ASSEMBLY IS ONE
  // BILLBOARD).
  if (ship.thrust > 0) {
    const flame = spriteByName(
      sprites,
      `ship_flame_${Math.floor(timeMs / 90) % 2}`,
    );
    if (flame) {
      billboard(ctx, ship.pos.x, ship.pos.y, camera.x, camera.y, () =>
        ctx.drawImage(
          flame,
          seatX(ship.pos.x, camera.x) - Math.round(flame.width / 2),
          seatY(ship.pos.y, camera.y) + 7 - (flame.height - 2),
        ),
      );
    }
  }
  const hull = spriteByName(sprites, "starship");
  if (hull) {
    drawWorldSprite(ctx, "starship", hull, ship.pos, camera, "base");
  }
}
