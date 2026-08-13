// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE HANDBRAKE LEAVES ON THE ROAD — two black lines behind the wheels,
// and the smoke coming off them.
//
// IT IS THE ONLY RECORD OF A DECISION. Everything else the road remembers is
// something that HAPPENED to somebody: the splash where a body landed, the smear
// where it was dragged, the paste where the wheels found it (`drive-gore.ts`).
// A skid is the one mark on this tarmac the driver made on purpose, and it is
// laid at the moment he decided not to go through whatever was in front of him —
// which is why it is worth drawing at all, and why it is NOT in the gore module
// beside the rest of the marks. A player who hauls on the lever and then looks
// in the mirror should see what it cost.
//
// THE ENGINE DECIDES WHETHER IT IS HAPPENING; this file decides what it looks
// like. `carSkidding(car)` is the one question — the lever up and the wagon
// still moving fast enough for locked wheels to show — asked once in the engine
// so the marks, the smoke and anything else that ever answers a stop can never
// disagree about when one started.
//
// WHERE IT SITS IN THE PICTURE: ON the tarmac and UNDER everything standing on
// it, which puts it in `drawDrive`'s projected pass rather than in the effect
// layer — the same lesson (and the same anchor trap) `drawRoadMarks` documents
// at length. The SMOKE is the other way round: it rises off the road, so it goes
// through the effect layer with the grit and the sparks.

import { CAR, carSkidding, type DriveState } from "@game/core";

import type { GoreRamp } from "../render/recolor.ts";
import { seatX, seatY } from "../render/shared.ts";
import type { Camera } from "../render/view.ts";
import { driveTyreSmoke, type DriveFxState } from "./drive-fx.ts";

/** One length of laid rubber: where it is, which way it runs, and how black it
 * went down. */
type SkidMark = {
  x: number;
  y: number;
  /** Which way it lies (radians) — a skid runs along the travel that laid it,
   * and a mark laid square on a road the car is crossing at the time is a decal
   * rather than a record. */
  angle: number;
  alpha: number;
};

/** The rubber on the road and the bookkeeping that lays it. */
export type SkidState = {
  marks: SkidMark[];
  /** Where the car was when the last pair went down, so the cadence is measured
   * in GROUND COVERED rather than in ticks — the rule every trail in this game
   * follows (the hero's bootprints, the wagon's bloody treads), because a mark
   * is a length of road rather than a moment. */
  at: { x: number; y: number } | null;
  /** Drive-clock ms the next puff of smoke is due at. Its own clock rather than
   * a puff per mark: the marks are laid by DISTANCE and smoke comes off a locked
   * tyre by TIME, so a car dragged down from 120 to a walk would otherwise smoke
   * hard at the start of the stop and stop smoking before it stopped moving. */
  smokeDueMs: number;
};

/** World px between one pair of marks and the next. Under a mark's own length,
 * so they overlap into a continuous line rather than a row of dashes — the same
 * figure the drag smears use, and for the same reason. */
const STEP_PX = 6;
/** How long one mark is drawn, and how wide (world px) — a tyre's contact patch,
 * stretched along the ground it covered. */
const MARK_LEN = 8;
const MARK_WIDE = 2;
/**
 * WHERE THE TWO TRACKS OF A PAIR ARE LAID, as offsets from the car's own line
 * (world px) — and the ONE answer every pair of tracks this road draws uses.
 *
 * IT IS EXPORTED BECAUSE THERE ARE TWO SUCH PAIRS and they are the same axle:
 * the rubber a handbrake scrubs off, and the tread prints a bloodied tyre lays
 * (`layTreads`, drive-gore.ts). A stop and a drive-through that disagreed about
 * where the back wheels are would be two different cars.
 *
 * THE PAIR IS NOT CENTRED ON THE CAR, AND THAT IS THE WHOLE OF WHY IT READS.
 * The wagon is drawn as a SIDE ELEVATION on a road drawn raked, so the only
 * wheels the player can see are the NEAR ones — the far pair is behind the
 * bodywork. Straddling `car.pos.y` therefore put neither track under a wheel:
 * the near one floated a few pixels clear of the tyres and the far one ran up
 * the face of the wheel it was supposed to have come off, which is exactly the
 * "those did not come from the car" read.
 *
 *   `TRACK_DROP_PX` puts the near track ON the contact patch the wheel art
 *   actually shows. `wheelSeat` (render/vehicles.ts) sits a wheel's bottom two
 *   SCREEN px below the car's seat, and the ground plane squashes world y by
 *   the pitch (0.75), so three world px is that two — do not "simplify" it to
 *   zero.
 *   `AXLE_GAUGE_PX` then puts the far track a full gauge FURTHER IN, where the
 *   far wheels are. Under the car it is hidden by the bodywork (the marks are
 *   drawn beneath every body on the road) and it emerges behind the wagon, so
 *   the trail is two tracks and the car is sitting on the near one.
 */
const TRACK_DROP_PX = -1;
const AXLE_GAUGE_PX = 12;

/** The pair, near track first. */
export const TRACK_OFFSETS_PX: readonly [number, number] = [
  TRACK_DROP_PX,
  TRACK_DROP_PX - AXLE_GAUGE_PX,
];
/** …and how far back from the body's centre they are laid: the REAR wheels'
 * own column, because a handbrake locks the back axle and nothing else. */
const REAR_ALONG = CAR.wheelOffsets[0] ?? -14;

/** How black one mark goes down, at the base and per unit of speed on top —
 * rubber comes off a tyre in proportion to how hard it is being scrubbed, so
 * the line a stop lays is darkest where it began and fades as the car comes
 * down. Nobody has to age anything: the mark is born as dark as it will ever
 * be, exactly as the blood marks are. */
const ALPHA_BASE = 0.22;
const ALPHA_FAST = 0.4;

/**
 * The most marks the road keeps.
 *
 * The OLDEST is dropped rather than a cell being capped, which is the opposite
 * of what the gore does one file over and is right for the opposite reason: a
 * blood mark is somewhere a player may drive back through, so the record has to
 * be bounded by the road's AREA, while a skid is laid behind a car on a road it
 * only ever travels once. Off the back of the camera is gone, so the bound that
 * matters is "enough for the mirror" — a couple of screens' worth at the top
 * end, and half a dozen full-lock stops before the first is forgotten.
 */
const MARK_MAX = 700;

/** How often a locked tyre lets go of a puff (drive-clock ms). */
const SMOKE_EVERY_MS = 55;

/** What laid rubber is: near-black with the road's own blue in it, so a skid
 * reads as burnt onto this tarmac rather than as a hole cut in it. */
const SKID_INK = "#141216";

/**
 * THE SAME RUBBER, AS A RAMP — what a TYRE-SHAPED mark is re-hued onto when the
 * road's marks are being re-dressed (`drawRoadMarks`, drive-gore.ts).
 *
 * SFW puts the road's whole record on the fairy ramp, and that is right for
 * everything a BODY left: a splash, a smear and a paste are all places somebody
 * came apart, and in this mode somebody comes apart into glitter. A TREAD PRINT
 * is not that. It is the shape of a tyre, and a tyre that has left a pastel
 * picture of itself on the tarmac reads as a decal — where the same print in
 * rubber reads as exactly what the player just did with the car. So the tread
 * goes dark and the mess stays bright.
 *
 * It lives here rather than in the gore module because THIS file owns what laid
 * rubber looks like on this tarmac, and two files each holding their own idea of
 * black is two files that will disagree. Three stops, darkest first, as a gore
 * family's own ramp is — a shade either side of `SKID_INK` so the print keeps
 * the tread pattern's own shading instead of going down as a flat blob.
 */
export const RUBBER_RAMP: GoreRamp = ["14, 13, 17", "26, 24, 30", "46, 43, 53"];

export function createSkids(): SkidState {
  return { marks: [], at: null, smokeDueMs: 0 };
}

/** Everything the road throws away when the leg restarts. */
export function clearSkids(state: SkidState): void {
  state.marks.length = 0;
  state.at = null;
  state.smokeDueMs = 0;
}

/**
 * ONE TICK OF A STOP — lay whatever rubber the car has scrubbed off since we
 * last looked, and let the tyres smoke while they are doing it.
 *
 * Called from `drainDrive`, inside the fixed step and on the drive's own clock,
 * so a slow frame lays the same line a fast one does and a paused road lays
 * none.
 */
export function stepSkids(
  state: SkidState,
  drive: DriveState,
  fx: DriveFxState,
  smoke = true,
): void {
  const { car } = drive;
  const at = state.at;
  // The anchor follows the car even while nothing is being laid, or the first
  // mark of the next stop would be drawn from wherever the last one ended —
  // half a road back, as one impossibly long streak.
  if (!at || !carSkidding(car)) {
    state.at = { x: car.pos.x, y: car.pos.y };
    state.smokeDueMs = drive.ms;
    return;
  }
  const speed = Math.abs(car.speed);
  const heat = Math.min(1, speed / (CAR.skidMinSpeed * 8));
  if (smoke && drive.ms >= state.smokeDueMs) {
    state.smokeDueMs = drive.ms + SMOKE_EVERY_MS;
    // Off the back axle, where the locked wheels are — never off the car's
    // centre, which would read as the engine going rather than the tyres.
    driveTyreSmoke(
      fx,
      car.pos.x + REAR_ALONG * drive.params.direction,
      car.pos.y,
      drive.ms,
      heat,
      drive.params.direction,
    );
  }
  const dx = car.pos.x - at.x;
  const dy = car.pos.y - at.y;
  const travelled = Math.hypot(dx, dy);
  if (travelled < STEP_PX) return;
  const angle = Math.atan2(dy, dx);
  const alpha = ALPHA_BASE + ALPHA_FAST * heat;
  // ALONG THE GROUND IT ACTUALLY COVERED. At the top end a tick is ten pixels
  // and a full-lock stop is a couple of hundred, so one mark per tick would be a
  // dotted line down the road rather than a skid.
  const steps = Math.min(6, Math.max(1, Math.round(travelled / STEP_PX)));
  const along = REAR_ALONG * drive.params.direction;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    for (const across of TRACK_OFFSETS_PX) {
      push(state, {
        x: at.x + dx * t + along,
        y: at.y + dy * t + across,
        angle,
        alpha,
      });
    }
  }
  state.at = { x: car.pos.x, y: car.pos.y };
}

function push(state: SkidState, mark: SkidMark): void {
  state.marks.push(mark);
  if (state.marks.length > MARK_MAX) state.marks.shift();
}

/**
 * THE RUBBER, DRAWN ON THE TARMAC.
 *
 * Called from inside `drawDrive`'s projected space, after the lane paint and
 * before the y-sorted bodies — so it lies UNDER the car that laid it and under
 * everybody standing on it. A PLAIN CAMERA SUBTRACT for the anchor, because
 * this pass runs inside the world projection; see `drawRoadMarks` for the full
 * account of what using the effect layer's anchor in here does.
 *
 * Drawn as a rect rather than a sprite, like the lane paint it lies across: a
 * skid is a length of flat colour with no detail in it at any scale this game
 * is played at, and authoring one would be authoring a grey rectangle.
 */
export function drawSkidMarks(
  ctx: CanvasRenderingContext2D,
  state: SkidState,
  camera: Camera,
  viewW: number,
): void {
  const left = camera.x - 64;
  const right = camera.x + viewW + 64;
  for (const mark of state.marks) {
    if (mark.x < left || mark.x > right) continue;
    ctx.save();
    ctx.globalAlpha = mark.alpha;
    ctx.fillStyle = SKID_INK;
    ctx.translate(seatX(mark.x, camera.x), seatY(mark.y, camera.y));
    ctx.rotate(mark.angle);
    ctx.fillRect(
      -Math.round(MARK_LEN / 2),
      -Math.round(MARK_WIDE / 2),
      MARK_LEN,
      MARK_WIDE,
    );
    ctx.restore();
  }
}
