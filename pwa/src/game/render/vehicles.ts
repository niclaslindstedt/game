// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VEHICLE ASSEMBLIES — the car and the garage ship drawn as MACHINES
// (engine/game/vehicles.ts), part by part, in place of their landmarks:
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
  carIsWayOut,
  PLAYER,
  runLevelDef,
  type CarDetachable,
  type CarPanelId,
  type GameState,
  type Vehicle,
} from "@game/core";

import { carriedCarCoat } from "../car-condition.ts";
import { localHero } from "../local-seat.ts";
import { spriteByName, type Sprites } from "../assets.ts";
import { soaked } from "./hero-coat.ts";
import { nightSurvival } from "./night.ts";
import type { CoatLayer } from "./soak-ladder.ts";
import { drawLightCones } from "./vehicle-lights.ts";
import { drawWorldSprite } from "./plane.ts";
import { seatX, seatY } from "./shared.ts";
import { billboard } from "./tilt.ts";
import { type Camera } from "./view.ts";
import type { InView } from "./world.ts";
import type { SpriteImage } from "@ui/lib/atlas.ts";

/**
 * HOW FAST THE TWO ROLL FRAMES MAY ALTERNATE (Hz) — the ceiling that stops a
 * wheel at 174 mph strobing into a vibration. Fourteen is fast enough to read
 * as a blur and slow enough to be a rate rather than an aliasing artefact.
 */
const WHEEL_SPIN_HZ = 14;

/** The landmark kinds the assemblies replace — drawLandmarks skips these. */
export const VEHICLE_LANDMARK_KINDS = new Set(["car", "rocket"]);

// ── THE BOARDABLE ARROW ─────────────────────────────────────────────────────
// "YOU CAN GET IN THIS" — a gold arrow bobbing over the parked car while the
// local hero is close enough to climb into it (`CAR.boardRadius`, the reach the
// engine revalidates the tap against, so the mark is up exactly when the press
// works).
//
// It exists because the car is the ONLY tappable thing in the game that isn't
// obviously one. A merchant is a person standing at a counter, a rift seam
// hums, the rocket is a rocket; a hatchback parked in a garage full of
// furniture is furniture until somebody tells you it isn't — and a new player's
// whole first errand is on the far side of noticing.
//
// IT IS A MARK, NOT A LIGHT, and that is a rule rather than a taste. The game
// already lights this lot with real lamps, so one more warm pool on the floor
// reads as a fitting somebody left on — it says SOMETHING IS LIT HERE, when the
// only sentence worth saying is THIS ONE, and a pool has no way to point. The
// errand givers wear a bobbing `!` (render/quests.ts) for exactly this job, and
// this is the same idiom aimed at a machine.
/** The mark itself — a broad gold arrow aimed down at the roof. */
const BOARD_ARROW = "board_arrow";
/** How far past `boardRadius` the arrow starts coming up, so it fades IN as the
 * hero walks over rather than switching on over his head. */
const BOARD_FADE_PX = 40;
/** Clear air between the arrow's point and the car's roof (px), before the
 * bob — the shell's part canvas is 26 high off the wheels' own base row. */
const BOARD_ARROW_GAP = 24;
/** The bob: whole pixels either way, and the period it takes to travel them.
 * The same idiom the quest marks and the merchant's coin use, a little slower
 * and a little further, because this one hangs over a car rather than a head
 * and has the room. */
const BOARD_BOB_PX = 2;
const BOARD_BOB_MS = 900;

/**
 * How present the boardable arrow is for `car` this frame, 0 (gone) to 1.
 *
 * ZERO FOR A CAR SOMEBODY IS ALREADY DRIVING — the arrow comes off the moment
 * the hero gets in. The lights are on, the body is shivering and the thing is
 * manifestly interactive by then; a mark still pointing at it would be telling
 * the player to board a car he is sitting in. (Tapping a car you are IN still
 * gets you out; that gesture is discovered by having just used it.)
 *
 * AND ZERO FOR A CAR THAT IS NOT A WAY OUT YET (`carIsWayOut`), which is the
 * half GOODCO's staff lot needs. The wagon he parked there is the same object
 * the garage's is, so without the ask it wore the same mark — a gold arrow
 * bobbing over the roof from the first frame of the mission, pointing at the
 * one thing on the map the player must NOT get back into, on a venue whose
 * opening beat is walking away from it and into the building. It is the same
 * mark and the same rule; what changed is that the rule now asks the LEVEL
 * whether the door is open, and on that lot it opens when PAYLOAD-1 goes down.
 */
function boardablePrompt(
  state: GameState,
  car: Extract<Vehicle, { kind: "car" }>,
): number {
  if (car.driver !== null) return 0;
  if (!carIsWayOut(state)) return 0;
  const hero = localHero(state);
  const d = Math.hypot(hero.pos.x - car.pos.x, hero.pos.y - car.pos.y);
  const near = 1 - (d - CAR.boardRadius) / BOARD_FADE_PX;
  if (near <= 0) return 0;
  return Math.min(1, near);
}

/**
 * The arrow itself — billboarded over the roof, drawn OVER the assembly.
 *
 * The bob rides the SIM clock rather than the render clock, which is the rule
 * every other floating mark here obeys (render/quests.ts): a page frozen behind
 * a modal whose decorations are still moving reads as not actually paused.
 */
function drawBoardableArrow(
  ctx: CanvasRenderingContext2D,
  car: Extract<Vehicle, { kind: "car" }>,
  sprites: Sprites,
  camera: Camera,
  simMs: number,
  strength: number,
): void {
  const glyph = spriteByName(sprites, BOARD_ARROW);
  if (!glyph) return;
  billboard(ctx, car.pos.x, car.pos.y, camera.x, camera.y, () => {
    const bob = Math.round(
      Math.sin((simMs / BOARD_BOB_MS) * Math.PI * 2) * BOARD_BOB_PX,
    );
    ctx.save();
    ctx.globalAlpha = strength;
    ctx.drawImage(
      glyph,
      seatX(car.pos.x, camera.x) - Math.round(glyph.width / 2),
      seatY(car.pos.y, camera.y) - BOARD_ARROW_GAP - glyph.height + bob,
    );
    ctx.restore();
  });
}

// ── WHERE A BEAM IS WORTH THROWING ──────────────────────────────────────────
// A HEADLIGHT INSIDE A LIT ROOM IS NOT LIGHT, IT IS A DECAL — and the garage
// bay is the room that proves it. Climbing into the wagon at home used to lay a
// long white-gold wedge across cement the strip lights are already burning
// over, and what a floor that bright does with a beam is nothing: the cone has
// no darkness to cut, so it reads as a painted highlight sitting ON the car
// rather than as light coming OFF it — which is the one thing it must not read
// as, because a mark that says LOOK AT THIS is exactly what the boardable arrow
// above already says, and it says it BEFORE the hero gets in rather than after.
//
// So the beam is asked WHERE IT IS STANDING. A lit zone is a room whose own
// lights are on (`LevelDef.litZones`, the same rects the night pass cuts out as
// shapes), so a car inside one throws nothing and a car outside one throws
// exactly what it always did — which means the hub's wagon is dark in the bay
// and has its beams back the moment it rolls out onto the driveway, with
// nothing anywhere naming the garage.
function inLitRoom(state: GameState, pos: { x: number; y: number }): boolean {
  for (const zone of runLevelDef(state).litZones ?? []) {
    const { x, y, width, height } = zone.rect;
    if (pos.x >= x && pos.x <= x + width && pos.y >= y && pos.y <= y + height) {
      return true;
    }
  }
  return false;
}

/**
 * WHICH SIDE OF THE HERO A MACHINE IS DRAWN ON — the one depth sort the field
 * has, and the only one it needs.
 *
 * The world is a painter's stack (floor → furniture → loot → horde → hero, see
 * docs/rendering.md), so everything with a body used to be drawn over the
 * machines whatever the geometry said — and the rocket standing on the garage's
 * back lawn is where that reads as broken, because it is four times a man's
 * height. Walking round the far side of it, the hero was painted up the hull
 * like a decal.
 *
 * So the vehicle pass runs TWICE and each machine picks its side by its own base
 * against the local hero's feet: a machine whose base is FURTHER DOWN the screen
 * is nearer the eye, so it is drawn over him; one further up is behind him and
 * stays under. It is the LOCAL hero the sort is against, because he is the body
 * the player is watching — a joiner walking behind the same hull is one frame's
 * worth of wrong ordering on somebody else's screen, and a full y-sort of every
 * actor against every machine is a bill this field does not otherwise pay.
 *
 * HIS BOOTS, NOT HIS POSITION (`PLAYER.footLift`). A machine is anchored at the
 * ground its wheels stand on and the hero is anchored at his midriff, so
 * comparing the two raw puts the crossover a body-length up the screen from
 * where the pictures actually cross — and with the parked blockers lifted so he
 * can stand right against a wagon (`CAR.footprint.lift`), that is exactly where
 * he now stands: in front of the car by the picture and behind it by the sort.
 */
export type VehicleLayer = "under" | "over";

function onLayer(
  pos: { y: number },
  heroFeetY: number,
  layer: VehicleLayer,
): boolean {
  return (pos.y > heroFeetY ? "over" : "under") === layer;
}

export function drawVehicles(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
  layer: VehicleLayer,
): void {
  const heroY = localHero(state).pos.y + PLAYER.footLift;
  // What the night wash will take back off a beam painted here (see
  // `drawLightCones`' `nightBoost`). One call per frame rather than one per
  // machine: every lamp on the lot is under the same sky.
  const boost = 1 / nightSurvival(state);
  for (const vehicle of state.vehicles) {
    if (!inView(vehicle.pos.x, vehicle.pos.y, 64)) continue;
    if (!onLayer(vehicle.pos, heroY, layer)) continue;
    if (vehicle.kind === "car") {
      // …WEARING WHAT THE ROAD PUT ON IT. The film is the app's own carry
      // (`car-condition.ts`) rather than anything on the state, because the
      // engine has never known a car can get dirty — and it is the SAME record
      // the road hands this same function, off the same ladder, so the wagon
      // standing in a car park is drawn exactly as filthy as it was a second
      // earlier at 120 mph. A clean car costs no composite (`carCoat` returns
      // an empty record), which is every campaign that has not driven anybody
      // down and every level with no road behind it.
      const coat = carriedCarCoat();
      drawCarAssembly(
        ctx,
        vehicle,
        sprites,
        camera,
        timeMs,
        coat.panels,
        coat.wheels,
        undefined,
        !inLitRoom(state, vehicle.pos),
        boost,
      );
      // …and the mark OVER it. A pointer drawn under the thing it points at is
      // a pointer the thing can hide.
      const prompt = boardablePrompt(state, vehicle);
      if (prompt > 0) {
        drawBoardableArrow(
          ctx,
          vehicle,
          sprites,
          camera,
          state.stats.timeMs,
          prompt,
        );
      }
    } else {
      drawShip(ctx, vehicle, sprites, camera, timeMs);
    }
  }
  // THE NIGHT SHIFT'S OWN CARS (`GameState.arrivals`, engine/game/arrivals.ts) —
  // the same assembly, drawn by the same function, because they ARE the same
  // machine: one `CarVehicle` each, rolling in on its springs and then standing
  // in the rank for the rest of the run.
  //
  // Two things they never get, and both are the same fact said twice — a
  // visitor's car is somebody else's. NO BOARDABLE ARROW: the gold "you can get
  // in this" mark belongs to the wagon the hero drove here, and three more
  // bobbing over the rank would be the lot pointing at three cars he cannot
  // take. And the ENGINE is read off the arrival's own phase rather than off a
  // seat in the party, so the lamps and the idle shiver die when it parks.
  for (const arrival of state.arrivals) {
    const car = arrival.car;
    if (!inView(car.pos.x, car.pos.y, 64)) continue;
    if (!onLayer(car.pos, heroY, layer)) continue;
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
      !inLitRoom(state, car.pos),
      boost,
    );
  }
  // Wheels that came off, mid-bounce or at rest: drawn lifted by their own
  // height, spinning from their own run-out speed (see WheelDebris). Floor
  // junk, so they stay under the actors whatever the sort says.
  if (layer === "over") return;
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

/**
 * Which sprite a wheel wears: its state first, then the roll frame.
 *
 * EXPORTED FOR THE ROAD. The drive throws wheels too — off the hero's own axles
 * and, now, off every car whose end has been stove in (`shedEndWheel`) — and it
 * used to draw all of them as one fixed picture, so a wheel spun down the
 * carriageway without ever turning. One function rather than two is the only way
 * the two lists stay the same wheel.
 */
export function wheelSprite(wheelState: number, frame: number): string {
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
  sprite: SpriteImage,
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
  sprite: SpriteImage,
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
 * …AND THE FINER BANDS A FOLDED ONE TAKES.
 *
 * A pitch is a smooth ramp and eight px of source per step is invisible; a FOLD
 * is a horizontal squeeze, and at eight px a step the seam between two bands
 * moving different distances is a visible tear down the wing. Four is where it
 * stops reading as a seam, and the cost only lands on a car that has actually
 * been bent — an undamaged wagon never takes this path at all.
 */
const FOLD_BAND = 4;

/**
 * HOW FAR AN END HAS FOLDED IN AT EACH PANEL RUNG, as a share of that end's
 * overhang.
 *
 * A TABLE RATHER THAN A RAMP, because the AUTHORED art is not linear either.
 * The top rung of a panel (`car_bumper_3` and friends) already draws a bent,
 * shortened nose — look at `node scripts/car-viewer.mjs`, the last two states —
 * so a fold that grew straight to its maximum there would be folding the same
 * damage into the picture twice, which is the mistake the traffic's crash art
 * made until it was caught. The steps are biggest where the art says LEAST: the
 * middle rungs, which are dents on a silhouette that has not moved, and which
 * is where a player spends most of a leg.
 *
 * The hero's wagon is also ONE picture he looks at for a whole minute, so it
 * cannot take the traffic's treatment: a car whose nose is gone reads as a
 * different, smaller car. A fifth is the point at which the bonnet is plainly
 * SHORTER — the wing sits in where it did not, the headlamp has moved back
 * toward the arch — while the silhouette is still unmistakably his.
 */
const SHELL_FOLD = [0, 0.1, 0.19, 0.23] as const;

/**
 * HOW BENT THE SHELL IS AT EACH END, from the panels that took it.
 *
 * READ OFF THE PANEL LADDER RATHER THAN OFF `wear`, and the difference is the
 * whole value of it. `wear` is one number for the whole car, so driving it up by
 * sideswiping a crowd would fold the nose of a car that has never hit anything
 * with its nose. The panel rungs are already a RECORD OF HOW YOU DROVE
 * (`panelAt`, engine/game/drive/impact.ts stamps the panel the contact actually
 * landed on), so a driver who centres everything folds his bonnet and one who
 * clips down the flanks does not — which is the same promise the panel damage
 * has always made, finally kept in the silhouette instead of only in the paint.
 */
function shellFold(car: Extract<Vehicle, { kind: "car" }>): {
  nose: number;
  tail: number;
} {
  const at = (id: CarPanelId) =>
    SHELL_FOLD[Math.max(0, Math.min(3, car.panels[id] ?? 0))] ?? 0;
  return {
    nose: Math.max(at("bumper"), at("hood")),
    tail: at("backside"),
  };
}

/**
 * Blit one shell layer with the body's PITCH: each 8px column band lands at
 * its own integer offset, interpolated (and extrapolated past the axles for
 * the overhangs) between the rear and front drops. A real rotation would
 * resample the pixel art into mush; a staircase shear keeps every texel —
 * and with equal drops it degenerates to the plain one-anchor blit.
 */
function drawShellLayer(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteImage,
  pos: { x: number; y: number },
  camera: Camera,
  rearDrop: number,
  frontDrop: number,
  /**
   * HOW FAR EACH OVERHANG HAS FOLDED IN, 0 → 1 of its own length.
   *
   * The second thing this function does to the shell, and it is the same KIND
   * of thing as the pitch: a per-band transform of one picture, applied to every
   * layer of the assembly at once. That is the whole reason it lives here rather
   * than in new art — the panels, the underbody, the dangling bumper and the
   * BLOOD FILM already masked to each panel all warp together, because they are
   * all blitted through this.
   *
   * Omitted is an undamaged car, which takes the plain path it always did.
   */
  fold?: { nose: number; tail: number },
): void {
  billboard(ctx, pos.x, pos.y, camera.x, camera.y, () => {
    const w = sprite.width;
    const h = sprite.height;
    const left = seatX(pos.x, camera.x) - Math.round(w / 2);
    const top = seatY(pos.y, camera.y) - (h - 2);
    const bent = fold !== undefined && (fold.nose > 0.01 || fold.tail > 0.01);
    if (!bent && Math.round(rearDrop) === Math.round(frontDrop)) {
      ctx.drawImage(sprite, left, top + Math.round(rearDrop));
      return;
    }
    const rearX = w / 2 + (CAR.wheelOffsets[0] ?? 0);
    const frontX = w / 2 + (CAR.wheelOffsets[1] ?? 0);
    const step = bent ? FOLD_BAND : TILT_BAND;
    for (let sx = 0; sx < w; sx += step) {
      const band = Math.min(step, w - sx);
      const mid = sx + band / 2;
      const t = (mid - rearX) / (frontX - rearX);
      const dy = Math.round(rearDrop + (frontDrop - rearDrop) * t);
      // ── AND THE FOLD ────────────────────────────────────────────────────
      // Only OUTBOARD OF AN AXLE, which is what makes this the same rule the
      // traffic's crash art is drawn to: what crumples is the overhang, and
      // everything between the wheels keeps its place. It falls out for free
      // that the roof and the doors never move — they do not reach past either
      // axle — so a folded bonnet does not drag the cabin forward with it.
      let dx = 0;
      let dw = band;
      if (bent && fold) {
        const k = mid > frontX ? fold.nose : mid < rearX ? fold.tail : 0;
        if (k > 0) {
          const anchor = mid > frontX ? frontX : rearX;
          dx = Math.round(anchor + (sx - anchor) * (1 - k) - sx);
          dw = Math.max(1, Math.round(band * (1 - k)));
        }
      }
      ctx.drawImage(sprite, sx, 0, band, h, left + sx + dx, top + dy, dw, h);
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
  /**
   * DOES ITS BEAM REACH ANYTHING? False where the ground under the car is
   * already lit — a room with its own lights on — and the lamps then burn
   * without throwing a cone (see WHERE A BEAM IS WORTH THROWING). Defaults to
   * true, which is the road, the drive's traffic and every venue with a dark
   * floor to cut.
   */
  throwsLight = true,
  /** …and how far the beams have to be wound up to survive the night wash laid
   * over this frame — see `drawLightCones`' own `nightBoost`. 1 is the road,
   * which has no wash over it. */
  nightBoost = 1,
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
  // …AND HOW BENT IT IS. Every layer of the assembly is blitted through
  // `drawShellLayer`, so handing it the fold once warps the whole wagon —
  // panels, underbody, dangling parts and the blood already masked to each of
  // them — rather than needing a bashed picture of each.
  const fold = shellFold(car);
  // Underbody first — the arches open onto dark steel and springs, never
  // onto the floor behind the car — then wheels, then the panel stack. The
  // underbody is shell too, so it pitches with the body.
  const under = spriteByName(sprites, "car_underbody");
  if (under) {
    drawShellLayer(ctx, under, car.pos, camera, rearDrop, frontDrop, fold);
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
    car.wheelStates.forEach((actualWheelState, i) => {
      const wheelState = actualWheelState;
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
        fold,
      );
    }
  }
  // Engine on: the light CONES first (they start at the lamps and spill
  // outward, so the lamp pixels cap their roots), then the lit lamps
  // themselves over the whole stack — pitched with the shell, so the beam
  // of a nose-down wreck rakes the ground in front of it.
  //
  // THE LAMPS BURN EITHER WAY, and only the thrown cone is `throwsLight`'s to
  // withhold: what says an engine is turning over is the lit bulb, the shiver
  // and the rumble, and a car standing in a lit room with its lights visibly
  // OFF would read as parked with somebody sitting in it.
  if (running) {
    if (throwsLight) {
      drawLightCones(
        ctx,
        car.pos,
        camera,
        timeMs,
        rearDrop,
        frontDrop,
        false,
        false,
        false,
        0,
        undefined,
        false,
        nightBoost,
      );
    }
    const lights = spriteByName(sprites, "car_lights");
    if (lights) {
      drawShellLayer(ctx, lights, car.pos, camera, rearDrop, frontDrop, fold);
    }
  }
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
  // The venue picks the hull (`ShipVehicle.sprite`) — the hub's is the one he
  // built in the garage and it fills the frame; Mars's is the same ship across
  // a landing site.
  const hull = spriteByName(sprites, ship.sprite);
  if (hull) {
    drawWorldSprite(ctx, ship.sprite, hull, ship.pos, camera, "base");
  }
}
