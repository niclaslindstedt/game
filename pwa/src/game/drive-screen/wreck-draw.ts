// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// DRAWING A CAR THAT HAS BEEN HIT — the fold, the yaw, the flight and the
// glass.
//
// WHY IT IS ITS OWN FILE. The traffic used to be a blit: pick the damage rung's
// sprite and put it down at the vehicle's own place. Everything the collision
// now does to a vehicle (`engine/game/drive/crush.ts`) is a change to its POSE
// rather than to its picture — it is shorter at one end, it is turned, it is off
// the ground, and there is blood on the inside of its windows — and none of
// those is expressible as "which sprite". So the vehicle pass grew a transform
// stack, and a transform stack living inside the road's 900-line painter is how
// the road's painter becomes a 1200-line painter.
//
// FOUR THINGS, AND EACH IS THE SIM'S ANSWER RATHER THAN THIS FILE'S:
//
//   THE FOLD   `crushShare` — how much of each END the physics says is gone,
//              drawn by compressing that half of the sprite toward the middle.
//              A car rear-ended at speed is visibly SHORT at the back and
//              straight at the front, which is the one thing three whole-body
//              dent rungs can never say.
//   THE YAW    `DriveTraffic.angle` — a car clipped off its centre of mass is
//              turning, and it turns about its own middle.
//   THE FLIGHT `z` — a vehicle that has gone over leaves the ground.
//   THE GLASS  `gore` — the derived `<sprite>_gore` overlay
//              (`asset-tools/wreck.mjs`), laid over whichever damage rung is
//              showing, which is why it is ONE grid per vehicle rather than one
//              per rung.
//
// THE FOLD IS DRAWN IN THE SPRITE'S OWN FRAME, before the facing flip — which
// is what makes it correct for the half of the traffic that is drawn mirrored.
// `crushNose` is the nose's, the nose is on the sprite's RIGHT because every
// vehicle here is authored facing right, and the flip is a transform around the
// finished picture. Fold after mirroring and every oncoming car in the game
// crumples at the wrong end.

import { crushShare, vehicleDef, type DriveTraffic } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { seatX, seatY } from "../render/shared.ts";
import { billboard } from "../render/tilt.ts";
import type { Camera } from "../render/view.ts";
import { crashEnd, roofBar, trafficSprite, type RoofBar } from "./scenery.ts";
import type { SpriteImage } from "@ui/lib/atlas.ts";

/**
 * How far a fold may push the two halves into each other, as a share of the
 * sprite's own half-width.
 *
 * The compression is drawn as each half being squeezed toward the middle, and
 * squeezing a half to nothing leaves a car half the length it was, which reads
 * as a different (smaller) vehicle rather than as a damaged one. Two thirds is
 * the point at which it still plainly reads as the same car with its end pushed
 * in.
 */
const MAX_FOLD = 0.66;

/**
 * HOW FAST THE TWO ROLL FRAMES MAY ALTERNATE (Hz) — the run's own ceiling
 * (`render/vehicles.ts`), and it matters more out here than it does anywhere
 * else. A wheel of four px radius at sixty miles an hour turns at seventy
 * radians a second, which is a dozen bucket changes per FRAME; sampled at 60 Hz
 * that is not a fast wheel, it is a coin toss, and the traffic reads as
 * vibrating rather than driving.
 */
const WHEEL_SPIN_HZ = 14;

/**
 * …and the radius the rate is measured against (sprite px). One number for the
 * whole fleet on purpose: the discs run from two and a half px on a scooter to
 * four on a bus, and what this feeds is the STROBE threshold rather than the
 * roll itself — a wheel that alternated at a bus's rate and a scooter's would
 * be two different-looking blurs for no reason a player could ever name.
 */
const WHEEL_RADIUS_PX = 4;

/**
 * WHICH ROLL FRAME A VEHICLE'S WHEELS ARE ON.
 *
 * OFF ITS OWN POSITION, not off a clock and not off a field. A wheel's angle IS
 * the distance it has rolled divided by its radius, and the road already knows
 * exactly how far every vehicle has gone — so a stopped car holds one frame, a
 * wreck coasting in slows visibly, and two vehicles side by side at the same
 * speed turn together, all without a byte of state to keep or replicate.
 *
 * The ARC each frame covers grows with the speed until the alternation settles
 * at `WHEEL_SPIN_HZ`, which is the hero car's own trick and the reason his
 * wheels do not strobe at 174 (`drawCarAssembly`).
 */
function rollFrame(other: DriveTraffic): number {
  const spinRate = Math.abs(other.speed) / WHEEL_RADIUS_PX;
  const spinArc = Math.max(Math.PI / 5, spinRate / WHEEL_SPIN_HZ);
  const angle = Math.abs(other.pos.x) / WHEEL_RADIUS_PX;
  return Math.floor(angle / spinArc) % 2;
}

/** Draw one vehicle's body — folded, turned, lifted and bloodied as the sim
 * says. `lift` is its height off the road in screen px. */
export function drawTrafficBody(
  ctx: CanvasRenderingContext2D,
  other: DriveTraffic,
  sprites: Sprites,
  camera: Camera,
  /** The wall clock, for the one thing on a car that is not a pose: a light bar
   * flashing. Omitted (a still, an exhibit) draws it lit rather than dark. */
  timeMs = 0,
  /** SFW minigame presentation: keep the actor's current road position but
   * render its intact, upright body with no gore or collision pose. */
  clean = false,
): void {
  // ── WHICH PICTURE IT IS WEARING, AND WHAT THE OVERLAYS BELONG TO ──────────
  // THE SKIN is the body grid the overlays were derived FROM: the vehicle's own
  // art while it is merely battered, and that END's authored crash art once the
  // collision has genuinely folded one (`crashEnd`). It matters because the
  // wheels and the blood are separate pictures laid over the body — and the
  // crash art has BENT the body, so the surviving wheel has moved, the torn-off
  // one is not there at all, and the windows are somewhere else. Derived from
  // the clean grid they would spin a disc in mid air where a wheel used to be.
  //
  // THE BODY is the skin plus a dent rung, and only while the skin is the clean
  // one: the crash art IS the damage, so it never wears a rung on top.
  const has = (id: string) => spriteByName(sprites, id) !== undefined;
  const end = clean ? undefined : crashEnd(other);
  const skin = trafficSprite(other.variant, 0, end, has);
  const name = trafficSprite(other.variant, clean ? 0 : other.rung, end, has);
  const sprite = spriteByName(sprites, name);
  if (!sprite) return;
  const gore =
    !clean && other.gore > 0
      ? spriteByName(sprites, `${skin}_gore`)
      : undefined;
  // ITS WHEELS, TURNING. A derived overlay holding the discs and nothing else
  // (`asset-tools/spin.mjs`), laid over whichever damage rung is showing — so a
  // car folded in half still turns the wheel it still has, and the fold, the
  // yaw and the facing flip below carry the wheels with the body because they
  // are the same transform.
  //
  // A wreck's wheels stop because `rollFrame` reads its POSITION: a vehicle that
  // is not moving is not turning, with nothing to switch off.
  const roll = spriteByName(sprites, `${skin}_roll_${rollFrame(other)}`);
  // ── AND AN END IS FOLDED ONCE, NOT TWICE ──────────────────────────────────
  // The squeeze below is how a vehicle wearing its CLEAN art shows a crush: that
  // half of the sprite is compressed toward the middle by what the physics says
  // it lost. The crash art has that fold BAKED IN — it is the whole reason the
  // grid exists — so applying the squeeze to the end it is already drawn for
  // folds the same collision into the picture a second time, and at the top of
  // the crush ladder that is another two thirds off a half that has already been
  // shortened. The result is not a folded car; it is a small one.
  //
  // The OTHER end still folds normally, which is what keeps a car hit at both
  // ends reading as hit at both ends.
  const crushed = clean ? { nose: 0, tail: 0 } : crushShare(other);
  const fold = {
    nose: end === "front" ? 0 : crushed.nose,
    tail: end === "rear" ? 0 : crushed.tail,
  };
  billboard(ctx, other.pos.x, other.pos.y, camera.x, camera.y, () => {
    ctx.save();
    ctx.translate(
      seatX(other.pos.x, camera.x),
      seatY(other.pos.y, camera.y) - Math.round(clean ? 0 : other.z),
    );
    if (!clean && other.angle !== 0) ctx.rotate(other.angle);
    if (other.faceLeft) ctx.scale(-1, 1);
    // The sprite is drawn about its own bottom-centre, which is where every
    // other body on this road is seated (`drawSpriteFacing`) — so a turned car
    // pivots about the middle of itself rather than about a corner.
    const ox = -Math.round(sprite.width / 2);
    const oy = -Math.round(sprite.height - 2);
    drawFolded(ctx, sprite, ox, oy, fold.nose, fold.tail);
    if (roll) drawFolded(ctx, roll, ox, oy, fold.nose, fold.tail);
    if (gore) {
      ctx.globalAlpha = Math.min(1, other.gore);
      drawFolded(ctx, gore, ox, oy, fold.nose, fold.tail);
      ctx.globalAlpha = 1;
    }
    // THE BLUE LIGHTS, on the bar the art actually has (`ROOF_BARS`) rather
    // than on the top of the sprite's own box — every vehicle here is drawn on
    // the same 48x26 canvas, so the box is five px clear of a saloon's roof and
    // the flash read as two lamps floating along above the car.
    const bar = other.siren ? roofBar(vehicleDef(other.variant)) : undefined;
    if (bar) drawBeacons(ctx, bar, timeMs);
    ctx.restore();
  });
}

/**
 * THE BLUE LIGHTS — the only thing drawn on a vehicle that is not a POSE.
 *
 * Everything else in this file is the sim's answer rendered (the fold, the yaw,
 * the flight, the glass on the inside of the windows); a light bar is a fact
 * about the vehicle's JOB and it flashes on the wall clock rather than on
 * anything the collision knows. `DriveTraffic.siren` is read here and by nothing
 * in the engine, for exactly that reason: a siren does not change a collision.
 *
 * TWO LAMPS ALTERNATING, drawn ADDITIVELY over the roof line and haloed, which
 * is what makes them read as light rather than as two coloured pixels — at this
 * scale a police car is 40 px of art and the bar is three of them, so the glow
 * is most of what the eye actually catches at the edge of the frame.
 *
 * IN THE SPRITE'S OWN FRAME, before the facing flip is undone — so the pair sit
 * on the roof whichever way the car is pointed, and turn with it when something
 * spins it. The same discipline the fold above keeps, and for the same reason.
 */
function drawBeacons(
  ctx: CanvasRenderingContext2D,
  bar: RoofBar,
  timeMs: number,
): void {
  // A hard alternation rather than a fade: a real bar strobes, and a pair of
  // lamps cross-fading reads as one purple lamp.
  const left = Math.floor(timeMs / BEACON_MS) % 2 === 0;
  const roofY = -bar.liftPx;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // EACH LAMP OVER THE ONE THE ART ALREADY PAINTS: the sprite's bar is red at
  // the back and blue at the front, so the flash is the same way round and the
  // glow sits on the colour it belongs to instead of beside it.
  for (const [dx, color, lit] of [
    [bar.atPx - bar.halfPx, "#ff4a4a", left],
    [bar.atPx + bar.halfPx, "#4aa8ff", !left],
  ] as const) {
    ctx.globalAlpha = lit ? 1 : 0.16;
    ctx.fillStyle = color;
    // The lamp itself, sat ON the roof line rather than over it — a car's light
    // bar is bolted to the roof, and a lamp floating a pixel clear of it reads
    // as a bubble following the car about.
    ctx.fillRect(dx - 1, roofY - 1, 2, 2);
    // …and the halo it throws, which is the half that carries at this scale.
    // Small and faint: at the shipped zoom a car is 90 screen px, so a glow
    // wider than the lamp's own bar stops being light coming off a vehicle and
    // becomes a thing in the air beside one.
    if (lit) {
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.arc(dx, roofY, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** How long each lamp holds before the other takes over (ms). Fast enough to
 * read as a strobe, slow enough not to flicker at 60 fps. */
const BEACON_MS = 110;

/**
 * Blit a sprite in two halves, each squeezed toward the middle by its own end's
 * fold.
 *
 * WHY TWO HALVES RATHER THAN ONE SCALE. A car that has been rear-ended is short
 * at the BACK; scaling the whole sprite shortens it at both ends equally and
 * moves the wheels, which reads as the car being further away. Compressing one
 * half leaves the other half — and the axle under it — exactly where the eye
 * last saw it, so what changed is the end that was hit.
 *
 * The nose half is the sprite's RIGHT (everything on this road is authored
 * facing right); the caller has not flipped yet, so this is always true here.
 */
function drawFolded(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteImage,
  ox: number,
  oy: number,
  nose: number,
  tail: number,
): void {
  const w = sprite.width;
  const h = sprite.height;
  if (nose <= 0 && tail <= 0) {
    ctx.drawImage(sprite, ox, oy);
    return;
  }
  const half = Math.floor(w / 2);
  const tailW = Math.max(1, Math.round(half * (1 - Math.min(MAX_FOLD, tail))));
  const noseW = Math.max(
    1,
    Math.round((w - half) * (1 - Math.min(MAX_FOLD, nose))),
  );
  // Both halves stay against the vehicle's own middle, so what a fold takes is
  // taken off the OUTSIDE ends — which is where the collision took it.
  const midX = ox + half;
  ctx.drawImage(sprite, 0, 0, half, h, midX - tailW, oy, tailW, h);
  ctx.drawImage(sprite, half, 0, w - half, h, midX, oy, noseW, h);
}
