// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// View scale and camera: how many CSS px a world unit spans, and where the
// player-centered (level-clamped) view rect sits.

import { type GameState } from "@game/menu";

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

/**
 * …and a THIRD tier for genuinely big monitors, which is not about legibility
 * but about HOW MUCH MAP THE PLAYER SEES.
 *
 * The view rect is the viewport divided by the zoom, so a fixed zoom hands a
 * bigger monitor a bigger slice of the world — and seeing further is a real
 * advantage in a game about being surrounded, not a cosmetic difference. The
 * phone baseline shows ~422×195 world units (≈82k units²). At the 2× tier a
 * 1440×900 laptop sees ≈81k — the same fight. A 2560×1440 monitor at that same
 * tier sees ≈230k, nearly THREE TIMES the moon, which is a different game.
 *
 * A third tier pulls that back: 2560×1440 at 3× sees ≈102k, within a quarter of
 * the phone. Gated at 1200 on the smaller axis so 1440p and up take it while
 * 1080p (≈130k at 2×, close enough) and every tablet stay where they are.
 *
 * Note this does NOT fully close the gap on a 4K panel: 3840×2160 lands at ≈230k
 * (2.8× the phone), though that is already down from 6.3× at the 2× tier. A
 * fourth tier is the same one-line addition here plus one media query —
 * deliberately not taken yet, since 4K desktop play is rare enough that the
 * 2×/3× pair is worth proving first.
 *
 * The tiers are also not monotonic: 1080p sits at the TOP of the 2× tier (1.57×
 * the phone) while 1440p sits near the bottom of the 3× (1.24×), so the smaller
 * monitor sees slightly more. Discrete tiers cannot avoid that without a
 * fractional zoom, and a fractional zoom resamples the pixel art — so it is
 * accepted, and pinned by a test so it stays a known oddity rather than a
 * surprise.
 *
 * The tiers stay INTEGERS on purpose: `VIEW_SCALE × uiScale` is the sprite
 * upscale factor, and a fractional one resamples pixel art into mush.
 */
export const UI_SCALE_3X_BREAKPOINT_PX = 1200;

/** Extra zoom multiplier for a viewport (1 on phones, 2 on desktop, 3 on a big
 * monitor). Keep every threshold in step with the root-font media queries in
 * styles.css — the world canvas and the DOM UI must scale together or the HUD
 * and the field disagree about how big a pixel is. */
export function uiScaleFor(width: number, height: number): number {
  const shortest = Math.min(width, height);
  if (shortest >= UI_SCALE_3X_BREAKPOINT_PX) return 3;
  return shortest >= UI_SCALE_BREAKPOINT_PX ? 2 : 1;
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

/**
 * A transient, app-side camera KICK — the jolt a lightning strike or a nuke
 * throws through the view, distinct from the sustained victory quake above
 * (which is engine state). It decays from `amp` world px to 0 over
 * `durationMs`, gated on the SIM clock so the shake fades in step with the
 * event that spawned it, while the oscillation rides the RENDER clock so it
 * buzzes smoothly. Purely cosmetic — it only offsets the draw camera, never
 * the simulate pass's view rect.
 */
export type CameraShake = { startMs: number; durationMs: number; amp: number };

/** A rested shake — no jolt in flight. */
export function createCameraShake(): CameraShake {
  return { startMs: -1, durationMs: 0, amp: 0 };
}

/**
 * Kill a jolt outright, wherever it is in its decay. Used when the run leaves
 * `playing` for a beat the camera must hold STILL through (the death scene):
 * the decay is gated on the SIM clock, which freezes with the simulation, so a
 * nuke or bolt still ringing when the hero falls would otherwise park at a
 * fixed amplitude and rattle the tableau for its whole eight seconds.
 */
export function clearCameraShake(shake: CameraShake): void {
  shake.startMs = -1;
  shake.durationMs = 0;
  shake.amp = 0;
}

/** The shake's live amplitude at `simMs` (linear decay), 0 once it's spent. */
function shakeAmplitude(shake: CameraShake, simMs: number): number {
  if (shake.startMs < 0 || shake.durationMs <= 0) return 0;
  const t = (simMs - shake.startMs) / shake.durationMs;
  if (t < 0 || t >= 1) return 0;
  return shake.amp * (1 - t);
}

/**
 * Kick the shake with a fresh jolt, keeping whichever of the current/new shake
 * has the greater amplitude RIGHT NOW — so a hard nuke overrides a fading bolt,
 * but a late faint bolt can't stomp a nuke still ringing the screen.
 */
export function kickCameraShake(
  shake: CameraShake,
  simMs: number,
  amp: number,
  durationMs: number,
): void {
  if (amp >= shakeAmplitude(shake, simMs)) {
    shake.startMs = simMs;
    shake.durationMs = durationMs;
    shake.amp = amp;
  }
}

/** Offset `camera` by the live shake — a no-op once the jolt is spent. */
export function applyCameraShake(
  camera: Camera,
  shake: CameraShake,
  simMs: number,
  timeMs: number,
): void {
  const a = shakeAmplitude(shake, simMs);
  if (a <= 0) return;
  // Two incommensurate sine pairs per axis read as a rattle, not a metronome —
  // the same trick as the quake, but faster and sharper for an impact.
  camera.x += Math.round(
    Math.sin(timeMs / 13) * a + Math.sin(timeMs / 29) * a * 0.5,
  );
  camera.y += Math.round(
    Math.cos(timeMs / 17) * a + Math.cos(timeMs / 37) * a * 0.5,
  );
}
