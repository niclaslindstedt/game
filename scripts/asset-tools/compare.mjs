// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The compare gate: a cheap numeric score for "how close is the rendered
// sprite to its reference image". It is a TRIAGE signal, not an acceptance
// test — the loop still leans on a vision
// critique and the human vote, because the reference is itself a lossy
// realization of the description (tier 2 < tier 1). Two numbers:
//   - meanDeltaE: average OKLab ΔE over cells both surfaces paint (0 = same),
//     the "are the colors right" read.
//   - ssim: structural similarity on luma (1 = identical), the "is the shape
//     right" read, robust to a uniform brightness/contrast shift.
// Alpha is folded in as a coverage penalty so a sprite that drops or invents
// pixels can't score a perfect structural match.

import { rgbToOklab } from "./oklab.mjs";
import { createSurface } from "./surface.mjs";

/** Nearest-neighbor resize of a surface to `w × h` (match sizes before compare). */
export function resizeNearest(surface, w, h) {
  const out = createSurface(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(
      surface.height - 1,
      Math.floor((y * surface.height) / h),
    );
    for (let x = 0; x < w; x++) {
      const sx = Math.min(
        surface.width - 1,
        Math.floor((x * surface.width) / w),
      );
      const si = (sy * surface.width + sx) * 4;
      const di = (y * w + x) * 4;
      out.data.set(surface.data.subarray(si, si + 4), di);
    }
  }
  return out;
}

/** Rec.601 luma (0–255) for a straight-alpha pixel; transparent reads as 0. */
const luma = (data, i) =>
  data[i + 3] === 0
    ? 0
    : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

/**
 * Global SSIM over the luma channel of two equal-size surfaces. A single
 * window is enough at sprite resolution — the sprite IS the window — and keeps
 * this dependency-free. Returns 1 for identical luma, lower as structure
 * diverges.
 */
function ssimLuma(a, b) {
  const n = a.width * a.height;
  let ma = 0;
  let mb = 0;
  for (let p = 0; p < n; p++) {
    ma += luma(a.data, p * 4);
    mb += luma(b.data, p * 4);
  }
  ma /= n;
  mb /= n;

  let va = 0;
  let vb = 0;
  let cov = 0;
  for (let p = 0; p < n; p++) {
    const da = luma(a.data, p * 4) - ma;
    const db = luma(b.data, p * 4) - mb;
    va += da * da;
    vb += db * db;
    cov += da * db;
  }
  va /= n;
  vb /= n;
  cov /= n;

  // Stabilizers from the SSIM paper, scaled to an 8-bit range (L = 255).
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  return (
    ((2 * ma * mb + c1) * (2 * cov + c2)) /
    ((ma * ma + mb * mb + c1) * (va + vb + c2))
  );
}

/**
 * Compare a rendered sprite surface against a reference surface. The reference
 * is resized (nearest) to the sprite's size first, so the sprite's pixel grid
 * is authoritative. Returns `{ ssim, meanDeltaE, coverage }`:
 *   - ssim 0..1 (structural, higher is better),
 *   - meanDeltaE ≥ 0 (perceptual color error over co-painted cells),
 *   - coverage 0..1 (share of cells where both agree on opaque/transparent).
 */
export function compareSurfaces(sprite, reference) {
  const ref =
    reference.width === sprite.width && reference.height === sprite.height
      ? reference
      : resizeNearest(reference, sprite.width, sprite.height);

  const n = sprite.width * sprite.height;
  let deltaSum = 0;
  let bothOpaque = 0;
  let agree = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const sa = sprite.data[i + 3] !== 0;
    const ra = ref.data[i + 3] !== 0;
    if (sa === ra) agree++;
    if (sa && ra) {
      const la = rgbToOklab([
        sprite.data[i],
        sprite.data[i + 1],
        sprite.data[i + 2],
      ]);
      const lb = rgbToOklab([ref.data[i], ref.data[i + 1], ref.data[i + 2]]);
      deltaSum += Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
      bothOpaque++;
    }
  }

  const coverage = agree / n;
  return {
    // Fold coverage into SSIM: a perfect-luma match that misplaces the
    // silhouette still can't read as identical.
    ssim: ssimLuma(sprite, ref) * coverage,
    meanDeltaE: bothOpaque ? deltaSum / bothOpaque : 0,
    coverage,
  };
}
