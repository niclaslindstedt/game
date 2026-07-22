// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// View scale and camera: how many CSS px a world unit spans, and where the
// player-centered (level-clamped) view rect sits.

import { type GameState } from "@game/core";

/**
 * CSS pixels per world unit at the mobile-first baseline — the reference
 * landscape phone (see AGENTS.md). The app is tuned to this zoom.
 */
export const VIEW_SCALE = 2;

/**
 * Large screens (desktop, big tablets) render everything at 2× the phone
 * baseline so the phone-sized HUD, text, and sprites stay legible instead of
 * shrinking into a sea of moon. The DOM UI is bumped to match by doubling the
 * root font-size at the same breakpoint (styles.css) — keep the two in sync.
 * Gate on the *smaller* viewport dimension so only genuinely large screens
 * scale: a landscape phone (~390 tall) keeps the baseline; a desktop window
 * (≥700 in both axes) doubles.
 */
export const UI_SCALE_BREAKPOINT_PX = 700;

/** Extra zoom multiplier for a viewport (1 on phones, 2 on desktop). */
export function uiScaleFor(width: number, height: number): number {
  return Math.min(width, height) >= UI_SCALE_BREAKPOINT_PX ? 2 : 1;
}

/** World zoom (CSS px per world unit) for the given viewport. */
export function viewScaleFor(width: number, height: number): number {
  return VIEW_SCALE * uiScaleFor(width, height);
}

export type Camera = { x: number; y: number };

/**
 * The VICTORY QUAKE: while `state.quakeMs` burns (a level with an outro,
 * objective just cleared), the camera jitters a couple of world px on a fast
 * multi-frequency wobble — the whole world shaking itself apart under the
 * hero's feet. Amplitude in world units (doubled on screen by VIEW_SCALE);
 * driven by render time so it never touches the simulation.
 */
const QUAKE_AMPLITUDE = 2.5;

/** Top-left of the view rect: player-centered, clamped to the level. */
export function computeCamera(
  state: GameState,
  viewWidth: number,
  viewHeight: number,
  timeMs = 0,
): Camera {
  const clampAxis = (center: number, view: number, level: number) => {
    // A view larger than the level parks the level centered inside it.
    if (view >= level) return Math.round((level - view) / 2);
    return Math.round(Math.min(Math.max(center - view / 2, 0), level - view));
  };
  const camera = {
    x: clampAxis(state.player.pos.x, viewWidth, state.level.width),
    y: clampAxis(state.player.pos.y, viewHeight, state.level.height),
  };
  // Only the drawing pass passes a clock — the simulate pass's view rect
  // (enemy targeting) stays rock steady through the quake.
  if (state.quakeMs > 0 && timeMs > 0) {
    // Two incommensurate sine pairs read as a rumble, not a metronome.
    camera.x += Math.round(
      Math.sin(timeMs / 23) * QUAKE_AMPLITUDE +
        Math.sin(timeMs / 61) * QUAKE_AMPLITUDE * 0.6,
    );
    camera.y += Math.round(
      Math.cos(timeMs / 31) * QUAKE_AMPLITUDE +
        Math.cos(timeMs / 47) * QUAKE_AMPLITUDE * 0.6,
    );
  }
  return camera;
}
