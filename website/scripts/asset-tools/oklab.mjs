// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// OKLab — a perceptually-uniform color space, the shared metric for sprite
// authoring from a reference image. Quantization (image → palette) clusters in
// OKLab so near-identical colors merge the way the eye groups them; the compare
// gate measures error in OKLab so "how far off is this pixel" tracks perception
// rather than raw RGB distance; and palette keys are assigned by OKLab
// lightness→hue so the emitted YAML is stable. Formulae from Björn Ottosson's
// reference (linear-sRGB → OKLab).

/** One 0–255 sRGB channel → linear light (0–1). */
function srgbToLinear(c) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/** One linear-light channel (0–1) → 0–255 sRGB, clamped. */
function linearToSrgb(x) {
  const c = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

/**
 * `[r,g,b]` (0–255 sRGB) → `[L, a, b]` OKLab. Alpha is ignored — callers gate
 * transparency separately.
 */
export function rgbToOklab([r, g, b]) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

/** `[L, a, b]` OKLab → `[r,g,b]` (0–255 sRGB), clamped back into gamut. */
export function oklabToRgb([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Euclidean distance between two OKLab colors — a perceptual ΔE. */
export function oklabDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * A stable sort key for a color: OKLab lightness first, then hue angle. Used
 * to assign single-char palette keys deterministically so the emitted YAML is
 * byte-stable across re-runs of the analyzer.
 */
export function labSortKey([L, a, b]) {
  // atan2 in [-π, π]; nudge into [0, 2π) so the ordering is monotone in hue.
  const hue = Math.atan2(b, a);
  return [L, hue < 0 ? hue + 2 * Math.PI : hue];
}
