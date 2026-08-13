// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A VEHICLE'S OWN LAMPS — the cones a running machine throws, and the one pair
// every car in this game has. The assembly draws them with its panels
// (render/vehicles.ts) and the drive's traffic is lit by nothing else, which is
// the rule the garage and the minigame share (docs/rendering.md): a second cone
// written for the road would be a second thing to keep in step.

import { billboard } from "./tilt.ts";
import { type Camera } from "./view.ts";

/**
 * THE BODY A SET OF LAMPS IS BOLTED TO — how far it reaches from its own centre,
 * and how high off the road its lamps burn. Two numbers, in sprite px, and they
 * are all the cones need.
 *
 * NOT THE SPRITE'S OWN SIZE, and that is the trap this type exists to close:
 * every vehicle on the drive's road is authored on the SAME 48x26 canvas, with a
 * bicycle drawn small in the middle of it and a bus filling it. The image says
 * nothing about the machine, so cones derived from it come out identical for a
 * bus and a pushbike — a delivery moped towing a saloon's searchlight.
 */
export type LightBody = { halfPx: number; liftPx: number };

/** The default body: the hero's own wagon, 48 px long with its lamps on row 12
 * or so of a 26-high one. Every ratio below is calibrated against it, so this
 * body comes out at the numbers the cones are hand-placed at. */
const CAR_LIGHT_BODY: LightBody = { halfPx: 24, liftPx: 11 };

/**
 * HOW FAR A BEAM MAY BE WOUND UP TO CARRY THROUGH THE NIGHT WASH (a multiplier
 * on its authored alpha).
 *
 * The cone is painted with the assembly, and nightfall goes down as one sheet
 * over the finished picture (render.ts, `drawNight`) — so on a venue under a sky
 * barely a quarter of the beam survives to the eye, and the hub's headlights
 * read as a smudge on the pavement while the minigame's, on a road with no wash
 * over it, read as headlights. The caller hands in `1 / nightSurvival(state)`
 * and this is the ceiling on it: full compensation is about 3.6x, which turns
 * the near half of the cone into opaque paint and lights nothing, because there
 * is nothing left to see through it.
 */
const MAX_NIGHT_BOOST = 2.4;

/**
 * The running car's thrown light: a long warm white-gold cone fanning out ahead
 * of the nose and a short red wash behind the taillights, both faded out along
 * their length with a slow flicker so they read as burning lamps rather than
 * painted decals. Pure canvas gradients — light has no pixels.
 *
 * THE LAMPS ARE BOLTED TO THE BODY, so the cones are laid out in the car's own
 * screen space off `sx` — whole pixels along the drawn body, like the wheel
 * arches — and `CarVehicle.heading` is deliberately nowhere in here. The picture
 * never turns, so a cone that followed the steered heading would swing across a
 * car that had not moved, which is a swivelling cornering lamp rather than a
 * headlight.
 *
 * `faceLeft` is the ONE thing that mirrors, and it is not the heading: it is
 * which way the ART is drawn. Oncoming traffic on the drive's road wears the
 * same 48x26 side profile flipped (`DriveTraffic.faceLeft`), so its lamps are at
 * the other end of the same body — and a beam that did not flip with them lights
 * the road out of the boot.
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
   * A clip spins a car out and a hard one puts it on its roof
   * (`drive/crush.ts`), and a spun car whose lights carried on pointing down the
   * carriageway reads as the beams having come off it. Same angle and the same
   * pivot the body uses (`drive-screen/wreck-draw.ts`), so the two cannot
   * disagree.
   */
  yaw = 0,
  /** …and WHAT is throwing them. Omitted is the hero's own wagon. */
  body: LightBody = CAR_LIGHT_BODY,
  /**
   * THE PERSON IN IT HAS BOTH FEET ON THE BRAKE (`DriveTraffic.brakeMs`) — so
   * the tail lamps are not a marker light any more, they are STOP lamps: full
   * brightness, reaching further back, and steady rather than flickering.
   *
   * It is the picture that explains the road's most deliberate collision. Put
   * the bumper in somebody's boot, lean on it, and the moment the wagon lifts
   * off the car in front lights up red and stops dead in the lane — which is
   * the whole beat, and without the lamps it reads as the car simply having
   * given up rather than as somebody standing on the middle pedal.
   */
  braking = false,
  /**
   * HOW MUCH OF THIS BEAM THE NIGHT WASH WILL TAKE BACK, as the multiplier that
   * cancels it — `1 / nightSurvival(state)` from the field's own pass, capped at
   * {@link MAX_NIGHT_BOOST}. 1 (the default) is the road and every venue with no
   * sky over it, where nothing is laid on top of the cone at all.
   */
  nightBoost = 1,
): void {
  const flicker = 0.88 + 0.12 * (Math.floor(timeMs / 90) % 2);
  const face = faceLeft ? -1 : 1;
  const boost = Math.max(1, Math.min(MAX_NIGHT_BOOST, nightBoost));
  // THE BODY'S OWN MEASUREMENTS, each written as the ratio it is, so a 48x26
  // body comes out at the hand-placed numbers and a 20x14 moped is lit like a
  // moped.
  const nosePx = body.halfPx - 1;
  const tailPx = body.halfPx - 2;
  // The base anchor pins the sprite's row h-2 to `at.y`, so a lamp burning
  // `liftPx` off the road is that many px above the seat.
  const liftPx = body.liftPx;
  // How far the light REACHES. It scales with the body rather than being fixed,
  // and that is not only tidiness: a scooter's headlamp genuinely throws a
  // shorter, narrower beam than a saloon's, and a fixed 42-px cone on a 20-px
  // machine reads as the bike towing a searchlight.
  const reachPx = Math.round(body.halfPx * 1.75);
  const tailReachPx = Math.round(body.halfPx * 0.625);
  const spread = body.liftPx / CAR_LIGHT_BODY.liftPx;
  const up = Math.round(10 * spread);
  const down = Math.round(14 * spread);
  const root = Math.max(1, Math.round(2 * spread));
  const foot = Math.max(2, Math.round(4 * spread));
  billboard(ctx, at.x, at.y, camera.x, camera.y, () => {
    const sx = at.x - camera.x;
    // …each end riding its own axle's drop, so a nose-down wreck's beam dips.
    const lampY = at.y - camera.y - liftPx;
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
    const noseX = sx + nosePx * face;
    const noseDip = Math.round(frontDrop);
    const tailDip = Math.round(rearDrop);
    if (!noseOut) {
      const beam = ctx.createLinearGradient(
        noseX,
        0,
        noseX + reachPx * face,
        0,
      );
      beam.addColorStop(0, `rgba(255, 242, 180, ${0.38 * flicker * boost})`);
      beam.addColorStop(0.6, `rgba(255, 232, 150, ${0.16 * flicker * boost})`);
      beam.addColorStop(1, "rgba(255, 232, 150, 0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(noseX, lampY + noseDip - root);
      // A pitched nose rakes the beam into the ground ahead of the car.
      ctx.lineTo(noseX + reachPx * face, lampY - up + noseDip * 3);
      ctx.lineTo(noseX + reachPx * face, lampY + down + noseDip * 3);
      ctx.lineTo(noseX, lampY + noseDip + foot);
      ctx.closePath();
      ctx.fill();
    }
    // The TAIL glow: a short red fan behind the car, dimmer and stubbier —
    // brake lamps, not a second pair of headlights.
    //
    // SKIPPED WITH AN `if`, NEVER WITH AN EARLY `return`, and that is a scar
    // rather than a style note. A car whose tail lamps the road has taken out
    // is very often a car something SPUN (a rear-ending does both at once), so
    // `tailOut` and a non-zero `yaw` arrive together — and a `return` here left
    // the yaw's `ctx.save()` on the stack with nothing to pop it. `endBillboard`
    // then popped THAT instead of its own, so the billboard's inverse projection
    // never came off and every body drawn after this one wore an extra one: the
    // hero's wagon, drawn last because it is nearest, came out a third taller
    // than it is (and two spun wrecks in one frame made it half again). The
    // symptom was "the car stretches sometimes", three lanes away from its
    // cause.
    if (!tailOut) {
      const tailX = sx - tailPx * face;
      // A lamp on the brake is brighter, longer and STEADY — the flicker is what
      // makes a marker light read as a filament seen through exhaust, and a stop
      // lamp is a thing somebody is holding on.
      const stopReachPx = braking ? Math.round(tailReachPx * 1.8) : tailReachPx;
      const glow = ctx.createLinearGradient(
        tailX,
        0,
        tailX - stopReachPx * face,
        0,
      );
      const lit = (braking ? 0.74 : 0.32 * flicker) * boost;
      glow.addColorStop(0, `rgba(255, 74, 58, ${lit})`);
      glow.addColorStop(1, "rgba(255, 74, 58, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(tailX, lampY + tailDip - root);
      ctx.lineTo(
        tailX - stopReachPx * face,
        lampY + tailDip - Math.round(6 * spread),
      );
      ctx.lineTo(
        tailX - stopReachPx * face,
        lampY + tailDip + Math.round(9 * spread),
      );
      ctx.lineTo(tailX, lampY + tailDip + foot);
      ctx.closePath();
      ctx.fill();
    }
    if (yaw !== 0) ctx.restore();
  });
}
