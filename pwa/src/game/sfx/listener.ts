// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE THE PLAYER IS LISTENING FROM — the one piece of state that turns a
// position on an event into a pan and a trim.
//
// The listener is the LOCAL SEAT'S CAMERA (`Player.view`), not the hero's
// body, and that is the whole reason this reads as right rather than as
// seasick: the player is looking at a rectangle of world, so the sound stage
// is that rectangle. A hero pinned against the left edge of his own camera is
// still hearing the middle of the picture, and a kill at the right edge of the
// screen belongs hard right whether he is standing next to it or across it.
//
// Its own module rather than a field on the sfx barrel because two very
// different callers set and read it — the run's tick loop stamps it, and both
// `play.ts` and the footstep cue read it — and because it must be reachable
// from the INTERFACE's bank (`sfx/ui.ts`) without dragging the run's bank onto
// the startup path.

/**
 * The camera rect, structurally rather than as the engine's `ViewRect`.
 *
 * This module is deliberately IMPORT-FREE: it is read from the interface's
 * sound bank as well as the run's, and `sfx/ui.ts` sits on the app's startup
 * path where the critical-path budget is measured. One `import type` costs
 * nothing at runtime today, but it is an edge into `@game/core` on exactly the
 * module that must not have one — and `ViewRect` is four numbers.
 */
type CameraRect = { x: number; y: number; width: number; height: number };

/** The camera the local seat is looking through, or null when there is no run
 * (the menus) — where every sound is the interface's and plays centred. */
let view: CameraRect | null = null;

/**
 * Stamp the listener for this tick. Called from the run's tick reactions with
 * the LOCAL hero's own view — never seat 0's, or a joiner would hear the
 * host's screen.
 */
export function setListener(next: CameraRect | undefined | null): void {
  view = next ?? null;
}

/** Drop the listener — the run ended, so the world is no longer the stage. */
export function clearListener(): void {
  view = null;
}

/**
 * How far off-centre a sound may be panned. NOT 1: a hard-panned sound in
 * headphones is outside the player's head, and the picture it belongs to is
 * fifteen degrees wide. This is the width the 16-bit consoles' own stereo
 * mixes used for the same reason.
 */
const MAX_PAN = 0.75;

/**
 * How quiet a sound at the very edge of the picture gets. Gentle on purpose —
 * this is a stage, not a physical falloff, and everything the player can SEE
 * is something they are meant to hear. What it buys is depth, not distance.
 */
const EDGE_GAIN = 0.72;
/** …and how quiet one entirely off-screen gets, at the point it stops getting
 * quieter. Off-screen sounds still matter (the horde you have not turned to
 * face yet is exactly what audio is for), so this floor is not silence. */
const OFFSCREEN_GAIN = 0.45;

/** Beyond one screen-width out, distance stops meaning anything to a player
 * who cannot see it; the trim holds at `OFFSCREEN_GAIN` from here. */
const FALLOFF_SCREENS = 2;

/** A sound's place on the stage: how far to pan it, and how much to trim it. */
export type Placement = { pan: number; gain: number };

/** Centred and untrimmed — what a sound with no position, or no run, gets. */
const CENTRED: Placement = { pan: 0, gain: 1 };

/**
 * Place `pos` on the stage the local camera describes.
 *
 * Returns the centred placement rather than null when there is nothing to
 * place against, so a caller never has to branch: marking a sound spatial in a
 * mod must never be a way to make it inaudible in the menus, in a test, or on
 * the tick before the first view is stamped.
 */
export function place(pos: { x: number; y: number } | undefined): Placement {
  if (!pos || !view || view.width <= 0 || view.height <= 0) return CENTRED;
  const halfW = view.width / 2;
  const halfH = view.height / 2;
  // Offsets in SCREENS, so the stage is the same shape on a phone held
  // sideways and on a desktop — the whole point of the integer scale tiers is
  // that the player is shown the same picture, and they should hear it the
  // same way too.
  const dx = (pos.x - (view.x + halfW)) / halfW;
  const dy = (pos.y - (view.y + halfH)) / halfH;

  const pan = clamp(dx, -1, 1) * MAX_PAN;

  // Trim on the distance from the centre of the picture, measured in the same
  // screens — the farther corner of the view is one "screen" out, and the
  // falloff continues from there to the floor.
  const out = Math.hypot(dx, dy);
  const gain =
    out <= 1
      ? 1 - (1 - EDGE_GAIN) * out
      : EDGE_GAIN -
        (EDGE_GAIN - OFFSCREEN_GAIN) *
          Math.min(1, (out - 1) / (FALLOFF_SCREENS - 1));
  return { pan, gain };
}

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}
