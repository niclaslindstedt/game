// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MOMENT ITSELF — how the road slows down and leans in when a body can no
// longer be avoided.
//
// WHAT IT IS FOR. A drive books a body every second or two and every one of
// them is over in a frame: at 120 mph a person crosses the whole car in a
// sixteenth of a second, so what the player actually sees of the thing the
// entire minigame is built around is a red smear and a number going up. The
// hit is the joke's punchline and it was being delivered too fast to hear. So
// the world drops to a quarter speed for the length of one collision and the
// camera leans in on the wagon, and the burst that was a smear becomes a body
// coming apart over the bonnet.
//
// IT IS PACING, NOT PHYSICS, AND THE DIFFERENCE IS EXACT. Nothing here touches
// the simulation: the engine still ticks at its fixed 16 ms step and resolves
// exactly the collisions it would have resolved anyway. All this changes is HOW
// MUCH REAL TIME BUYS A STEP — the accumulator is fed dilated wall-clock ms —
// so a drive that spent half its length in slow motion arrives with the same
// bodies, the same wear and the same seed's road as one that did not. It just
// took longer to watch. (Which is a real cost, and the reason the trigger is
// mean: see `COOLDOWN_MS`.)
//
// WHEN, though, is the ENGINE's answer, not this file's — `inevitableHit`
// (src/game/drive/predict.ts) owns "can the wheel still get out of this",
// because that question is made of the car's lateral authority, the crowd's own
// velocity and the collision's geometry. This file only decides what an
// unavoidable hit is WORTH.

/** How far the world slows: a quarter speed at the bottom of the dip. */
const SLOW_SCALE = 0.25;
/**
 * How the moment is shaped, in REAL ms from the trigger.
 *
 * IN FAST, OUT SLOW. The drop has to land before the collision does or the
 * player watches the world slow down AFTER the thing it was slowing down for;
 * the climb back out is unhurried because a hard cut back to full speed reads
 * as a dropped frame. The hold is sized off the prediction's own lookahead
 * (0.22 s of sim time, which at a quarter speed is most of a second of real
 * one) plus enough of the aftermath to see the pieces leave.
 */
const FALL_MS = 90;
const HOLD_MS = 620;
const RISE_MS = 300;
const TOTAL_MS = FALL_MS + HOLD_MS + RISE_MS;
/**
 * …and how long after one ends before the road may do it again.
 *
 * THIS IS THE WHOLE TUNING PROBLEM. The road carries ten bodies per thousand
 * pixels and a fast driver meets one every second or so, so a slow-motion that
 * fired on every unavoidable hit would not be a punch — it would be the frame
 * rate. One moment every couple of seconds is roughly the rate an action film
 * uses its own, and it leaves the ordinary hits ordinary, which is what makes
 * the slow one land at all.
 */
const COOLDOWN_MS = 1500;

/**
 * How far the camera leans in at the bottom of the dip.
 *
 * MODEST ON PURPOSE. This is a pixel-art game drawn at an integer scale tier,
 * and a fractional zoom resamples every sprite in the frame — worth it for a
 * beat, ruinous as a way of life. 1.25 is enough to feel the frame close on
 * the car and little enough that the crowd two lanes ahead is still readable,
 * which matters: the player is still driving.
 */
const ZOOM_MAX = 1.25;

/** The drama's whole state — one moment, or none. */
export type DriveDrama = {
  /** Wall-clock ms the current moment started at, or null between them. */
  startedMs: number | null;
  /** Wall-clock ms before which a new moment may not start. */
  readyAtMs: number;
};

export function createDriveDrama(): DriveDrama {
  return { startedMs: null, readyAtMs: 0 };
}

/**
 * A hit that can no longer be avoided has been spotted — take the moment, if
 * the road is allowed one. Returns whether it did, so the caller can make the
 * noise that goes with it exactly once.
 */
export function armDrama(drama: DriveDrama, nowMs: number): boolean {
  if (drama.startedMs !== null) return false;
  if (nowMs < drama.readyAtMs) return false;
  drama.startedMs = nowMs;
  return true;
}

/** Everything the road throws away when the leg restarts. */
export function clearDrama(drama: DriveDrama): void {
  drama.startedMs = null;
  drama.readyAtMs = 0;
}

/**
 * How deep into the moment we are, 0 (not in one) → 1 (the bottom of the dip).
 *
 * Retires the moment on the way past its end, which is why this is the one
 * function the loop has to call every frame rather than only when it wants a
 * number.
 */
export function dramaDepth(drama: DriveDrama, nowMs: number): number {
  const started = drama.startedMs;
  if (started === null) return 0;
  const age = nowMs - started;
  if (age >= TOTAL_MS) {
    drama.startedMs = null;
    drama.readyAtMs = nowMs + COOLDOWN_MS;
    return 0;
  }
  if (age < FALL_MS) return smooth(age / FALL_MS);
  if (age < FALL_MS + HOLD_MS) return 1;
  return smooth(1 - (age - FALL_MS - HOLD_MS) / RISE_MS);
}

/** What a real millisecond is worth to the simulation right now. */
export function dramaTimeScale(depth: number): number {
  return 1 - (1 - SLOW_SCALE) * depth;
}

/** …and how far the camera has leaned in. */
export function dramaZoom(depth: number): number {
  return 1 + (ZOOM_MAX - 1) * depth;
}

/** A smoothstep, so the world leans into and out of the moment rather than
 * starting and stopping with a lurch. */
function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
