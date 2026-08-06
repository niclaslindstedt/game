// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PICTURE THE FIELD IS PRESENTED THROUGH — the three knobs on DEVELOPER →
// VISUALS, and the one thing that decides which mechanism each one uses.
//
// ALL THREE ARE CSS, AND THAT IS NOT AN ACCIDENT OF THE THREE THAT ARE LEFT.
// The game canvas is sized in WORLD units, not device pixels (`viewScaleFor`),
// and CSS blows it up 2–3× with `image-rendering: pixelated`. So there are two
// completely different places to put an effect, and the choice is not a matter
// of taste:
//
//   ON THE CANVAS — chunky, at world resolution, in the same pixel grid as the
//   art. That is where an effect belongs when the thing it acts on is the art
//   itself, and it costs a full-frame pass every frame on a phone.
//
//   IN CSS — smooth, at device resolution, and free. This is where the GRADE,
//   the VIGNETTE and the HAZE belong. All three are broad, low-frequency washes;
//   done on the canvas they would be nearest-upscaled into visible 2–3 px
//   staircase banding, and they would cost a full-frame composite every frame to
//   look WORSE. As CSS on the canvas element and one overlay they are
//   GPU-composited, per-frame-free, and smooth.
//
// A BLOOM PASS LIVED HERE AND WAS TAKEN OUT, which is the argument worth keeping
// rather than the code. It was the one knob that had to be on the canvas — the
// light it blooms is the game's own baked glow art (`glowSprite`, `beamSprite`,
// the loot shafts, the muzzle flashes) on that same pixel grid — and on pixel
// art at this size that is a losing trade whatever the threshold and the gain
// are tuned to: every luminance point a halo adds is a point of the artist's own
// shading it paints over, so the shafts gained a little atmosphere and the floor,
// the rocks and the bodies lost some of their drawing. It shipped at 0 for that
// reason, and a knob whose honest default is off is a knob the game is better
// off without. Don't bring it back; light the art instead.
//
// That is also why there is no WebGL pass here. A shader stage would have to own
// the whole present path (the world would move to an offscreen target and the
// visible canvas would become the GL one, which touches every screen↔world
// crossing in the app), and for three broad washes it would buy nothing — all
// three are strictly better in CSS. What a shader WOULD buy is the effects
// nobody has asked for yet — CRT curvature, chromatic aberration, a real 3D LUT
// — and that is the day to write it.
//
// This module is the shared model: the ranges, the defaults, and the CSS
// variables. It imports nothing, so the settings screen may read it without
// dragging the renderer in.

/** One knob's range. `off` is the value at which the effect does nothing at all
 * and must cost nothing — every consumer checks for it before doing any work. */
export type FxRange = { min: number; max: number; default: number };

/**
 * COLOUR GRADE — how far the picture is pushed toward its venue's own mood
 * (cooler and bluer on the moon, hotter on Mars), as contrast and saturation.
 *
 * Deliberately NOT a per-venue palette to author: it reads the same tint the
 * level's own ground already establishes, so a new venue needs nothing.
 */
export const GRADE: FxRange = { min: 0, max: 1.5, default: 0.6 };

/**
 * VIGNETTE — how much the corners fall off into the dark.
 *
 * The one effect here that is also a READABILITY tool: the hero is always at the
 * centre of the screen, so darkening the rim puts the light where the player is
 * looking. Kept modest by default — a heavy vignette in a game about being
 * surrounded hides the things surrounding you.
 */
export const VIGNETTE: FxRange = { min: 0, max: 1, default: 0.45 };

/**
 * DEPTH HAZE — aerial perspective: the floor fading as it rakes away toward the
 * top of the screen.
 *
 * This is the honest version of "blur the distant stuff". There is no depth to
 * focus on — the whole field is ONE ground plane and the hero is always at the
 * middle of it — so a real depth-of-field blur would blur a mob standing beside
 * him exactly as hard as one the same distance north, and hide half the horde
 * while it was at it. What genuinely reads as distance on a raked plane is
 * losing contrast toward the horizon, which is what this does.
 *
 * It is scaled by the PITCH at the draw site: a camera looking straight down has
 * no horizon to fade toward, and a haze that ignored that would fog the top of a
 * top-down screen for no reason.
 */
export const HAZE: FxRange = { min: 0, max: 1, default: 0.5 };

/** Every knob, for the settings page and the reset row. */
export const FX_RANGES = {
  colorGrade: GRADE,
  vignette: VIGNETTE,
  depthHaze: HAZE,
} as const;

export type FxName = keyof typeof FX_RANGES;

/** The live values, as the settings store holds them. */
export type FxSettings = Record<FxName, number>;

/** Clamp one knob to its own range. */
export function clampFx(name: FxName, value: number): number {
  const range = FX_RANGES[name];
  if (!Number.isFinite(value)) return range.default;
  return Math.min(range.max, Math.max(range.min, value));
}

/** The shipped look. */
export function defaultFx(): FxSettings {
  return {
    colorGrade: GRADE.default,
    vignette: VIGNETTE.default,
    depthHaze: HAZE.default,
  };
}

/**
 * THE CSS HALF, as custom properties to write on the game screen's root.
 *
 * Returned as plain numbers/strings rather than applied here so the caller owns
 * the DOM, and so this stays testable without a document.
 *
 * The grade is expressed as a `filter` string rather than three separate
 * variables because a filter LIST is order-dependent — saturate-then-contrast is
 * not contrast-then-saturate — and splitting it across variables would let a
 * stylesheet edit silently reorder it.
 */
export function fxStyleVars(
  fx: FxSettings,
  /** The live camera pitch (1 = straight down), which the haze scales by. */
  pitch: number,
): Record<string, string> {
  // A picture looking straight down has no horizon, so there is nothing for the
  // haze to fade toward: fade the effect out as the camera stands up.
  const rake = Math.min(1, Math.max(0, (1 - pitch) / 0.5));
  const haze = fx.depthHaze * rake;
  return {
    // `none` rather than a no-op filter chain: an identity `filter` still puts
    // the canvas on its own compositing layer, which on a phone costs real
    // memory for a picture that was going to look identical.
    "--fx-grade": fx.colorGrade > 0 ? gradeFilter(fx.colorGrade) : "none",
    "--fx-vignette": fx.vignette.toFixed(3),
    "--fx-haze": haze.toFixed(3),
  };
}

/**
 * The grade itself: a little more contrast and a little more colour, plus the
 * faintest cool cast.
 *
 * The numbers are deliberately small. This is the effect most able to make a
 * game look cheap — a heavy grade reads as an Instagram filter, and the pixel
 * art already has an authored palette that a strong push would fight. At the
 * shipped 0.6 the change is one a player would struggle to name and would miss
 * if it were gone, which is the whole target.
 */
function gradeFilter(amount: number): string {
  const contrast = (1 + 0.1 * amount).toFixed(3);
  const saturate = (1 + 0.18 * amount).toFixed(3);
  const brightness = (1 - 0.02 * amount).toFixed(3);
  return `saturate(${saturate}) contrast(${contrast}) brightness(${brightness})`;
}
